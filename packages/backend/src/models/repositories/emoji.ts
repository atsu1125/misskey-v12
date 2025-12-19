import { db } from '@/db/postgre.js';
import { Emoji } from '@/models/entities/emoji.js';
import { Packed } from '@/misc/schema.js';
import { sanitizeUrl } from '@/misc/sanitize-url.js';
import config from '@/config/index.js';
import { query, appendQuery } from '@/prelude/url.js';

export const EmojiRepository = db.getRepository(Emoji).extend({
	async pack(
		src: Emoji['id'] | Emoji,
	): Promise<Packed<'Emoji'>> {
		const emoji = typeof src === 'object' ? src : await this.findOneByOrFail({ id: src });

		let emojiUrl = sanitizeUrl(emoji.publicUrl || emoji.originalUrl);

		// リモートかつメディアプロキシ
		if ((emoji.publicUrl != null || emoji.originalUrl != null) && emoji.host != null && config.mediaProxy != null) {
			emojiUrl = appendQuery(config.mediaProxy, query({
				url: sanitizeUrl(emoji.publicUrl || emoji.originalUrl)!,
				emoji: 1,
			}));
		// リモートかつローカルプロキシ
		} else if ((emoji.publicUrl != null || emoji.originalUrl != null) && emoji.host != null && config.proxyRemoteFiles) {
			emojiUrl = `${config.url}/proxy/emoji.webp?${query({
				url: sanitizeUrl(emoji.publicUrl || emoji.originalUrl)!,
				emoji: 1,
			})}`;
		}

		return {
			id: emoji.id,
			aliases: emoji.aliases,
			name: emoji.name,
			category: emoji.category,
			host: emoji.host,
			// || emoji.originalUrl してるのは後方互換性のため
			url: sanitizeUrl(emojiUrl)!,
		};
	},

	packMany(
		emojis: any[],
	) {
		return Promise.all(emojis.map(x => this.pack(x)));
	},
});
