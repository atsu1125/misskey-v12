import Bull from 'bull';

import { queueLogger } from '../../logger.js';
import { activeUsersChart, driveChart, federationChart, hashtagChart, instanceChart, notesChart, perUserDriveChart, perUserFollowingChart, perUserNotesChart, perUserReactionsChart, usersChart, apRequestChart } from '@/services/chart/index.js';

const logger = queueLogger.createSubLogger('tick-charts');

export async function tickCharts(job: Bull.Job<Record<string, unknown>>, done: any): Promise<void> {
	logger.info(`Tick charts...`);

	await federationChart.tick(false),
	await notesChart.tick(false),
	await usersChart.tick(false),
	await activeUsersChart.tick(false),
	await instanceChart.tick(false),
	await perUserNotesChart.tick(false),
	await driveChart.tick(false),
	await perUserReactionsChart.tick(false),
	await hashtagChart.tick(false),
	await perUserFollowingChart.tick(false),
	await perUserDriveChart.tick(false),
	await apRequestChart.tick(false),

	logger.succ(`All charts successfully ticked.`);
	done();
}
