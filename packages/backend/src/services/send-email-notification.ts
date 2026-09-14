import { UserProfiles, Users } from '@/models/index.js';
import { User } from '@/models/entities/user.js';
import { sendEmail } from './send-email.js';
import * as Acct from '@/misc/acct.js';
import { emailDeliver } from '@/queue/index.js';
import { escapeHtml } from '@/misc/escape-html.js';
// TODO
//const locales = await import('../../../../locales/index.js');

// TODO: locale ファイルをクライアント用とサーバー用で分けたい

async function follow(userId: User['id'], follower: User) {
	const userProfile = await UserProfiles.findOneByOrFail({ userId: userId });
	const userDetailed = await Users.findOneByOrFail({ id: userId });
	if (!userProfile.email || !userProfile.emailVerified || !userProfile.emailNotificationTypes.includes('follow')) return;
	if (userDetailed.isSuspended) return;
	if (follower.name !== null) {
		const body = `${follower.name} (@${Acct.toString(follower)})`;
		emailDeliver(userProfile.email, `New Follower`, escapeHtml(body), body);
	} else {
		const body = `@${Acct.toString(follower)}`;
		emailDeliver(userProfile.email, `New Follower`, escapeHtml(body), body);
	}
}

async function receiveFollowRequest(userId: User['id'], follower: User) {
	const userProfile = await UserProfiles.findOneByOrFail({ userId: userId });
	const userDetailed = await Users.findOneByOrFail({ id: userId });
	if (!userProfile.email || !userProfile.emailVerified || !userProfile.emailNotificationTypes.includes('receiveFollowRequest')) return;
	if (userDetailed.isSuspended) return;
	if (follower.name !== null) {
		const body = `${follower.name} (@${Acct.toString(follower)})`;
		emailDeliver(userProfile.email, `New Follow Request`, escapeHtml(body), body);
	} else {
		const body = `@${Acct.toString(follower)}`;
		emailDeliver(userProfile.email, `New Follow Request`, escapeHtml(body), body);
	}
}

async function reply(userId: User['id'], follower: User, customBody: string, url: string) {
	const userProfile = await UserProfiles.findOneByOrFail({ userId: userId });
	const userDetailed = await Users.findOneByOrFail({ id: userId });
	if (!userProfile.email || !userProfile.emailVerified || !userProfile.emailNotificationTypes.includes('reply')) return;
	if (userDetailed.isSuspended) return;
	if (follower.name !== null) {
		const body = `${follower.name} (@${Acct.toString(follower)}) <br> ${customBody} <br> ${url}`;
		emailDeliver(userProfile.email, `New Reply`, escapeHtml(body), body);
	} else {
		const body = `@${Acct.toString(follower)} <br> ${customBody} <br> ${url}`;
		emailDeliver(userProfile.email, `New Reply`, escapeHtml(body), body);
	}
}

async function mention(userId: User['id'], follower: User, customBody: string, url: string) {
	const userProfile = await UserProfiles.findOneByOrFail({ userId: userId });
	const userDetailed = await Users.findOneByOrFail({ id: userId });
	if (!userProfile.email || !userProfile.emailVerified || !userProfile.emailNotificationTypes.includes('mention')) return;
	if (userDetailed.isSuspended) return;
	if (follower.name !== null) {
		const body = `${follower.name} (@${Acct.toString(follower)}) <br> ${customBody} <br> ${url}`;
		emailDeliver(userProfile.email, `New Mention`, escapeHtml(body), body);
	} else {
		const body = `@${Acct.toString(follower)} <br> ${customBody} <br> ${url}`;
		emailDeliver(userProfile.email, `New Mention`, escapeHtml(body), body);
	}
}

async function quote(userId: User['id'], follower: User, customBody: string, url: string, url2: string) {
	const userProfile = await UserProfiles.findOneByOrFail({ userId: userId });
	const userDetailed = await Users.findOneByOrFail({ id: userId });
	if (!userProfile.email || !userProfile.emailVerified || !userProfile.emailNotificationTypes.includes('quote')) return;
	if (userDetailed.isSuspended) return;
	if (follower.name !== null) {
		const body = `${follower.name} (@${Acct.toString(follower)}) <br> ${customBody} <br> RE: ${url2} <br> ${url}`;
		emailDeliver(userProfile.email, `New Quote`, escapeHtml(body), body);
	} else {
		const body = `@${Acct.toString(follower)} <br> ${customBody} <br> RE: ${url2} <br> ${url}`;
		emailDeliver(userProfile.email, `New Quote`, escapeHtml(body), body);
	}
}

async function groupInvited(userId: User['id'], customBody: string) {
	const userProfile = await UserProfiles.findOneByOrFail({ userId: userId });
	const userDetailed = await Users.findOneByOrFail({ id: userId });
	if (!userProfile.email || !userProfile.emailVerified || !userProfile.emailNotificationTypes.includes('groupInvited')) return;
	if (userDetailed.isSuspended) return;
	const body = `${customBody}`;
	emailDeliver(userProfile.email, `New Group Invitation`, escapeHtml(body), body);
}

async function app(userId: User['id'], customHeader: string, customBody: string) {
	const userProfile = await UserProfiles.findOneByOrFail({ userId: userId });
	const userDetailed = await Users.findOneByOrFail({ id: userId });
	if (!userProfile.email || !userProfile.emailVerified || !userProfile.emailNotificationTypes.includes('app')) return;
	if (userDetailed.isSuspended) return;
	const body = `${customHeader} <br> ${customBody}`;
	emailDeliver(userProfile.email, `New Application Notice`, escapeHtml(body), body);
}

export const sendEmailNotification = {
	follow,
	receiveFollowRequest,
	reply,
	mention,
	quote,
	groupInvited,
	app,
};
