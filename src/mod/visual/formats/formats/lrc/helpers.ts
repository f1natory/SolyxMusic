
import type { LyricLine, LyricWord } from "../../types";
import { normalizeTimestamp } from "../../utils";

export function normalizeLine(line: LyricLine): LyricLine {
	return {
		...line,
		startTime: normalizeTimestamp(line.startTime),
		endTime: normalizeTimestamp(line.endTime),
		words: line.words.map((word) => ({
			...word,
			startTime: normalizeTimestamp(word.startTime),
			endTime: normalizeTimestamp(word.endTime),
		})),
	};
}

export function joinWords(words: LyricWord[]): string {
	return words.map((word) => word.word).join("");
}

export function hasText(line: LyricLine): boolean {
	return joinWords(line.words).trim() !== "";
}

export function isWordSyncLyric(
	words: LyricWord[],
	startTime: number,
): boolean {
	if (words.length === 0) return false;
	if (words.length > 1) return true;
	return words[0].startTime !== startTime;
}

const BG_PAREN_BEGIN = /^[(（]/;
const BG_PAREN_END = /[）)]$/;

export function isBackgroundVocalText(text: string): boolean {
	return (
		text.length > 2 && BG_PAREN_BEGIN.test(text) && BG_PAREN_END.test(text)
	);
}

export function trimBackgroundVocalParentheses(words: LyricWord[]): void {
	if (words.length === 0) return;
	words[0].word = words[0].word.slice(1);
	const lastWord = words[words.length - 1];
	lastWord.word = lastWord.word.slice(0, -1);
}
