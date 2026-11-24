
import type { LyricLine, LyricParseResult, LyricWord } from "../../types";
import {
	createLine,
	createWord,
	MAX_LRC_TIMESTAMP,
	parseTimestampParts,
} from "../../utils";
import {
	isBackgroundVocalText,
	isWordSyncLyric,
	joinWords,
	trimBackgroundVocalParentheses,
} from "./helpers";
import { mergeMetadata, parseLrcMetadataLine } from "./metadata";
import { LRC_MODE_FEATURES, type LrcMetadata, type LrcMode } from "./types";

type TokenType = "time" | "text";

interface BaseToken {
	type: TokenType;
}

interface TimeToken extends BaseToken {
	type: "time";
	val: number;
}

interface TextToken extends BaseToken {
	type: "text";
	val: string;
}

type Token = TimeToken | TextToken;

interface LineFeature {
	firstTextIndex: number;
	isWordSync: boolean;

	isBG: boolean;

	text: string;
}

interface ParseState {

	lastMainLines: LyricLine[];

	mainLinesByStartTime: Map<number, LyricLine>;

	translations: Map<LyricLine, string[]>;
}

export interface ParseLrcLikeOptions {

	mode?: LrcMode;
}

const COMMENT_PREFIXES = ["#", "//"];

export class LrcParser {
	private readonly mode: LrcMode;

	private static readonly WORD_TIMESTAMP_REGEX =
		/(?:\[|<)(?<min>\d{1,3}):(?<sec>\d{1,2})(?:[:.](?<ms>\d{1,6}))?(?:\]|>)/g;

	constructor(options?: ParseLrcLikeOptions) {
		this.mode = options?.mode ?? "spl";
	}

	public parse(text: string): LyricParseResult {
		const metadata: LrcMetadata = [];
		const allParsedLines: LyricLine[] = [];
		const state: ParseState = {
			lastMainLines: [],
			mainLinesByStartTime: new Map(),
			translations: new Map(),
		};

		for (const rawLine of text.split(/\r?\n/)) {
			const trimmedLine = rawLine.trim();
			if (!trimmedLine) continue;

			if (COMMENT_PREFIXES.some((prefix) => trimmedLine.startsWith(prefix))) {
				continue;
			}

			const parsedMeta = parseLrcMetadataLine(trimmedLine);
			if (parsedMeta) {
				mergeMetadata(metadata, parsedMeta);
				continue;
			}

			const tokens = this.tokenizeLine(trimmedLine);

			if (tokens.every((t) => t.type === "text")) {
				this.appendTranslation(trimmedLine, [], state);
				continue;
			}

			const features = this.getLineFeatures(tokens);

			if (features.text.trim() === "") {
				this.appendExplicitEndTime(tokens, state.lastMainLines);
				continue;
			}

			const newLines = features.isWordSync
				? this.parseWordSyncLine(tokens, features, state)
				: this.parsePlainLines(tokens, features, state);

			if (newLines.length > 0) {
				this.applyBackgroundVocal(newLines, features.isBG);
				allParsedLines.push(...newLines);
				state.lastMainLines = newLines;
				for (const line of newLines) {
					if (!state.mainLinesByStartTime.has(line.startTime)) {
						state.mainLinesByStartTime.set(line.startTime, line);
					}
				}
			}
		}

		return {
			metadata,
			lines: this.expandTranslations(
				this.finalizeLyricLines(allParsedLines),
				state.translations,
			),
		};
	}

	private tokenizeLine(line: string): Token[] {
		const tokens: Token[] = [];
		let lastIndex = 0;

		for (const match of line.matchAll(LrcParser.WORD_TIMESTAMP_REGEX)) {
			if (!match.groups) continue;

			const matchIndex = match.index ?? 0;
			const textBefore = line.substring(lastIndex, matchIndex);

			if (textBefore) {
				tokens.push({ type: "text", val: textBefore });
			}

			const time = parseTimestampParts(
				match.groups.min,
				match.groups.sec,
				match.groups.ms,
			);
			tokens.push({ type: "time", val: time });

			lastIndex = matchIndex + match[0].length;
		}

		const textAfter = line.substring(lastIndex);
		if (textAfter) {
			tokens.push({ type: "text", val: textAfter });
		}

		return tokens;
	}

	private getLineFeatures(tokens: Token[]): LineFeature {
		const firstTextIndex = tokens.findIndex((t) => t.type === "text");
		let isWordSync = false;

		if (firstTextIndex > 0) {
			for (let i = firstTextIndex + 1; i < tokens.length; i++) {
				if (tokens[i].type === "time") {
					isWordSync = true;
					break;
				}
			}
		}

		const text = tokens
			.filter((t) => t.type === "text")
			.map((t) => t.val)
			.join("");

		return {
			firstTextIndex,
			isWordSync,
			isBG: isBackgroundVocalText(text),
			text,
		};
	}

	private applyBackgroundVocal(lines: LyricLine[], isBG: boolean): void {
		if (!isBG) return;
		for (const line of lines) {
			line.isBG = true;
			trimBackgroundVocalParentheses(line.words);
		}
	}

	private appendTranslation(
		text: string,
		baseTimes: number[],
		state: ParseState,
	): boolean {
		if (text.trim() === "") return false;

		const targets =
			baseTimes.length === 0
				? state.lastMainLines
				: this.matchLinesByTime(baseTimes, state.mainLinesByStartTime);
		if (!targets || targets.length === 0) return false;

		for (const line of targets) {
			const texts = state.translations.get(line);
			if (texts) {
				texts.push(text);
			} else {
				state.translations.set(line, [text]);
			}
		}
		return true;
	}

