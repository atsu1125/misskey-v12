import Resolver from '../../resolver.js';
import post from '@/services/note/create.js';
import { CacheableRemoteUser } from '@/models/entities/user.js';
import { IAnnounce, getApId } from '../../type.js';
import { fetchNote, resolveNote } from '../../models/note.js';
import { apLogger } from '../../logger.js';
import { extractDbHost } from '@/misc/convert-host.js';
import { fetchMeta } from '@/misc/fetch-meta.js';
import { getApLock } from '@/misc/app-lock.js';
import { parseAudience } from '../../audience.js';
import { StatusError } from '@/misc/fetch.js';
import { isRelayActor } from '@/services/relay.js';
import { publishNotesStream } from '@/services/stream.js';
import { Notes } from '@/models/index.js';

const logger = apLogger;

/**
 * アナウンスアクティビティを捌きます
 */
export default async function(resolver: Resolver, actor: CacheableRemoteUser, activity: IAnnounce, targetUri: string): Promise<void> {
	// アナウンサーが凍結されていたらスキップ
	if (actor.isSuspended) {
		return;
	}

	// リレーからのAnnounceかチェック
	const fromRelay = await isRelayActor(actor);
	const uri = getApId(fromRelay ? target : activity);

	// アナウンス先をブロックしてたら中断
	const meta = await fetchMeta();
	if (meta.blockedHosts.some(x => extractDbHost(uri).endsWith(x))) return;

	const activityUri = getApId(activity);
	const unlock = await getApLock(activityUri);

	try {
		// 既に同じURIを持つものが登録されていないかチェック
		const exist = await fetchNote(uri);
		if (exist) {
			return;
		}

		// Announce対象をresolve
		let renote;
		try {
			renote = await resolveNote(targetUri);
		} catch (e) {
			// 対象が4xxならスキップ
			if (e instanceof StatusError) {
				if (e.isClientError) {
					logger.warn(`Ignored announce target ${targetUri} - ${e.statusCode}`);
					return;
				}

				logger.warn(`Error in announce target ${targetUri} - ${e.statusCode || e}`);
			}
			throw e;
		}

		if (!await Notes.isVisibleForMe(renote, actor.id)) return 'skip: invalid actor for this activity';
		
		// リレーからのAnnounceはリノートを作成せず、ノートを直接公開する
		if (fromRelay) {
			logger.info(`Publishing relay-delivered note: ${uri}`);
			const noteObj = await Notes.pack(renote, null, { skipHide: true });
			publishNotesStream(noteObj);
			return;
		}

		logger.info(`Creating the (Re)Note: ${uri}`);

		const activityAudience = await parseAudience(actor, activity.to, activity.cc);

		await post(actor, {
			createdAt: activity.published ? new Date(activity.published) : null,
			renote,
			visibility: activityAudience.visibility,
			visibleUsers: activityAudience.visibleUsers,
			uri,
		});
	} finally {
		unlock();
	}
}
