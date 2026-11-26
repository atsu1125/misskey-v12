import Channel from '../channel.js';
import { Notes } from '@/models/index.js';
import { normalizeTag } from '@/misc/normalize-tag.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { Packed } from '@/misc/schema.js';

export default class extends Channel {
	public readonly chName = 'hashtag';
	public static shouldShare = false;
	public static requireCredential = false;
	private q: string[][];

	constructor(id: string, connection: Channel['connection']) {
		super(id, connection);
		this.onNote = this.onNote.bind(this);
	}

	public async init(params: JsonObject): Promise<boolean> {
		if (!Array.isArray(params.q)) return false;
		if (!params.q.every((x): x is string[] => (
			Array.isArray(x) &&
			x.length >= 1 &&
			x.every(y => typeof y === 'string' && Array.from(y).length <= 128)
		))) return false;

		this.q = params.q.map(tags => tags.map(tag => normalizeTag(tag)));

		// Subscribe stream
		this.subscriber.on('notesStream', this.onNote);
	}

	private async onNote(note: Packed<'Note'>) {
		if (note.isHidden) return;
		const noteTags = note.tags ? note.tags.map((t: string) => t.toLowerCase()) : [];
		const matched = this.q.some(tags => tags.every(tag => noteTags.includes(tag)));
		if (!matched) return;

		// Renoteなら再pack
		if (note.renoteId != null) {
			note.renote = await Notes.pack(note.renoteId, this.user, {
				detail: true,
			});
		}

		// 流れてきたNoteがミュートしているユーザーが関わるものだったら無視する
		if (isUserRelated(note, this.muting)) return;
		// 流れてきたNoteがブロックされているユーザーが関わるものだったら無視する
		if (isUserRelated(note, this.blocking)) return;

		this.connection.cacheNote(note);

		this.send('note', note);
	}

	public dispose() {
		// Unsubscribe events
		this.subscriber.off('notesStream', this.onNote);
	}
}
