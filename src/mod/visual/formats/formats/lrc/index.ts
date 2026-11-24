

import type { LyricLine, LyricParseResult } from "../../types";
import { LrcGenerator, type StringifyLrcLikeOptions } from "./generator";
import { LrcParser, type ParseLrcLikeOptions } from "./parser";

export type {
	LrcAuxiliaryLineOptions,
	LrcAuxiliaryLinesOptions,
	LrcEndTimestampOptions,
	StringifyLrcLikeOptions,
} from "./generator";
export type { ParseLrcLikeOptions } from "./parser";

export function parseLrcLike(
	text: string,
	options?: ParseLrcLikeOptions,
): LyricParseResult {
	return new LrcParser(options).parse(text);
}

export function stringifyLrcLike(
	input: LyricParseResult | LyricLine[],
	options?: StringifyLrcLikeOptions,
): string {
	return new LrcGenerator(options).generate(input);
}

export function parseLrc(lrc: string): LyricLine[] {
	return parseLrcLike(lrc).lines;
}

export function parseEslrc(eslrc: string): LyricLine[] {
	return parseLrcLike(eslrc).lines;
}

export function parseLrcA2(lrc: string): LyricLine[] {
	return parseLrcLike(lrc).lines;
}

export function parseSPL(spl: string): LyricLine[] {
	return parseLrcLike(spl).lines;
}

export function stringifyLrc(lines: LyricLine[]): string {
	return stringifyLrcLike(lines, { mode: "plain" });
}

export function stringifyEslrc(lines: LyricLine[]): string {
	return stringifyLrcLike(lines, { mode: "spl", inlineBracket: "square" });
}

export function stringifyLrcA2(lines: LyricLine[]): string {
	return stringifyLrcLike(lines, { mode: "spl", inlineBracket: "angle" });
}

export function stringifySPL(input: LyricParseResult | LyricLine[]): string {
	return stringifyLrcLike(input, { mode: "spl", inlineBracket: "angle" });
}
