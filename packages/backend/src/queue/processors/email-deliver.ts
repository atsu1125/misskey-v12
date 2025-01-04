import { EmailJobData } from '@/queue/types.js';
import Bull from 'bull';
import { sendEmail } from '@/services/send-email.js';
import Logger from '@/services/logger.js';
import { fetchMeta } from '@/misc/fetch-meta.js';
const logger = new Logger('emailDeliver');

export default async (job: Bull.Job<EmailJobData>) => {
	const meta = await fetchMeta(true);

	if (!meta.enableEmail) {
		return;
	}

	const to: string = job.data.to;
  const subject: string = job.data.subject;
  const html: string = job.data.html;
  const text: string = job.data.text;

  logger.info(`sending to ${job.data.to} ...`);
	await sendEmail(to, subject, html, text);

	return 'Success';
};
