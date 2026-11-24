
import type { LyricLine, LyricWord } from "./types";

export const createLine = (line: Partial<LyricLine>): LyricLine => ({
	words: [],
	translatedLyric: "",
	romanLyric: "",
	isBG: false,
	isDuet: false,
	startTime: 0,
	endTime: 0,
	...line,
});

export const createWord = (word: Partial<LyricWord>): LyricWord => ({
	startTime: 0,
	endTime: 0,
	word: "",
	...word,
});

export const parseTime = (time: string): number =>
	Math.round(
		time
			.split(":")
			.map(Number)
			.reverse()
			.reduce((acc, cur, idx) => acc + cur * 60 ** idx, 0) * 1000,
	);

export const parseTimestampParts = (
	minStr: string,
	secStr: string,
	msStr = "",
): number =>
	parseInt(minStr, 10) * 60000 +
	parseInt(secStr, 10) * 1000 +
	parseInt(`${msStr}000`.slice(0, 3), 10);

export const formatTime = (ms: number): string => {
	const min = Math.floor(ms / 60000)
		.toString()
		.padStart(2, "0");
	const sec = Math.floor((ms % 60000) / 1000)
		.toString()
		.padStart(2, "0");

	const msPart = Math.floor(ms % 1000)
		.toString()
		.padStart(3, "0");
	return `${min}:${sec}.${msPart}`;
};

export const normalizeTimestamp = (ms: number): number => {
	if (!Number.isFinite(ms) || ms < 0) return 0;
	return ms;
};

export const normalizeDuration = (duration: number): number => {
	if (!Number.isFinite(duration) || duration < 0) return 0;
	return duration;
};

export const MAX_LRC_TIMESTAMP: number = parseTimestampParts(
	"999",
	"59",
	"999",
);

export const clampTimestamp = (ms: number): number =>
	Math.min(MAX_LRC_TIMESTAMP, normalizeTimestamp(ms));

export type DeepRequired<T> = T extends object
	? { [P in keyof T]-?: DeepRequired<NonNullable<T[P]>> }
	: T;
