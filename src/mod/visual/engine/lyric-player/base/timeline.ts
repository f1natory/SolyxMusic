
import { Duration, MediaTime } from "@visual/utils/time.ts";

const MIN_INTERLUDE_GAP = Duration.fromMillis(7000);

export interface TimeBounds {
	readonly startTime: MediaTime;
	readonly endTime: MediaTime;
}

export interface PlayerInterlude {

	readonly startTime: MediaTime;

	readonly endTime: MediaTime;

	readonly anchorLineIndex: number;
}

export interface TimelineSnapshot {

	readonly currentTime: MediaTime;

	readonly playingGroups: ReadonlySet<number>;

	readonly highlightedGroups: ReadonlySet<number>;

	readonly scrollToIndex: number;

	readonly latestHighlightedIndex?: number;

	readonly isEndOfSong: boolean;

	readonly activeInterlude?: PlayerInterlude;

	readonly isFocusOnInterlude: boolean;
}

export interface TimelineDiff {

	readonly hasChanged: boolean;

	readonly isTimeJumped: boolean;

	readonly addedPlaying: ReadonlyArray<number>;

	readonly removedPlaying: ReadonlyArray<number>;

	readonly addedHighlighted: ReadonlyArray<number>;

	readonly removedHighlighted: ReadonlyArray<number>;

	readonly isInterludeChanged: boolean;

	readonly isScrollToChanged: boolean;

	readonly isEndOfSongChanged: boolean;
}

type Mutable<T> = {
	-readonly [P in keyof T]: T[P];
};

export class TimelineController {

	private lyricBounds: readonly TimeBounds[] = [];

	private maxEndTime: MediaTime = MediaTime.ZERO;

	private precalculatedInterludes: PlayerInterlude[] = [];

	private playbackCursor = 0;
	private interludeCursor = 0;

	private playingGroupsSet: Set<number> = new Set();
	private highlightedGroupsSet: Set<number> = new Set();

	private nextPlayingSet: Set<number> = new Set();
	private nextHighlightedSet: Set<number> = new Set();

	private addedPlayingIds: number[] = [];
	private removedPlayingIds: number[] = [];
	private addedHighlightedIds: number[] = [];
	private removedHighlightedIds: number[] = [];
	private expiredHighlightedIds: number[] = [];

	private readonly snapshot: Mutable<TimelineSnapshot> = {
		currentTime: MediaTime.ZERO,
		playingGroups: this.playingGroupsSet,
		highlightedGroups: this.highlightedGroupsSet,
		scrollToIndex: 0,
		latestHighlightedIndex: undefined,
		isEndOfSong: false,
		activeInterlude: undefined,
		isFocusOnInterlude: false,
	};

	private readonly diff: Mutable<TimelineDiff> = {
		hasChanged: false,
		isTimeJumped: false,
		addedPlaying: this.addedPlayingIds,
		removedPlaying: this.removedPlayingIds,
		addedHighlighted: this.addedHighlightedIds,
		removedHighlighted: this.removedHighlightedIds,
		isInterludeChanged: false,
		isScrollToChanged: false,
		isEndOfSongChanged: false,
	};

	public setTimeBounds(bounds: readonly TimeBounds[]): void {
		this.lyricBounds = bounds;
		this.precalculatedInterludes = this.calculateInterludes(bounds);

		let maxEnd = MediaTime.ZERO;
		for (const bound of bounds) {
			maxEnd = MediaTime.max(maxEnd, bound.endTime);
		}
		this.maxEndTime = maxEnd;

		this.reset();
	}

	public getSnapshot(): TimelineSnapshot {
		return this.snapshot;
	}

