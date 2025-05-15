import { URL } from 'node:url';
import * as mfm from 'mfm-js';
import renderImage from './image.js';
import renderKey from './key.js';
import config from '@/config/index.js';
import { ILocalUser } from '@/models/entities/user.js';
import { toHtml } from '../../../mfm/to-html.js';
import { getEmojis } from './note.js';
import renderEmoji from './emoji.js';
import { IIdentifier } from '../models/identifier.js';
import renderHashtag from './hashtag.js';
import { DriveFiles, UserProfiles } from '@/models/index.js';
import { getUserKeypair } from '@/misc/keypair-store.js';

export async function renderPerson(user: ILocalUser) {
	const id = `${config.url}/users/${user.id}`;
	const isSystem = !!user.username.match(/\./);

	const [avatar, banner, profile] = await Promise.all([
		user.avatarId ? DriveFiles.findOneBy({ id: user.avatarId }) : Promise.resolve(undefined),
		user.bannerId ? DriveFiles.findOneBy({ id: user.bannerId }) : Promise.resolve(undefined),
		UserProfiles.findOneByOrFail({ userId: user.id }),
	]);

	const tryRewriteUrl = (maybeUrl: string) => {
		const urlSafeRegex = /^(?:http[s]?:\/\/.)?(?:www\.)?[-a-zA-Z0-9@%._\+~#=]{2,256}\.[a-z]{2,6}\b(?:[-a-zA-Z0-9@:%_\+.~#?&\/\/=]*)/;
		try {
			const match = maybeUrl.match(urlSafeRegex);
			if (!match) {
				return maybeUrl;
			}
			const urlPart = match[0];
			const urlPartParsed = new URL(urlPart);
			const restPart = maybeUrl.slice(match[0].length);

			return `<a href="${urlPartParsed.href}" rel="me nofollow noopener" target="_blank">${urlPart}</a>${restPart}`;
		} catch (e) {
			return maybeUrl;
		}
	};

	const attachment: {
		type: 'PropertyValue',
		name: string,
		value: string,
		identifier?: IIdentifier
	}[] = [];

	if (profile.fields) {
		for (const field of profile.fields) {
			attachment.push({
				type: 'PropertyValue',
				name: field.name,
				value: (field.value != null && field.value.match(/^https?:/))
					? tryRewriteUrl(field.value)
					: field.value,
			});
		}
	}

	const emojis = await getEmojis(user.emojis);
	const apemojis = emojis.map(emoji => renderEmoji(emoji));

	const hashtagTags = (user.tags || []).map(tag => renderHashtag(tag));

	const tag = [
		...apemojis,
		...hashtagTags,
	];

	const keypair = await getUserKeypair(user.id);

	const person = {
		type: isSystem ? 'Application' : user.isBot ? 'Service' : 'Person',
		id,
		inbox: `${id}/inbox`,
		outbox: `${id}/outbox`,
		followers: `${id}/followers`,
		following: `${id}/following`,
		featured: `${id}/collections/featured`,
		sharedInbox: `${config.url}/inbox`,
		endpoints: { sharedInbox: `${config.url}/inbox` },
		url: `${config.url}/@${user.username}`,
		preferredUsername: user.username,
		name: user.name,
		summary: profile.description ? toHtml(mfm.parse(profile.description)) : null,
		icon: avatar ? renderImage(avatar) : null,
		image: banner ? renderImage(banner) : null,
		tag,
		manuallyApprovesFollowers: user.isLocked,
		discoverable: !!user.isExplorable,
		published: user.createdAt.toISOString(),
		publicKey: renderKey(user, keypair, `#main-key`),
		isCat: user.isCat,
		attachment: attachment.length ? attachment : undefined,
	} as any;

	if (profile?.birthday) {
		person['vcard:bday'] = profile.birthday;
	}

	if (profile?.location) {
		person['vcard:Address'] = profile.location;
	}

	return person;
}
