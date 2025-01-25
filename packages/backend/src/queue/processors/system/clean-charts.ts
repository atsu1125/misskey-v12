import Bull from 'bull';

import { queueLogger } from '../../logger.js';
import { activeUsersChart, driveChart, federationChart, hashtagChart, instanceChart, notesChart, perUserDriveChart, perUserFollowingChart, perUserNotesChart, perUserReactionsChart, usersChart, apRequestChart } from '@/services/chart/index.js';

const logger = queueLogger.createSubLogger('clean-charts');

export async function cleanCharts(job: Bull.Job<Record<string, unknown>>, done: any): Promise<void> {
	logger.info(`Clean charts...`);

	await federationChart.clean(),
	await notesChart.clean(),
	await usersChart.clean(),
	await activeUsersChart.clean(),
	await instanceChart.clean(),
	await perUserNotesChart.clean(),
	await driveChart.clean(),
	await perUserReactionsChart.clean(),
	await hashtagChart.clean(),
	await perUserFollowingChart.clean(),
	await perUserDriveChart.clean(),
	await apRequestChart.clean(),

	logger.succ(`All charts successfully cleaned.`);
	done();
}
