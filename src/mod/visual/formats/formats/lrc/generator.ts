
import type { LyricLine, LyricParseResult } from "../../types";
import { clampTimestamp, type DeepRequired, formatTime } from "../../utils";
import { hasText, isWordSyncLyric, joinWords, normalizeLine } from "./helpers";
import { generateLrcMetadataLines } from "./metadata";
import { LRC_MODE_FEATURES, type LrcMode, type LrcModeFeatures } from "./types";

export interface LrcEndTimestampOptions {

	mode?: "none" | "always" | "interval";

	intervalGap?: number;
}

export interface LrcAuxiliaryLineOptions {

	enabled?: boolean;

	inline?: boolean;
}

export interface LrcAuxiliaryLinesOptions {

	order?: "translation-first" | "romanization-first";

	translation?: LrcAuxiliaryLineOptions;

	romanization?: LrcAuxiliaryLineOptions;

	backgroundVocal?: LrcAuxiliaryLineOptions;
}

export interface StringifyLrcLikeOptions {

	mode?: LrcMode;

	inlineBracket?: "angle" | "square";

	auxiliaryLines?: LrcAuxiliaryLinesOptions;

	endTimestamp?: LrcEndTimestampOptions;
}

function resolveAuxiliaryLineOptions(
	options: LrcAuxiliaryLineOptions | undefined,
): DeepRequired<LrcAuxiliaryLineOptions> {
	return {
		enabled: options?.enabled ?? true,
		inline: options?.inline ?? false,
	};
}

export class LrcGenerator {
	private options: DeepRequired<StringifyLrcLikeOptions>;
	private features: LrcModeFeatures;

	constructor(options?: StringifyLrcLikeOptions) {
		this.options = {
			mode: options?.mode ?? "plain",
			inlineBracket: options?.inlineBracket ?? "angle",
			auxiliaryLines: {
				order: options?.auxiliaryLines?.order ?? "translation-first",
				translation: resolveAuxiliaryLineOptions(
					options?.auxiliaryLines?.translation,
				),
				romanization: resolveAuxiliaryLineOptions(
					options?.auxiliaryLines?.romanization,
				),
				backgroundVocal: resolveAuxiliaryLineOptions(
					options?.auxiliaryLines?.backgroundVocal,
				),
			},
			endTimestamp: {
				mode: options?.endTimestamp?.mode ?? "none",
				intervalGap: options?.endTimestamp?.intervalGap ?? 5000,
			},
		};
		this.features = LRC_MODE_FEATURES[this.options.mode];
	}

	private get usesFirstWordStartTime(): boolean {
		return this.options.inlineBracket === "square";
	}

	public generate(input: LyricParseResult | LyricLine[]): string {
		const metadata = Array.isArray(input) ? [] : input.metadata;
		const sourceLines = Array.isArray(input) ? input : input.lines;

		const outputLines: string[] = [];

		const metaLines = generateLrcMetadataLines(metadata);
		if (metaLines.length > 0) {
			outputLines.push(...metaLines);
		}

		const lines = sourceLines.map(normalizeLine).filter(hasText);

		const backgroundVocals = new Set<LyricLine>();
		for (const [index, line] of lines.entries()) {
			if (line.isBG) continue;
			const nextLine = lines[index + 1];
			const backgroundVocal = nextLine?.isBG ? nextLine : undefined;
			if (backgroundVocal) backgroundVocals.add(backgroundVocal);
		}

		for (const [index, line] of lines.entries()) {
			if (backgroundVocals.has(line)) continue;
			const nextLine = lines[index + 1];
			const backgroundVocal =
				!line.isBG && nextLine?.isBG ? nextLine : undefined;
			let nextMainLine: LyricLine | undefined;
			for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex++) {
				if (!lines[nextIndex].isBG) {
					nextMainLine = lines[nextIndex];
					break;
				}
			}

			this.processSingleLine(line, backgroundVocal, nextMainLine, outputLines);
		}

