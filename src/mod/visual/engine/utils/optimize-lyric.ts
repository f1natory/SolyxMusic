
import type { LyricLine, OptimizeLyricOptions } from "../interfaces.ts";

const DEFAULT_OPTIMIZE_OPTIONS: OptimizeLyricOptions = {
	normalizeSpaces: true,
	resetLineTimestamps: true,
	syncMainAndBackgroundLines: true,
	cleanUnintentionalOverlaps: true,
	tryAdvanceStartTime: true,
};

function normalizeSpaces(lines: LyricLine[]) {
	for (const line of lines) {
		for (const word of line.words) {
			word.word = word.word.replace(/\s+/g, " ");
		}
	}
}

function resetLineTimestamps(lines: LyricLine[]) {
	for (const line of lines) {

		if (
			line.words.length === 1 &&
			line.words[0].startTime === 0 &&
			line.words[0].endTime === 0 &&
			(line.startTime !== 0 || line.endTime !== 0)
		) {
			line.words[0].startTime = line.startTime;
			line.words[0].endTime = line.endTime;
		} else if (line.words.length > 0) {
			const firstWord = line.words[0];
			const lastWord = line.words[line.words.length - 1];

			line.startTime = firstWord.startTime;
			line.endTime = lastWord.endTime;
		}
	}
}

function convertExcessiveBackgroundLines(lines: LyricLine[]) {
	let consecutiveBgCount = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line.isBG) {
			consecutiveBgCount++;
			if (i === 0 || consecutiveBgCount > 1) {
				line.isBG = false;
			}
		} else {
			consecutiveBgCount = 0;
		}
	}
}

function syncMainAndBackgroundLines(lines: LyricLine[]) {
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i];
		if (line.isBG) continue;

		const nextLine = lines[i + 1];
		if (nextLine?.isBG) {
			const allWords = [...line.words, ...nextLine.words].filter(
				(w) => w.word.trim().length > 0,
			);

			const finalStart = Math.min(
				line.startTime,
				nextLine.startTime,
				...allWords.map((w) => w.startTime),
			);
			const finalEnd = Math.max(
				line.endTime,
				nextLine.endTime,
				...allWords.map((w) => w.endTime),
			);

			line.startTime = finalStart;
			line.endTime = finalEnd;
			nextLine.startTime = finalStart;
			nextLine.endTime = finalEnd;
		}
	}
}

function sortLyricLines(lines: LyricLine[]) {
	const groups: {
		lines: LyricLine[];
		startTime: number;
		originalIndex: number;
	}[] = [];

	for (let i = 0; i < lines.length; i++) {
		const mainLine = lines[i];
		const groupLines = [mainLine];

		if (!mainLine.isBG && lines[i + 1]?.isBG) {
			groupLines.push(lines[++i]);
		}

		groups.push({
			lines: groupLines,
			startTime: mainLine.startTime,
			originalIndex: groups.length,
		});
	}

	groups.sort((a, b) => {
		const timeDifference = a.startTime - b.startTime;
		return timeDifference || a.originalIndex - b.originalIndex;
	});

	let lineIndex = 0;
	for (const group of groups) {
		for (const line of group.lines) {
			lines[lineIndex++] = line;
		}
	}
}

function cleanUnintentionalOverlaps(
	lines: LyricLine[],
	syncBackgroundLines: boolean,
) {
	for (let i = 0; i < lines.length - 1; i++) {
		const line = lines[i];
		if (line.isBG) continue;

		for (let j = i + 1; j < lines.length; j++) {
			const nextLine = lines[j];
			if (nextLine.isBG) continue;

			const overlap = line.endTime - nextLine.startTime;

			if (overlap <= 0) {
				break;
			}

			const nextDuration = nextLine.endTime - nextLine.startTime;
			const percentageThreshold = nextDuration * 0.1;

			const isIntentionalOverlap =
				overlap >= 500 || (overlap > 100 && overlap > percentageThreshold);

			if (!isIntentionalOverlap) {
				line.endTime = nextLine.startTime;

				const attachedBgLine = lines[i + 1];
				if (syncBackgroundLines && attachedBgLine?.isBG) {
					attachedBgLine.endTime = nextLine.startTime;
				}
				break;
			}
		}
	}
}