	public sync(time: MediaTime, forceSeek = false): TimelineDiff {
		this.addedPlayingIds.length = 0;
		this.removedPlayingIds.length = 0;
		this.addedHighlightedIds.length = 0;
		this.removedHighlightedIds.length = 0;

		const prevInterlude = this.snapshot.activeInterlude;
		const prevFocusOnInterlude = this.snapshot.isFocusOnInterlude;
		const prevScrollToIndex = this.snapshot.scrollToIndex;
		const prevEndOfSong = this.snapshot.isEndOfSong;

		const isTimeRetreating = time < this.snapshot.currentTime;
		const isJump = forceSeek || isTimeRetreating;

		const activeInterlude = this.resolveActiveInterlude(time, isJump);
		this.snapshot.activeInterlude = activeInterlude;

		const isPastLastLine =
			this.lyricBounds.length > 0 && time >= this.maxEndTime;

		if (isJump) {
			this.performSeek(time, !!activeInterlude || isPastLastLine);
		} else {
			this.performPlayback(time);
		}

		if (activeInterlude && this.playingGroupsSet.size === 0) {
			this.flushAllHighlighted();
		}
		if (isPastLastLine) {
			this.flushAllHighlighted();
		}

		this.updateInterludeFocus(activeInterlude);

		const isInterludeChanged = prevInterlude !== activeInterlude;
		const isFocusChanged =
			prevFocusOnInterlude !== this.snapshot.isFocusOnInterlude;
		const isScrollToChanged = prevScrollToIndex !== this.snapshot.scrollToIndex;
		const isEndOfSongChanged = isPastLastLine !== prevEndOfSong;

		const hasChanged =
			isJump ||
			this.addedPlayingIds.length > 0 ||
			this.removedPlayingIds.length > 0 ||
			this.addedHighlightedIds.length > 0 ||
			this.removedHighlightedIds.length > 0 ||
			isInterludeChanged ||
			isFocusChanged ||
			isScrollToChanged ||
			isEndOfSongChanged;

		this.snapshot.currentTime = time;

		if (this.highlightedGroupsSet.size > 0) {
			let maxIndex = -1;
			for (const id of this.highlightedGroupsSet) {
				if (id > maxIndex) maxIndex = id;
			}
			this.snapshot.latestHighlightedIndex = maxIndex;
		} else {
			this.snapshot.latestHighlightedIndex = undefined;
		}

		this.snapshot.isEndOfSong = isPastLastLine;

		this.diff.hasChanged = hasChanged;
		this.diff.isTimeJumped = isJump;
		this.diff.isInterludeChanged = isInterludeChanged;
		this.diff.isScrollToChanged = isScrollToChanged;
		this.diff.isEndOfSongChanged = isEndOfSongChanged;

		return this.diff;
	}

	private performPlayback(time: MediaTime): void {

		for (const lastPlayingId of this.playingGroupsSet) {
			const bound = this.lyricBounds[lastPlayingId];
			if (!bound || time < bound.startTime || bound.endTime <= time) {
				this.playingGroupsSet.delete(lastPlayingId);
				this.removedPlayingIds.push(lastPlayingId);
			}
		}

		let cursor = Math.max(0, this.playbackCursor);
		const len = this.lyricBounds.length;

		while (cursor < len) {
			const bound = this.lyricBounds[cursor];
			if (bound.startTime > time) {
				break;
			}

			if (
				bound.startTime <= time &&
				bound.endTime > time &&
				!this.playingGroupsSet.has(cursor)
			) {
				this.playingGroupsSet.add(cursor);
				this.addedPlayingIds.push(cursor);
			}
			cursor++;
		}

		this.playbackCursor = cursor;

		this.expiredHighlightedIds.length = 0;
		for (const id of this.highlightedGroupsSet) {
			if (!this.playingGroupsSet.has(id)) {
				this.expiredHighlightedIds.push(id);
			}
		}

		const addedPlayingCount = this.addedPlayingIds.length;
		const expiredCount = this.expiredHighlightedIds.length;

		for (let i = 0; i < addedPlayingCount; i++) {
			const id = this.addedPlayingIds[i];
			this.highlightedGroupsSet.add(id);
			this.addedHighlightedIds.push(id);
		}

		if (addedPlayingCount > 0) {
			for (let i = 0; i < expiredCount; i++) {
				const id = this.expiredHighlightedIds[i];
				this.highlightedGroupsSet.delete(id);
				this.removedHighlightedIds.push(id);
			}

			let minHighlighted = Number.POSITIVE_INFINITY;
			for (const id of this.highlightedGroupsSet) {
				if (id < minHighlighted) minHighlighted = id;
			}

			this.snapshot.scrollToIndex = minHighlighted;
		}
	}

	private performSeek(time: MediaTime, dropLingeringWhenIdle: boolean): void {
		const nextPlaying = this.nextPlayingSet;
		const nextHighlighted = this.nextHighlightedSet;
		nextPlaying.clear();
		nextHighlighted.clear();

		let left = 0;
		let right = this.lyricBounds.length - 1;
		let firstGreater = this.lyricBounds.length;

		while (left <= right) {
			const mid = (left + right) >> 1;
			if (this.lyricBounds[mid].startTime > time) {
				firstGreater = mid;
				right = mid - 1;
			} else {
				left = mid + 1;
			}
		}

		let anchorIndex = -1;
		for (let i = firstGreater - 1; i >= 0; i--) {
			const bound = this.lyricBounds[i];

			if (bound.endTime > bound.startTime) {
				anchorIndex = i;
				break;
			}
		}

		if (anchorIndex === -1) {

			this.playbackCursor = firstGreater;
			this.snapshot.scrollToIndex = 0;
			this.commitSeekDiff();
			return;
		}

		const anchorStart = this.lyricBounds[anchorIndex].startTime;
		let minPlaying = -1;
		let minHighlighted = -1;

		for (let i = anchorIndex; i >= 0; i--) {
			const bound = this.lyricBounds[i];

			if (bound.endTime <= anchorStart) continue;

			if (bound.startTime <= time && bound.endTime > time) {
				nextPlaying.add(i);
				minPlaying = i;
			}

			nextHighlighted.add(i);
			minHighlighted = i;
		}

		if (dropLingeringWhenIdle && nextPlaying.size === 0) {
			nextHighlighted.clear();
		}

		this.playbackCursor = minPlaying === -1 ? firstGreater : minPlaying;
		this.snapshot.scrollToIndex = minHighlighted;

		this.commitSeekDiff();
	}