		return outputLines.join("\n");
	}

	private processSingleLine(
		line: LyricLine,
		backgroundVocal: LyricLine | undefined,
		nextLine: LyricLine | undefined,
		outputLines: string[],
	): void {
		const { auxiliaryLines: auxConfig } = this.options;
		const { inlineAuxiliary } = this.features;

		const transInline = inlineAuxiliary && auxConfig.translation.inline;
		const romaInline =
			inlineAuxiliary && !transInline && auxConfig.romanization.inline;
		const bgvInline =
			inlineAuxiliary &&
			!transInline &&
			!romaInline &&
			auxConfig.backgroundVocal.inline;

		const lineTimeTag = this.formatTimeTag(line.startTime, "square");

		let transText = auxConfig.translation.enabled ? line.translatedLyric : "";
		let romaText = auxConfig.romanization.enabled ? line.romanLyric : "";
		let bgLine = auxConfig.backgroundVocal.enabled
			? backgroundVocal
			: undefined;

		let mainLineText = joinWords(line.words);

		if (inlineAuxiliary) {
			const applyInline = (text: string) => {
				mainLineText += `${mainLineText ? " " : ""}(${text})`;
			};

			if (transInline && transText) {
				applyInline(transText);
				transText = "";
			} else if (romaInline && romaText) {
				applyInline(romaText);
				romaText = "";
			} else if (bgvInline && bgLine) {

				mainLineText += `${mainLineText ? " " : ""}(${joinWords(bgLine.words)})`;

				if (auxConfig.translation.enabled && bgLine.translatedLyric) {
					transText = transText
						? `${transText} (${bgLine.translatedLyric})`
						: `(${bgLine.translatedLyric})`;
				}
				if (auxConfig.romanization.enabled && bgLine.romanLyric) {
					romaText = romaText
						? `${romaText} (${bgLine.romanLyric})`
						: `(${bgLine.romanLyric})`;
				}

				bgLine = undefined;
			}
		}

		outputLines.push(this.renderBaseItem(line, mainLineText, line.isBG));

		if (bgLine) {
			outputLines.push(
				this.renderBaseItem(bgLine, joinWords(bgLine.words), true),
			);
		}

		const auxTexts =
			auxConfig.order === "translation-first"
				? [transText, romaText]
				: [romaText, transText];

		for (const auxText of auxTexts) {
			if (auxText) outputLines.push(`${lineTimeTag}${auxText}`);
		}

		this.processEndTimestamp(line, nextLine, outputLines);
	}

	private renderBaseItem(
		item: LyricLine,
		lineText: string,
		isBgv: boolean,
	): string {
		const { inlineBracket } = this.options;
		const { wordLevel } = this.features;

		if (wordLevel && isWordSyncLyric(item.words, item.startTime)) {

			const words = item.words;

			const leadingTimestamp = this.usesFirstWordStartTime
				? words[0].startTime
				: item.startTime;
			let output = this.formatTimeTag(leadingTimestamp, "square");

			for (let i = 0; i < words.length; i++) {
				const word = words[i];

				if (i > 0 || !this.usesFirstWordStartTime) {
					output += this.formatTimeTag(word.startTime, inlineBracket);
				}

				let wordText = word.word;
				if (isBgv) {
					if (i === 0) wordText = `(${wordText}`;
					if (i === words.length - 1) wordText = `${wordText})`;
				}
				output += wordText;

				if (i === words.length - 1) {
					output += this.formatTimeTag(word.endTime, inlineBracket);
				}
			}

			return output;
		}

		const timeTag = this.formatTimeTag(item.startTime, "square");
		const textToUse = isBgv ? `(${lineText})` : lineText;
		let output = `${timeTag}${textToUse}`;

		if (wordLevel) {
			output += this.formatTimeTag(item.endTime, "square");
		}

		return output;
	}

	private processEndTimestamp(
		line: LyricLine,
		nextLine: LyricLine | undefined,
		outputLines: string[],
	): void {
		const { mode: endTsMode, intervalGap: endTsGap } =
			this.options.endTimestamp;

		if (this.features.wordLevel || endTsMode === "none") return;

		const gap = nextLine ? nextLine.startTime - line.endTime : Infinity;

		if (
			endTsMode === "always" ||
			(endTsMode === "interval" && gap >= endTsGap)
		) {
			outputLines.push(this.formatTimeTag(line.endTime, "square"));
		}
	}

	private formatTimeTag(
		ms: number,
		bracket: "angle" | "square" = "square",
	): string {
		const content = formatTime(clampTimestamp(ms));
		return bracket === "angle" ? `<${content}>` : `[${content}]`;
	}
}