function tryAdvanceStartTime(lines: LyricLine[], syncBackgroundLines: boolean) {

	const defaultAdvanceAmount = 600;

	const fallbackAdvanceAmount = 400;

	const fallbackAdvanceRatio = 0.7;

	let prevLineStartTime = 0;
	let prevLineEndTime = 0;
	let prevMainGroupStartTime = 0;
	let prevMainGroupEndTime = 0;
	let hasPrevLine = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line.isBG) continue;

		const originalStartTime = line.startTime;
		const originalEndTime = line.endTime;

		let targetAdvanceAmount = 0;
		let safeBoundary = 0;

		if (hasPrevLine) {
			const originallyHadGap = originalStartTime >= prevLineEndTime;

			if (originallyHadGap) {

				targetAdvanceAmount = defaultAdvanceAmount;
				safeBoundary = prevMainGroupEndTime;
			} else {

				const overlapDuration = prevLineEndTime - originalStartTime;

				if (overlapDuration < fallbackAdvanceAmount) {
					targetAdvanceAmount = overlapDuration * fallbackAdvanceRatio;
				} else {
					targetAdvanceAmount = fallbackAdvanceAmount;
				}

				safeBoundary = prevLineStartTime;
			}
		} else {

			targetAdvanceAmount = defaultAdvanceAmount;
			safeBoundary = 0;
		}

		const targetTime = line.startTime - targetAdvanceAmount;
		const newStartTime = Math.max(safeBoundary, targetTime);

		if (newStartTime < line.startTime) {
			line.startTime = newStartTime;
		}

		const nextLine = lines[i + 1];
		if (syncBackgroundLines && nextLine?.isBG) {
			nextLine.startTime = line.startTime;
		}

		if (hasPrevLine) {
			const overlapsPrevGroup =
				originalStartTime < prevMainGroupEndTime &&
				originalEndTime > prevMainGroupStartTime;

			if (overlapsPrevGroup) {
				prevMainGroupStartTime = Math.min(
					prevMainGroupStartTime,
					originalStartTime,
				);
				prevMainGroupEndTime = Math.max(prevMainGroupEndTime, originalEndTime);
			} else {
				prevMainGroupStartTime = originalStartTime;
				prevMainGroupEndTime = originalEndTime;
			}
		} else {
			prevMainGroupStartTime = originalStartTime;
			prevMainGroupEndTime = originalEndTime;
		}

		prevLineStartTime = line.startTime;
		prevLineEndTime = originalEndTime;
		hasPrevLine = true;
	}
}

export function areOptimizeOptionsEqual(
	a: OptimizeLyricOptions = {},
	b: OptimizeLyricOptions = {},
): boolean {
	const keysA = Object.keys(a) as (keyof OptimizeLyricOptions)[];
	const keysB = Object.keys(b) as (keyof OptimizeLyricOptions)[];
	if (keysA.length !== keysB.length) return false;
	for (const key of keysA) {
		if (a[key] !== b[key]) return false;
	}
	return true;
}

export function optimizeLyricLines(
	lines: LyricLine[],
	options?: OptimizeLyricOptions,
): void {
	const config = { ...DEFAULT_OPTIMIZE_OPTIONS, ...options };
	const syncBackgroundLines = config.syncMainAndBackgroundLines ?? true;

	if (config.normalizeSpaces) {
		normalizeSpaces(lines);
	}
	if (config.resetLineTimestamps) {
		resetLineTimestamps(lines);
	}
	convertExcessiveBackgroundLines(lines);
	if (syncBackgroundLines) {
		syncMainAndBackgroundLines(lines);
	}
	sortLyricLines(lines);
	if (config.cleanUnintentionalOverlaps) {
		cleanUnintentionalOverlaps(lines, syncBackgroundLines);
	}
	if (config.tryAdvanceStartTime) {
		tryAdvanceStartTime(lines, syncBackgroundLines);
	}
}
