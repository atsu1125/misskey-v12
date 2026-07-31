import define from '../../define.js';
import { ApiError } from '../../error.js';
import { Channels, ChannelFollowings } from '@/models/index.js';
import { genId } from '@/misc/gen-id.js';
import { publishUserEvent } from '@/services/stream.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';

export const meta = {
	tags: ['channels'],

	requireCredential: true,

	kind: 'write:channels',

	errors: {
		noSuchChannel: {
			message: 'No such channel.',
			code: 'NO_SUCH_CHANNEL',
			id: 'c0031718-d573-4e85-928e-10039f1fbb68',
		},
		alreadyFollowing: {
			message: 'You are already following that channel.',
			code: 'ALREADY_FOLLOWING',
			id: '7db31665-651e-40c1-8e6e-28e9ad829a2d',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		channelId: { type: 'string', format: 'misskey:id' },
	},
	required: ['channelId'],
} as const;

// eslint-disable-next-line import/no-default-export
export default define(meta, paramDef, async (ps, user) => {
	const channel = await Channels.findOneBy({
		id: ps.channelId,
	});

	if (channel == null) {
		throw new ApiError(meta.errors.noSuchChannel);
	}

	try {
		await ChannelFollowings.insert({
			id: genId(),
			createdAt: new Date(),
			followerId: user.id,
			followeeId: channel.id,
		});
	} catch (e) {
		if (isDuplicateKeyValueError(e)) {
			throw new ApiError(meta.errors.alreadyFollowing);
		}
		throw e;
	}

	publishUserEvent(user.id, 'followChannel', channel);
});
