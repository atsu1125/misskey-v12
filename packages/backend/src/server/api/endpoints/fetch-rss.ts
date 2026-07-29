import Parser from 'rss-parser';
import { getResponse } from '@/misc/fetch.js';
import config from '@/config/index.js';
import define from '../define.js';
import { ApiError } from '../error.js';

const MAX_URL_LENGTH = 8192;
const MAX_RESPONSE_SIZE = 1024 * 1024;
const MAX_CONCURRENT_REQUESTS = 32;

const inFlightRequests = new Map<
	string,
	Promise<Awaited<ReturnType<Parser['parseString']>>>
>();

let activeRequestCount = 0;

export const meta = {
	tags: ['meta'],

	requireCredential: false,
	allowGet: true,
	cacheSec: 60 * 3,

	limit: {
		duration: 60 * 1000,
		max: 300,
	},

	errors: {
		invalidUrl: {
			message: 'Invalid URL.',
			code: 'INVALID_URL',
			id: '89b7ee05-ccfc-4bdd-9b13-61172fd1e06c',
			httpStatusCode: 400,
		},
		fetchRssFailed: {
			message: 'Failed to fetch RSS.',
			code: 'FETCH_RSS_FAILED',
			id: '8db5d3d8-31d7-452f-b0cc-ca3b8925de12',
			kind: 'server',
			httpStatusCode: 422,
		},
		fetchRssUnavailable: {
			message: 'RSS fetching is temporarily unavailable.',
			code: 'FETCH_RSS_UNAVAILABLE',
			id: '91e6ff44-c63f-4725-9ad0-b7a40d7f7655',
			kind: 'server',
			httpStatusCode: 503,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		url: { type: 'string' },
	},
	required: ['url'],
} as const;

// eslint-disable-next-line import/no-default-export
export default define(meta, paramDef, async (ps) => {
	const url = normalizeUrl(ps.url);

	const inFlightRequest = inFlightRequests.get(url);
	if (inFlightRequest != null) {
		return await inFlightRequest;
	}

	if (activeRequestCount >= MAX_CONCURRENT_REQUESTS) {
		throw new ApiError(meta.errors.fetchRssUnavailable);
	}

	activeRequestCount++;

	const request = fetchRss(url)
		.catch(() => {
			throw new ApiError(meta.errors.fetchRssFailed);
		})
		.finally(() => {
			inFlightRequests.delete(url);
			activeRequestCount--;
		});

	inFlightRequests.set(url, request);

	return await request;
});

function normalizeUrl(input: string): string {
	if (input.length === 0 || input.length > MAX_URL_LENGTH) {
		throw new ApiError(meta.errors.invalidUrl);
	}

	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw new ApiError(meta.errors.invalidUrl);
	}

	if (
		(url.protocol !== 'http:' && url.protocol !== 'https:') ||
		url.username !== '' ||
		url.password !== ''
	) {
		throw new ApiError(meta.errors.invalidUrl);
	}

	url.hash = '';
	return url.href;
}

async function fetchRss(url: string): Promise<Awaited<ReturnType<Parser['parseString']>>> {
	const res = await getResponse({
		url: url,
		method: 'GET',
		headers: Object.assign({
			'User-Agent': config.userAgent,
			Accept: 'application/rss+xml, */*',
		}),
		timeout: 5000,
		size: MAX_RESPONSE_SIZE,
	});

	const finalUrl = new URL(res.url);
	if (finalUrl.protocol !== 'http:' && finalUrl.protocol !== 'https:') {
		throw new Error('Invalid final URL protocol');
	}

	const text = await res.text();

	const rssParser = new Parser({
		xml2js: {
			async: true,
		},
	});

	return await rssParser.parseString(text);
}
