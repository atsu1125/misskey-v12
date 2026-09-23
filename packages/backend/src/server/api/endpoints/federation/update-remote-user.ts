import ms from 'ms';
import define from '../../define.js';
import { getRemoteUser } from '../../common/getters.js';
import { updatePerson } from '@/remote/activitypub/models/person.js';

export const meta = {
	tags: ['federation'],

	requireCredential: true,
	kind: 'read:account',

	limit: {
		duration: ms('1hour'),
		max: 30,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

// eslint-disable-next-line import/no-default-export
export default define(meta, paramDef, async (ps) => {
	const user = await getRemoteUser(ps.userId);
	await updatePerson(user.uri!);
});
