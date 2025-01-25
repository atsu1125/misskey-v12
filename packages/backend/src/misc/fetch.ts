import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import ipaddr from 'ipaddr.js';
import { URL } from 'node:url';
import CacheableLookup from 'cacheable-lookup';
import fetch, { RequestRedirect } from 'node-fetch';
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';
import config from '@/config/index.js';
import { isValidUrl } from './is-valid-url.js';

class HttpRequestServiceAgent extends http.Agent {
  constructor(private config: typeof config, options?: http.AgentOptions) {
    super(options);
  }

  public createConnection(
    options: net.NetConnectOpts,
    callback?: (err: unknown, stream: net.Socket) => void
  ): net.Socket {
    const socket = super.createConnection(options, callback).on('connect', () => {
      const address = socket.remoteAddress;
      if (process.env.NODE_ENV === 'production' && address && ipaddr.isValid(address)) {
        if (this.isPrivateIp(address)) {
          socket.destroy(new Error(`Blocked address: ${address}`));
        }
      }
    });
    return socket;
  }

  private isPrivateIp(ip: string): boolean {
    const parsedIp = ipaddr.parse(ip);

    for (const net of config.allowedPrivateNetworks ?? []) {
      const cidr = ipaddr.parseCIDR(net);
      if (parsedIp.kind() === cidr[0].kind() && parsedIp.match(cidr)) {
        return false;
      }
    }

    return parsedIp.range() !== 'unicast';
  }
}

class HttpsRequestServiceAgent extends https.Agent {
  constructor(private config: typeof config, options?: https.AgentOptions) {
    super(options);
  }

  public createConnection(
    options: net.NetConnectOpts,
    callback?: (err: unknown, stream: net.Socket) => void
  ): net.Socket {
    const socket = super.createConnection(options, callback).on('connect', () => {
      const address = socket.remoteAddress;
      if (process.env.NODE_ENV === 'production' && address && ipaddr.isValid(address)) {
        if (this.isPrivateIp(address)) {
          socket.destroy(new Error(`Blocked address: ${address}`));
        }
      }
    });
    return socket;
  }

  private isPrivateIp(ip: string): boolean {
    const parsedIp = ipaddr.parse(ip);

    for (const net of config.allowedPrivateNetworks ?? []) {
      const cidr = ipaddr.parseCIDR(net);
      if (parsedIp.kind() === cidr[0].kind() && parsedIp.match(cidr)) {
        return false;
      }
    }

    return parsedIp.range() !== 'unicast';
  }
}

export async function getJson(url: string, accept = 'application/json, */*', timeout = 10000, headers?: Record<string, string>) {
	const res = await getResponse({
		url,
		method: 'GET',
		headers: Object.assign({
			'User-Agent': config.userAgent,
			Accept: accept,
		}, headers || {}),
		timeout,
	});

	return await res.json();
}

export async function getHtml(url: string, accept = 'text/html, */*', timeout = 10000, headers?: Record<string, string>) {
	const res = await getResponse({
		url,
		method: 'GET',
		headers: Object.assign({
			'User-Agent': config.userAgent,
			Accept: accept,
		}, headers || {}),
		timeout,
	});

	return await res.text();
}

export async function getResponse(args: {
	url: string;
	method: string;
	body?: string;
	headers: Record<string, string>;
	timeout?: number;
	redirect?: RequestRedirect;
}) {
	if (!isValidUrl(args.url)) {
		throw new StatusError('Invalid URL', 400);
	}

	const timeout = args.timeout || 10 * 1000;

	const controller = new AbortController();
	setTimeout(() => {
		controller.abort();
	}, timeout * 6);

	const res = await fetch(args.url, {
		method: args.method,
		headers: args.headers,
		body: args.body,
		timeout,
		size: 10 * 1024 * 1024,
		agent: getAgentByUrl,
		signal: controller.signal,
		redirect: args.redirect,
	});

	if (args.redirect === 'manual' && [301, 302, 307, 308].includes(res.status)) {
		if (!isValidUrl(res.url)) {
			throw new StatusError('Invalid URL', 400);
		}
		return res;
	}

	if (!res.ok) {
		throw new StatusError(`${res.status} ${res.statusText}`, res.status, res.statusText);
	}

	return res;
}

const cache = new CacheableLookup({
	maxTtl: 3600,	// 1hours
	errorTtl: 30,	// 30secs
	lookup: false,	// nativeのdns.lookupにfallbackしない
});

const agentOption = {
	keepAlive: true,
	keepAliveMsecs: 30 * 1000,
	lookup: cache.lookup,
};

/**
 * Get http non-proxy agent (without local address filtering)
 */

const httpNative = new http.Agent(agentOption);

/**
 * Get https non-proxy agent (without local address filtering)
 */
const httpsNative = new https.Agent(agentOption);

/**
 * Get http non-proxy agent
 */
const _http = new HttpRequestServiceAgent(config, agentOption);

/**
 * Get https non-proxy agent
 */
const _https = new HttpsRequestServiceAgent(config, agentOption);

const maxSockets = Math.max(256, config.deliverJobConcurrency || 128);

/**
 * Get http proxy or non-proxy agent
 */
export const httpAgent = config.proxy
	? new HttpProxyAgent({
		keepAlive: true,
		keepAliveMsecs: 30 * 1000,
		maxSockets,
		maxFreeSockets: 256,
		scheduling: 'lifo',
		proxy: config.proxy,
	})
	: _http;

/**
 * Get https proxy or non-proxy agent
 */
export const httpsAgent = config.proxy
	? new HttpsProxyAgent({
		keepAlive: true,
		keepAliveMsecs: 30 * 1000,
		maxSockets,
		maxFreeSockets: 256,
		scheduling: 'lifo',
		proxy: config.proxy,
	})
	: _https;

/**
 * Get agent by URL
 * @param url URL
 * @param bypassProxy Allways bypass proxy
 */
export function getAgentByUrl(url: URL, bypassProxy = false, isLocalAddressAllowed = false) {
	if (bypassProxy || (config.proxyBypassHosts || []).includes(url.hostname)) {
    if (isLocalAddressAllowed) {
      return url.protocol === 'http:' ? httpNative : httpsNative;
    }
		return url.protocol === 'http:' ? _http : _https;
	} else {
    if (isLocalAddressAllowed && (!config.proxy)) {
      return url.protocol === 'http:' ? httpNative : httpsNative;
    }
		return url.protocol === 'http:' ? httpAgent : httpsAgent;
	}
}

export class StatusError extends Error {
	public statusCode: number;
	public statusMessage?: string;
	public isClientError: boolean;

	constructor(message: string, statusCode: number, statusMessage?: string) {
		super(message);
		this.name = 'StatusError';
		this.statusCode = statusCode;
		this.statusMessage = statusMessage;
		this.isClientError = typeof this.statusCode === 'number' && this.statusCode >= 400 && this.statusCode < 500;
	}
}
