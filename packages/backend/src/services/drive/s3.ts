import { URL } from 'node:url';
import S3 from 'aws-sdk/clients/s3.js';
import { Meta } from '@/models/entities/meta.js';
import { getAgentByUrl } from '@/misc/fetch.js';
import config from '@/config/index.js';

export function getS3(meta: Meta) {
	const s3useSSL = config.enableS3Override ? config.s3!.useSSL : meta.objectStorageUseSSL;
	const s3endpoint = config.enableS3Override ? (config.s3!.endpoint || null) : (meta.objectStorageEndpoint || null);
	const s3accessKey = config.enableS3Override ? config.s3!.accessKey : meta.objectStorageAccessKey;
	const s3secretKey = config.enableS3Override ? config.s3!.secretKey : meta.objectStorageSecretKey;
	const s3region = config.enableS3Override ? (config.s3!.region || null) : (meta.objectStorageRegion || null);
	const s3optionsforcePathStyle = config.enableS3Override ? config.s3!.options.forcePathStyle : meta.objectStorageS3ForcePathStyle;
	const s3optionsuseProxy = config.enableS3Override ? config.s3!.options.useProxy : meta.objectStorageUseProxy;
	const u = s3endpoint != null
		? `${s3useSSL ? 'https://' : 'http://'}${s3endpoint}`
		: `${s3useSSL ? 'https://' : 'http://'}example.net`;

	return new S3({
		endpoint: s3endpoint || undefined,
		accessKeyId: s3accessKey!,
		secretAccessKey: s3secretKey!,
		region: s3region || undefined,
		sslEnabled: s3useSSL,
		s3ForcePathStyle: !s3endpoint	// AWS with endPoint omitted
			? false
			: s3optionsforcePathStyle,
		httpOptions: {
			agent: getAgentByUrl(new URL(u), !s3optionsuseProxy, true),
		},
	});
}
