import { URL } from 'node:url';
import Bull from 'bull';
import request from '@/remote/activitypub/request.js';
import { registerOrFetchInstanceDoc } from '@/services/register-or-fetch-instance-doc.js';
import Logger from '@/services/logger.js';
import { Instances } from '@/models/index.js';
import { apRequestChart, federationChart, instanceChart } from '@/services/chart/index.js';
import { fetchInstanceMetadata } from '@/services/fetch-instance-metadata.js';
import { fetchMeta } from '@/misc/fetch-meta.js';
import { toPuny } from '@/misc/convert-host.js';
import { Cache } from '@/misc/cache.js';
import { Instance } from '@/models/entities/instance.js';
import { DeliverJobData } from '../types.js';
import { StatusError } from '@/misc/fetch.js';

const logger = new Logger('deliver');

type StoplightState = 'blue' | 'yellow' | 'red';

interface StoplightStatus {
	state: StoplightState;
	failureCount: number;
	lastFailure: number;
	redUntil?: number;
}

const stoplightMap = new Map<string, StoplightStatus>();

function canDeliverToHost(host: string): boolean {
	const status = stoplightMap.get(host);
	const now = Date.now();

	if (!status) return true;

	if (status.state === 'red') {
		if (status.redUntil && now > status.redUntil) {
			// Expire Red State → Turn Yellow and Decrement 1 count
			stoplightMap.set(host, { state: 'yellow', failureCount: 9 });
			return true;
		}
		return false; // Red State
	}

	return true;
}

function reportDeliveryResult(host: string, success: boolean) {
	const now = Date.now();
	const status = stoplightMap.get(host) ?? { state: 'blue', failureCount: 0, lastFailure: 0 };

	if (success) {
		if (status.state !== 'blue') {
			stoplightMap.set(host, { state: 'blue', failureCount: 0, lastFailure: 0 });
		}
		return;
	}

	// if fails
	// Increment 1 count
	let failureCount = status.failureCount + 1;

	if (status.state === 'blue') {
		stoplightMap.set(host, { state: 'yellow', failureCount, lastFailure: now });
	} else if (status.state === 'yellow' && failureCount >= 10) {
		stoplightMap.set(host, {
			state: 'red',
			failureCount,
			lastFailure: now,
			redUntil: now + 1000 * 60 * 1 // 1 minute
		});
	} else {
		// (Yellow State and failureCount is less than 10) Or Red State
		stoplightMap.set(host, { ...status, failureCount, lastFailure: now });
	}
}

let latest: string | null = null;

const suspendedHostsCache = new Cache<Instance[]>(1000 * 60 * 60);

export default async (job: Bull.Job<DeliverJobData>) => {
	const { host } = new URL(job.data.to);

	// ブロックしてたら中断
	const meta = await fetchMeta();
	if (meta.blockedHosts.some(x => toPuny(host).endsWith(x))) {
		return 'skip (blocked)';
	}

	// isSuspendedなら中断
	let suspendedHosts = suspendedHostsCache.get(null);
	if (suspendedHosts == null) {
		suspendedHosts = await Instances.find({
			where: {
				isSuspended: true,
			},
		});
		suspendedHostsCache.set(null, suspendedHosts);
	}
	if (suspendedHosts.map(x => x.host).includes(toPuny(host))) {
		return 'skip (suspended)';
	}

	if (!canDeliverToHost(host)) {
    throw `[STOPLIGHT] Delivery to ${host} is blocked (RED)`;
  }

	try {
		if (latest !== (latest = JSON.stringify(job.data.content, null, 2))) {
			logger.debug(`delivering ${latest}`);
		}

		await request(job.data.user, job.data.to, job.data.content, job.data.digest);

		// Update stats
		registerOrFetchInstanceDoc(host).then(i => {
			Instances.update(i.id, {
				latestRequestSentAt: new Date(),
				latestStatus: 200,
				lastCommunicatedAt: new Date(),
				isNotResponding: false,
			});

			fetchInstanceMetadata(i);

			instanceChart.requestSent(i.host, true);
			apRequestChart.deliverSucc();
			federationChart.deliverd(i.host, true);
		});

		reportDeliveryResult(host, true);

		return 'Success';
	} catch (res) {
		// Update stats
		registerOrFetchInstanceDoc(host).then(i => {
			Instances.update(i.id, {
				latestRequestSentAt: new Date(),
				latestStatus: res instanceof StatusError ? res.statusCode : null,
				isNotResponding: true,
			});

			// 一定期間配送エラーなら配送を停止する
			const faildays = 1000 * 60 * 60 * 24 * 7; // 7日前まで許容
			if (i.lastCommunicatedAt.getTime() && (i.lastCommunicatedAt.getTime() < (Date.now() - faildays))) {
				Instances.update(i.id, {
					isSuspended: true,
				});
			}

			instanceChart.requestSent(i.host, false);
			apRequestChart.deliverFail();
			federationChart.deliverd(i.host, false);
		});

		reportDeliveryResult(host, false);

		if (res instanceof StatusError) {
			// 4xx
			if (res.isClientError) {
				// 401,408,429がどうもpermanent errorじゃなさそう
				if (res.statusCode === 401 || res.statusCode === 408 || res.statusCode === 429) {
					throw `${res.statusCode} ${res.statusMessage}`;
				}

				// HTTPステータスコード4xxはクライアントエラーであり、それはつまり
				// 何回再送しても成功することはないということなのでエラーにはしないでおく
				return `${res.statusCode} ${res.statusMessage}`;
			}

			// ただし501は成功することはない
			if (res.statusCode === 501) {
				return `${res.statusCode} ${res.statusMessage}`;
			}

			// 5xx etc.
			throw `${res.statusCode} ${res.statusMessage}`;
		} else {
			// DNS error, socket error, timeout ...
			throw res;
		}
	}
};
