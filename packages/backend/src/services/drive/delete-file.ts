import { DriveFile } from '@/models/entities/drive-file.js';
import { InternalStorage } from './internal-storage.js';
import { DriveFiles, Instances, Emojis } from '@/models/index.js';
import { driveChart, perUserDriveChart, instanceChart } from '@/services/chart/index.js';
import { createDeleteObjectStorageFileJob } from '@/queue/index.js';
import { fetchMeta } from '@/misc/fetch-meta.js';
import { getS3 } from './s3.js';
import { v4 as uuid } from 'uuid';
import { IsNull } from 'typeorm';
import config from '@/config/index.js';

export async function deleteFile(file: DriveFile, isExpired = false) {
	if (file.webpublicUrl != null) {
		let emojis = await Emojis.findOneBy({
			host: IsNull(),
			publicUrl: file.webpublicUrl,
		});
		if (emojis != null) {
			await DriveFiles.update({ id: file.id }, {
				user: null,
			});
			return; // emojiのpublicUrlがfileに含まれている場合は所有ユーザーをnullにして終了
		}
	} else if (file.url != null) {
		let emojis = await Emojis.findOneBy({
			host: IsNull(),
			publicUrl: file.url,
		});
		if (emojis != null) {
			await DriveFiles.update({ id: file.id }, {
				user: null,
			});
			return; // emojiのpublicUrlがfileに含まれている場合は所有ユーザーをnullにして終了
		}
	}

	if (file.storedInternal) {
		InternalStorage.del(file.accessKey!);

		if (file.thumbnailUrl) {
			InternalStorage.del(file.thumbnailAccessKey!);
		}

		if (file.webpublicUrl) {
			InternalStorage.del(file.webpublicAccessKey!);
		}
	} else if (!file.isLink) {
		createDeleteObjectStorageFileJob(file.accessKey!);

		if (file.thumbnailUrl) {
			createDeleteObjectStorageFileJob(file.thumbnailAccessKey!);
		}

		if (file.webpublicUrl) {
			createDeleteObjectStorageFileJob(file.webpublicAccessKey!);
		}
	}

	postProcess(file, isExpired);
}

export async function deleteFileSync(file: DriveFile, isExpired = false) {
	if (file.webpublicUrl != null) {
		let emojis = await Emojis.findOneBy({
			host: IsNull(),
			publicUrl: file.webpublicUrl,
		});
		if (emojis != null) {
			await DriveFiles.update({ id: file.id }, {
				user: null,
			});
			return; // emojiのpublicUrlがfileに含まれている場合は所有ユーザーをnullにして終了
		}
	} else if (file.url != null) {
		let emojis = await Emojis.findOneBy({
			host: IsNull(),
			publicUrl: file.url,
		});
		if (emojis != null) {
			await DriveFiles.update({ id: file.id }, {
				user: null,
			});
			return; // emojiのpublicUrlがfileに含まれている場合は所有ユーザーをnullにして終了
		}
	}

	if (file.storedInternal) {
		InternalStorage.del(file.accessKey!);

		if (file.thumbnailUrl) {
			InternalStorage.del(file.thumbnailAccessKey!);
		}

		if (file.webpublicUrl) {
			InternalStorage.del(file.webpublicAccessKey!);
		}
	} else if (!file.isLink) {
		const promises = [];

		promises.push(deleteObjectStorageFile(file.accessKey!));

		if (file.thumbnailUrl) {
			promises.push(deleteObjectStorageFile(file.thumbnailAccessKey!));
		}

		if (file.webpublicUrl) {
			promises.push(deleteObjectStorageFile(file.webpublicAccessKey!));
		}

		await Promise.all(promises);
	}

	await postProcess(file, isExpired);
}

async function postProcess(file: DriveFile, isExpired = false) {
	// リモートファイル期限切れ削除後は直リンクにする
	if (isExpired && file.userHost !== null && file.uri != null) {
		await DriveFiles.update(file.id, {
			isLink: true,
			url: file.uri,
			thumbnailUrl: null,
			webpublicUrl: null,
			storedInternal: false,
			// ローカルプロキシ用
			accessKey: uuid(),
			thumbnailAccessKey: 'thumbnail-' + uuid(),
			webpublicAccessKey: 'webpublic-' + uuid(),
		});
	} else {
		await DriveFiles.delete(file.id);
	}

	// 統計を更新
	driveChart.update(file, false);
	perUserDriveChart.update(file, false);
	if (file.userHost !== null) {
		instanceChart.updateDrive(file, false);
	}
}

export async function deleteObjectStorageFile(key: string) {
	const meta = await fetchMeta();

	const s3 = getS3(meta);

	const s3bucket = config.enableS3Override ? config.s3!.bucket! : meta.objectStorageBucket!;

	await s3.deleteObject({
		Bucket: s3bucket!,
		Key: key,
	}).promise();
}