	private commitSeekDiff(): void {
		for (const id of this.playingGroupsSet) {
			if (!this.nextPlayingSet.has(id)) {
				this.playingGroupsSet.delete(id);
				this.removedPlayingIds.push(id);
			}
		}
		for (const id of this.nextPlayingSet) {
			if (!this.playingGroupsSet.has(id)) {
				this.playingGroupsSet.add(id);
				this.addedPlayingIds.push(id);
			}
		}

		for (const id of this.highlightedGroupsSet) {
			if (!this.nextHighlightedSet.has(id)) {
				this.highlightedGroupsSet.delete(id);
				this.removedHighlightedIds.push(id);
			}
		}
		for (const id of this.nextHighlightedSet) {
			if (!this.highlightedGroupsSet.has(id)) {
				this.highlightedGroupsSet.add(id);
				this.addedHighlightedIds.push(id);
			}
		}
	}

	private flushAllHighlighted(): void {
		if (this.highlightedGroupsSet.size === 0) return;

		for (const id of this.highlightedGroupsSet) {
			this.removedHighlightedIds.push(id);
		}
		this.highlightedGroupsSet.clear();
	}

	private calculateInterludes(
		bounds: readonly TimeBounds[],
	): PlayerInterlude[] {
		const interludes: PlayerInterlude[] = [];

		let maxEnd = MediaTime.ZERO;

		for (let i = -1; i < bounds.length - 1; i++) {
			if (i >= 0) {
				maxEnd = MediaTime.max(maxEnd, bounds[i].endTime);
			}

			const gapEnd = MediaTime.max(maxEnd, bounds[i + 1].startTime);

			if (MediaTime.since(gapEnd, maxEnd) >= MIN_INTERLUDE_GAP) {
				interludes.push({
					startTime: maxEnd,
					endTime: gapEnd,
					anchorLineIndex: i,
				});
			}
		}

		return interludes;
	}

	private resolveActiveInterlude(
		time: MediaTime,
		isSeek: boolean,
	): PlayerInterlude | undefined {
		if (this.precalculatedInterludes.length === 0) return undefined;

		if (isSeek) {
			let cursor = this.precalculatedInterludes.length;
			let left = 0;
			let right = this.precalculatedInterludes.length - 1;

			while (left <= right) {
				const mid = (left + right) >> 1;
				const inter = this.precalculatedInterludes[mid];

				if (inter.endTime > time) {
					cursor = mid;
					right = mid - 1;
				} else {
					left = mid + 1;
				}
			}

			this.interludeCursor = cursor;

			if (cursor < this.precalculatedInterludes.length) {
				const inter = this.precalculatedInterludes[cursor];
				if (time >= inter.startTime && time < inter.endTime) {
					return inter;
				}
			}

			return undefined;
		}

		while (this.interludeCursor < this.precalculatedInterludes.length) {
			const inter = this.precalculatedInterludes[this.interludeCursor];
			if (time >= inter.startTime && time < inter.endTime) {
				return inter;
			}
			if (time >= inter.endTime) {
				this.interludeCursor++;
			} else {
				break;
			}
		}

		return undefined;
	}

	private updateInterludeFocus(activeInterlude?: PlayerInterlude): void {
		this.snapshot.isFocusOnInterlude =
			!!activeInterlude && this.highlightedGroupsSet.size === 0;
	}

	private reset(): void {
		this.playbackCursor = 0;
		this.interludeCursor = 0;

		this.playingGroupsSet.clear();
		this.highlightedGroupsSet.clear();
		this.nextPlayingSet.clear();
		this.nextHighlightedSet.clear();

		this.snapshot.currentTime = MediaTime.ZERO;
		this.snapshot.scrollToIndex = 0;
		this.snapshot.latestHighlightedIndex = undefined;
		this.snapshot.isEndOfSong = false;
		this.snapshot.activeInterlude = undefined;
		this.snapshot.isFocusOnInterlude = false;
	}

}
