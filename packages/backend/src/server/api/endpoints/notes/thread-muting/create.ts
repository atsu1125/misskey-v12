import { Notes, NoteThreadMutings } from '@/models/index.js';
import { genId } from '@/misc/gen-id.js';
import readNote from '@/services/note/read.js';
import define from '../../../define.js';
import { getNote } from '../../../common/getters.js';
import { ApiError } from '../../../error.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,

	kind: 'write:account',

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '5ff67ada-ed3b-2e71-8e87-a1a421e177d2',
		},
		alreadyMuting: {
			message: 'You are already muting that note.',
			code: 'ALREADY_MUTING',
			id: '7e7359cb-160c-4956-b08f-4d1c653cd007',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
	},
	required: ['noteId'],
} as const;

// eslint-disable-next-line import/no-default-export
export default define(meta, paramDef, async (ps, user) => {
	const note = await getNote(ps.noteId).catch(e => {
		if (e.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
		throw e;
	});

	const mutedNotes = await Notes.find({
		where: [{
			id: note.threadId || note.id,
		}, {
			threadId: note.threadId || note.id,
		}],
	});

	await readNote(user.id, mutedNotes);

	try {
		await NoteThreadMutings.insert({
			id: genId(),
			createdAt: new Date(),
			threadId: note.threadId || note.id,
			userId: user.id,
		});
	} catch (e) {
		if (isDuplicateKeyValueError(e)) {
			throw new ApiError(meta.errors.alreadyMuting);
		}
		throw e;
	}
});
