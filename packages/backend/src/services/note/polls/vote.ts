import { publishNoteStream } from '@/services/stream.js';
import { CacheableUser, User } from '@/models/entities/user.js';
import { Note } from '@/models/entities/note.js';
import { PollVotes, NoteWatchings, Polls, Blockings, Notes } from '@/models/index.js';
import { Not } from 'typeorm';
import { genId } from '@/misc/gen-id.js';
import { createNotification } from '../../create-notification.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';

export default async function(user: CacheableUser, note: Note, choice: number) {
	const poll = await Polls.findOneBy({ noteId: note.id });

	if (poll == null) throw new Error('poll not found');

	// Check whether is valid choice
	if (poll.choices[choice] == null) throw new Error('invalid choice param');

	// Check blocking
	if (note.userId !== user.id) {
		const block = await Blockings.findOneBy({
			blockerId: note.userId,
			blockeeId: user.id,
		});
		if (block) {
			throw new Error('blocked');
		}
	}

	// check visibility
	if (!await Notes.isVisibleForMe(note, user.id)) {
		throw new IdentifiableError('68e9d2d1-48bf-42c2-b90a-b20e09fd3d48', 'Note not accessible for you.');
	}

	// if already voted
	const exist = await PollVotes.findBy({
		noteId: note.id,
		userId: user.id,
	});

	if (poll.multiple) {
		if (exist.some(x => x.choice === choice)) {
			throw new Error('already voted');
		}
	} else if (exist.length !== 0) {
		throw new Error('already voted');
	}

	// Create vote
	await PollVotes.insert({
		id: genId(),
		createdAt: new Date(),
		noteId: note.id,
		userId: user.id,
		choice: choice,
	});

	// Increment votes count
	const index = choice + 1; // In SQL, array index is 1 based
	await Polls.query('UPDATE poll SET votes[$1] = votes[$1] + 1 WHERE "noteId" = $2', [index, poll.noteId]);

	publishNoteStream(note.id, 'pollVoted', {
		choice: choice,
		userId: user.id,
	});

	// Notify
	createNotification(note.userId, 'pollVote', {
		notifierId: user.id,
		noteId: note.id,
		choice: choice,
	});

	// Fetch watchers
	NoteWatchings.findBy({
		noteId: note.id,
		userId: Not(user.id),
	})
	.then(watchers => {
		for (const watcher of watchers) {
			createNotification(watcher.userId, 'pollVote', {
				notifierId: user.id,
				noteId: note.id,
				choice: choice,
			});
		}
	});
}
