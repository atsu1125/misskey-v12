import * as fs from 'node:fs';
import * as stream from 'node:stream';
import * as util from 'node:util';
import got, * as Got from 'got';
import { parse } from 'content-disposition';
import { getAgentByUrl, httpAgent, httpsAgent, StatusError } from './fetch.js';
import config from '@/config/index.js';
import chalk from 'chalk';
import Logger from '@/services/logger.js';
import ipaddr from 'ipaddr.js';
import { isValidUrl } from "./is-valid-url.js";

const pipeline = util.promisify(stream.pipeline);

export async function downloadUrl(url: string, path: string): Promise<{
		filename: string;
	}> {
	if (!isValidUrl(url)) {
		throw new StatusError('Invalid URL', 400);
	}

	const logger = new Logger('download');

	logger.info(`Downloading ${chalk.cyan(url)} ...`);

	const timeout = 30 * 1000;
	const operationTimeout = 60 * 1000;
	const maxSize = config.maxFileSize || 262144000;

	const urlObj = new URL(url);
	let filename = urlObj.pathname.split('/').pop() ?? 'untitled';

	const req = got
		.stream(url, {
			headers: {
				'User-Agent': config.userAgent,
			},
			timeout: {
				lookup: timeout,
				connect: timeout,
				secureConnect: timeout,
				socket: timeout,	// read timeout
				response: timeout,
				send: timeout,
				request: operationTimeout,	// whole operation timeout
			},
			agent: {
				http: getAgentByUrl(new URL(url)),
				https: getAgentByUrl(new URL(url)) as any,
			},
			http2: false,	// default
			retry: {
				limit: 0,
			},
		})
		.on('redirect', (res: Got.Response, opts: Got.NormalizedOptions) => {
			if (!isValidUrl(opts.url)) {
				logger.warn(`Invalid URL: ${opts.url}`);
				req.destroy();
			}
		})
		.on('response', (res: Got.Response) => {
			if ((process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') && !config.proxy && res.ip) {
				if (isPrivateIp(res.ip)) {
					logger.warn(`Blocked address: ${res.ip}`);
				req.destroy();
			}
		}

		const contentLength = res.headers['content-length'];
		if (contentLength != null) {
			const size = Number(contentLength);
			if (size > maxSize) {
				logger.warn(`maxSize exceeded (${size} > ${maxSize}) on response`);
				req.destroy();
			}
		}
		const contentDisposition = res.headers['content-disposition'];
		if (contentDisposition != null) {
			try {
				const parsed = parse(contentDisposition);
				if (parsed.parameters.filename) {
					filename = parsed.parameters.filename;
				}
			} catch (e) {
				logger.warn(`Failed to parse content-disposition: ${contentDisposition}`, { stack: e });
			}
		}
	}).on('downloadProgress', (progress: Got.Progress) => {
		if (progress.transferred > maxSize) {
			logger.warn(`maxSize exceeded (${progress.transferred} > ${maxSize}) on downloadProgress`);
			req.destroy();
		}
	});

	try {
		await pipeline(req, fs.createWriteStream(path));
	} catch (e) {
		if (e instanceof Got.HTTPError) {
			throw new StatusError(`${e.response.statusCode} ${e.response.statusMessage}`, e.response.statusCode, e.response.statusMessage);
		} else {
			throw e;
		}
	}

	logger.succ(`Download finished: ${chalk.cyan(url)}`);

	return {
		filename,
	};
}

function isPrivateIp(ip: string): boolean {
	const parsedIp = ipaddr.parse(ip);
	for (const net of config.allowedPrivateNetworks || []) {
		const cidr = ipaddr.parseCIDR(net);
		if (cidr[0].kind() === parsedIp.kind() && parsedIp.match(ipaddr.parseCIDR(net))) {
			return false;
		}
	}

	return parsedIp.range() !== 'unicast';
}