	private matchLinesByTime(
		baseTimes: number[],
		mainLinesByStartTime: Map<number, LyricLine>,
	): LyricLine[] | null {
		const targets: LyricLine[] = [];
		for (const baseTime of baseTimes) {
			const line = mainLinesByStartTime.get(baseTime);
			if (!line) return null;
			targets.push(line);
		}
		return targets;
	}

	private appendExplicitEndTime(
		tokens: Token[],
		lastMainLines: LyricLine[],
	): void {
		const lastTimeToken = tokens.findLast(
			(token): token is TimeToken => token.type === "time",
		);
		const lastLine = lastMainLines[lastMainLines.length - 1];
		if (!lastTimeToken || !lastLine) return;

		const endTime = lastTimeToken.val;
		if (lastLine.endTime !== -1 || endTime <= lastLine.startTime) return;

		lastLine.endTime = endTime;
	}

	private parsePlainLines(
		tokens: Token[],
		features: LineFeature,
		state: ParseState,
	): LyricLine[] {
		const baseTimes: number[] = [];
		const endIndex =
			features.firstTextIndex !== -1 ? features.firstTextIndex : tokens.length;

		for (let i = 0; i < endIndex; i++) {
			const token = tokens[i];
			if (token.type === "time" && !baseTimes.includes(token.val)) {
				baseTimes.push(token.val);
			}
		}

		if (
			!features.isBG &&
			this.appendTranslation(features.text, baseTimes, state)
		) {
			return [];
		}

		return baseTimes.map((baseTime) =>
			createLine({
				startTime: baseTime,
				endTime: -1,
				words: [
					createWord({ word: features.text, startTime: baseTime, endTime: -1 }),
				],
			}),
		);
	}

	private parseWordSyncLine(
		tokens: Token[],
		features: LineFeature,
		state: ParseState,
	): LyricLine[] {
		const firstToken = tokens[0];

		const delayToken = tokens[features.firstTextIndex - 1];

		if (firstToken?.type !== "time" || delayToken?.type !== "time") {
			return [];
		}

		const baseTime = firstToken.val;

		if (
			!features.isBG &&
			this.appendTranslation(features.text, [baseTime], state)
		) {
			return [];
		}

		const syllableStartTimeInitial = delayToken.val;
		let explicitEnd: number | undefined;
		const syllables: LyricWord[] = [];

		let currentText = "";
		let syllableStartTime = syllableStartTimeInitial;

		const pushSyllable = (text: string, start: number, end: number) => {
			syllables.push(
				createWord({ word: text, startTime: start, endTime: end }),
			);
		};

		for (let i = features.firstTextIndex; i < tokens.length; i++) {
			const tok = tokens[i];
			if (tok.type === "text") {
				currentText += tok.val;
			} else if (tok.type === "time") {
				const nextTime = tok.val;

				if (currentText !== "") {
					pushSyllable(currentText, syllableStartTime, nextTime);
					currentText = "";
				}
				syllableStartTime = nextTime;

				if (i === tokens.length - 1) {
					explicitEnd = nextTime;
				}
			}
		}

		if (currentText !== "") {
			pushSyllable(
				currentText,
				syllableStartTime,
				-1,
			);
		}

		return [
			createLine({
				startTime: baseTime,
				endTime: explicitEnd ?? -1,
				words: isWordSyncLyric(syllables, baseTime)
					? syllables
					: [
							createWord({
								word: features.text,
								startTime: baseTime,
								endTime: -1,
							}),
						],
			}),
		];
	}

	private finalizeLyricLines(allParsedLines: LyricLine[]): LyricLine[] {

		allParsedLines.sort((a, b) => a.startTime - b.startTime);

		this.resolveEndTimes(allParsedLines);

		if (!LRC_MODE_FEATURES[this.mode].wordLevel) {
			this.stripWordTimings(allParsedLines);
		}

		return allParsedLines;
	}

	private resolveEndTimes(allParsedLines: LyricLine[]): void {
		for (let i = 0; i < allParsedLines.length; i++) {
			const line = allParsedLines[i];
			const isLastLine = i === allParsedLines.length - 1;

			if (line.endTime === -1) {
				if (isLastLine && !isWordSyncLyric(line.words, line.startTime)) {
					line.endTime = MAX_LRC_TIMESTAMP;
				} else if (!isLastLine) {
					line.endTime = allParsedLines[i + 1].startTime;
				}
			}

			const words = line.words;
			if (words.length > 0) {
				for (let j = 0; j < words.length; j++) {
					const word = words[j];
					if (word.endTime !== -1) continue;
					if (j + 1 < words.length) {
						word.endTime = words[j + 1].startTime;
					} else if (isLastLine && line.endTime === -1) {
						word.endTime = word.startTime + 1000;
						line.endTime = word.endTime;
					} else {
						word.endTime = line.endTime;
					}
				}
			}
		}
	}

	private stripWordTimings(allParsedLines: LyricLine[]): void {
		for (const line of allParsedLines) {
			if (line.words.length <= 1) continue;
			line.words = [
				createWord({
					word: joinWords(line.words),
					startTime: line.startTime,
					endTime: line.endTime,
				}),
			];
		}
	}

	private expandTranslations(
		lines: LyricLine[],
		translations: Map<LyricLine, string[]>,
	): LyricLine[] {
		if (translations.size === 0) return lines;

		const result: LyricLine[] = [];
		for (const line of lines) {
			result.push(line);
			for (const text of translations.get(line) ?? []) {
				result.push(
					createLine({
						startTime: line.startTime,
						endTime: line.endTime,
						words: [
							createWord({
								word: text,
								startTime: line.startTime,
								endTime: line.endTime,
							}),
						],
					}),
				);
			}
		}
		return result;
	}
}
