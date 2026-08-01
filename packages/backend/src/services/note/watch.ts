import { User } from '@/models/entities/user.js';
import { Note } from '@/models/entities/note.js';
import { NoteWatchings, Notes } from '@/models/index.js';
import { genId } from '@/misc/gen-id.js';
import { NoteWatching } from '@/models/entities/note-watching.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';

export default async (me: User['id'], note: Note) => {
	// 自分の投稿はwatchできない
	if (me === note.userId) {
		return;
	}

	// check visibility
	if (!await Notes.isVisibleForMe(note, me)) {
		throw new IdentifiableError('68e9d2d1-48bf-42c2-b90a-b20e09fd3d48', 'Note not accessible for you.');
	}

	try {
		await NoteWatchings.insert({
			id: genId(),
			createdAt: new Date(),
			noteId: note.id,
			userId: me,
			noteUserId: note.userId,
		} as NoteWatching);
	} catch (e) {
		if (isDuplicateKeyValueError(e)) {
			throw new IdentifiableError('ca181079-4b1b-aaa3-779b-9d50ae23c8d1');
		}
		throw e;
	}
};
