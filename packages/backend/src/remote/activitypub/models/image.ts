import { uploadFromUrl } from '@/services/drive/upload-from-url.js';
import { CacheableRemoteUser, IRemoteUser } from '@/models/entities/user.js';
import Resolver from '../resolver.js';
import { fetchMeta } from '@/misc/fetch-meta.js';
import { apLogger } from '../logger.js';
import { DriveFile } from '@/models/entities/drive-file.js';
import { DriveFiles, Users } from '@/models/index.js';
import { truncate } from '@/misc/truncate.js';
import { DB_MAX_IMAGE_COMMENT_LENGTH } from '@/misc/hard-limits.js';
import { isDocument } from '../type.js';
import config from '@/config/index.js';

const logger = apLogger;

/**
 * Imageを作成します。
 */
export async function createImage(actor: CacheableRemoteUser, value: any): Promise<DriveFile | null | undefined> {
	// 投稿者が凍結されていたらスキップ
	if (actor.isSuspended) {
		throw new Error('actor has been suspended');
	}

	const image = await new Resolver().resolve(value) as any;

	if (!isDocument(image)) return null;

	if (image.url == null) {
		return null;
	}

	logger.info(`Creating the Image: ${image.url}`);

	const instance = await fetchMeta();

	const shouldlink = config.enableS3Override ? true : !instance.cacheRemoteFiles;

	let file = await uploadFromUrl({
		url: image.url,
		user: actor,
		uri: image.url,
		sensitive: image.sensitive,
		isLink: shouldlink,
		comment: truncate(image.name, DB_MAX_IMAGE_COMMENT_LENGTH)
	});

	if (file.isLink) {
		// URLが異なっている場合、同じ画像が以前に異なるURLで登録されていたということなので、
		// URLを更新する
		if (file.url !== image.url) {
			await DriveFiles.update({ id: file.id }, {
				url: image.url,
				uri: image.url,
			});

			file = await DriveFiles.findOneByOrFail({ id: file.id });
		}
	}

	return file;
}

/**
 * Imageを解決します。
 *
 * Misskeyに対象のImageが登録されていればそれを返し、そうでなければ
 * リモートサーバーからフェッチしてMisskeyに登録しそれを返します。
 */
export async function resolveImage(actor: CacheableRemoteUser, value: any): Promise<DriveFile | null | undefined> {
	// TODO: Misskeyに対象のImageが登録されていればそれを返す

	// リモートサーバーからフェッチしてきて登録
	return await createImage(actor, value);
}
