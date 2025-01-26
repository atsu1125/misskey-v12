import Bull from 'bull';
import RE2 from 're2';
import { queueLogger } from '../../logger.js';
import { AbuseReportResolvers, AbuseUserReports, UserProfiles, Users } from '@/models/index.js';
import { DbAbuseReportJobData } from '@/queue/types.js';
import { MoreThan } from 'typeorm';
import { sendEmail } from '@/services/send-email.js';
import { emailDeliver, deliver } from '@/queue/index.js';
import { getInstanceActor } from '@/services/instance-actor.js';
import { publishAdminStream } from '@/services/stream.js';
import { renderActivity } from '@/remote/activitypub/renderer/index.js';
import { renderFlag } from '@/remote/activitypub/renderer/flag.js';
import sanitizeHtml from 'sanitize-html';
import { fetchMeta } from '@/misc/fetch-meta.js';

const logger = queueLogger.createSubLogger('report-abuse');

export async function reportAbuse(job: Bull.Job<DbAbuseReportJobData>): Promise<void> {
	logger.info(`RUNNING...`);

	const resolvers = await AbuseReportResolvers.find();

	const targetUser = await Users.findOneByOrFail({
		id: job.data.targetUserId,
	});

	const reporter = await Users.findOneByOrFail({
		id: job.data.reporterId,
	});

	const actor = await getInstanceActor();

	const targetUserAcct = targetUser.host ? `${targetUser.username.toLowerCase()}@${targetUser.host}` : targetUser.username.toLowerCase();

	const reporterAcct = reporter.host ? `${reporter.username.toLowerCase()}@${reporter.host}` : reporter.username.toLowerCase();

	for (const resolver of resolvers) {
		if (!(resolver.targetUserPattern || resolver.reporterPattern || resolver.reportContentPattern)) {
			continue;
		}
		const isTargetUserPatternMatched = resolver.targetUserPattern ? new RE2(resolver.targetUserPattern).test(targetUserAcct) : true;
		const isReporterPatternMatched = resolver.reporterPattern ? new RE2(resolver.reporterPattern).test(reporterAcct) : true;
		const isReportContentPatternMatched = resolver.reportContentPattern ? new RE2(resolver.reportContentPattern).test(job.data.comment) : true;
		if (isTargetUserPatternMatched && isReporterPatternMatched && isReportContentPatternMatched) {
			if (resolver.forward && job.data.targetUserHost !== null && job.data.reporterHost === null) {
				deliver(actor, renderActivity(renderFlag(actor, [targetUser.uri!], job.data.comment)), targetUser.inbox);
			}
			await AbuseUserReports.update(job.data.id, {
				resolved: true,
				assigneeId: actor.id,
				forwarded: resolver.forward && job.data.targetUserHost != null && job.data.reporterHost === null,
			});
			return;
		}
	}

	// Publish event to moderators
	setTimeout(async () => {
		const moderators = await Users.find({
			where: [{
				isAdmin: true,
			}, {
				isModerator: true,
			}],
			order: {
				lastActiveDate: 'DESC',
			},
		});

		const meta = await fetchMeta();

		let emailSentCount = 0;

		for (const moderator of moderators) {
			if (emailSentCount >= 3) break;

			publishAdminStream(moderator.id, 'newAbuseUserReport', {
				id: job.data.id,
				targetUserId: job.data.targetUserId,
				reporterId: job.data.reporterId,
				comment: job.data.comment,
			});

			if ((meta.email && meta.enableEmail) && !meta.doNotSendNotificationEmailsForAbuseReport && !meta.doNotSendNotificationEmailsForAbuseReportToModerator) {
				const emailRecipientProfile = await UserProfiles.findOneBy({
					userId: moderator.id,
				});

				if (emailRecipientProfile.email && emailRecipientProfile.emailVerified && emailRecipientProfile.receiveAnnouncementEmail) {
					emailDeliver(emailRecipientProfile.email, 'New abuse report',
						sanitizeHtml(job.data.comment),
						sanitizeHtml(job.data.comment));
					emailSentCount++;
				}
			}
		}

		if ((meta.emailToReceiveAbuseReport || meta.email) && !meta.doNotSendNotificationEmailsForAbuseReport) {
			emailDeliver(meta.emailToReceiveAbuseReport ?? meta.email!, 'New abuse report',
				sanitizeHtml(job.data.comment),
				sanitizeHtml(job.data.comment));
		}
	}, 1);

	return 'Report resolved';
}
