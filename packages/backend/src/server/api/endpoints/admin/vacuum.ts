import define from '../../define.js';
import { insertModerationLog } from '@/services/insert-moderation-log.js';
import { db } from '@/db/postgre.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		analyze: { type: 'boolean' },
	},
	required: ['analyze'],
} as const;

// eslint-disable-next-line import/no-default-export
export default define(meta, paramDef, async (ps, me) => {
	const params: string[] = [];
	if (ps.analyze) {
		params.push('ANALYZE');
	}

	db.query('VACUUM ' + params.join(' '));

	insertModerationLog(me, 'vacuum', ps);
});
