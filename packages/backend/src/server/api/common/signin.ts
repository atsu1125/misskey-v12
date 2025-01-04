import Koa from 'koa';

import config from '@/config/index.js';
import { ILocalUser } from '@/models/entities/user.js';
import { Signins, UserProfiles } from '@/models/index.js';
import { genId } from '@/misc/gen-id.js';
import { publishMainStream } from '@/services/stream.js';
import { emailDeliver } from '@/queue/index.js';

export default function(ctx: Koa.Context, user: ILocalUser, redirect = false) {
	if (redirect) {
		//#region Cookie
		ctx.cookies.set('igi', user.token!, {
			path: '/',
			// SEE: https://github.com/koajs/koa/issues/974
			// When using a SSL proxy it should be configured to add the "X-Forwarded-Proto: https" header
			secure: config.url.startsWith('https'),
			httpOnly: false,
		});
		//#endregion

		ctx.redirect(config.url);
	} else {
		ctx.body = {
			id: user.id,
			i: user.token,
		};
		ctx.status = 200;
	}

	(async () => {
		const signinUserProfile = await UserProfiles.findOneBy({
			userId: user.id,
		});

		if (signinUserProfile.email && signinUserProfile.emailVerified && signinUserProfile.receiveAnnouncementEmail) {
			const userSigninFromIpExists = await Signins.findOneBy({
				userId: user.id,
				ip: ctx.ip,
			});
			if (!userSigninFromIpExists) {
				emailDeliver(signinUserProfile.email, 'New login / ログインがありました',
					'There is a new login. If you do not recognize this login, update the security status of your account, including changing your password. / 新しいログインがありました。このログインに心当たりがない場合は、パスワードを変更するなど、アカウントのセキュリティ状態を更新してください。',
					'There is a new login. If you do not recognize this login, update the security status of your account, including changing your password. / 新しいログインがありました。このログインに心当たりがない場合は、パスワードを変更するなど、アカウントのセキュリティ状態を更新してください。');
			}
		}

		// Append signin history
		const record = await Signins.insert({
			id: genId(),
			createdAt: new Date(),
			userId: user.id,
			ip: ctx.ip,
			headers: ctx.headers,
			success: true,
		}).then(x => Signins.findOneByOrFail(x.identifiers[0]));

		// Publish signin event
		publishMainStream(user.id, 'signin', await Signins.pack(record));
	})();
}
