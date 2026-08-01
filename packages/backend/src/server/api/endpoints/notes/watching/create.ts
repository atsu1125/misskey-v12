import watch from '@/services/note/watch.js';
import define from '../../../define.js';
import { getNote } from '../../../common/getters.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,

	kind: 'write:account',

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: 'ea0e37a6-90a3-4f58-ba6b-c328ca206fc7',
		},
		alreadyWatching: {
			message: 'You are already watching that note.',
			code: 'ALREADY_WATCHING',
			id: 'ca181079-4b1b-aaa3-779b-9d50ae23c8d1',
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

	try {
		await watch(user.id, note);
	} catch (e) {
		if (e.id === 'ca181079-4b1b-aaa3-779b-9d50ae23c8d1') throw new ApiError(meta.errors.alreadyWatching);
		if (e.id === '68e9d2d1-48bf-42c2-b90a-b20e09fd3d48') throw new ApiError(meta.errors.noSuchNote);
		throw e;
	};
});
