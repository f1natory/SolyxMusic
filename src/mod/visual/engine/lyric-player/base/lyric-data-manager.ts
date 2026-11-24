
import structuredClone from "@ungap/structured-clone";
import type { LyricLine, LyricWord, OptimizeLyricOptions } from "@visual/interfaces.ts";
import { optimizeLyricLines } from "@visual/utils/optimize-lyric.ts";
import { assertValidLyricTimestamps } from "@visual/utils/validate-lyric.ts";
import { MaskObsceneWordsMode } from "./consts.ts";

export interface LyricDataConfig {
	optimizeOptions?: OptimizeLyricOptions;
	maskMode?: MaskObsceneWordsMode;
	maskChar?: string;
}

export class LyricDataManager {

	private rawLines: LyricLine[] = [];

	private processedLines: LyricLine[] = [];

	private isDirty = true;

	private optimizeOpts: OptimizeLyricOptions = {};
	private maskMode: MaskObsceneWordsMode = MaskObsceneWordsMode.Disabled;
	private maskChar = "*";

	private isNonDynamic = false;
	private hasDuetLine = false;

	public setOriginalLines(lines: LyricLine[]): void {
		assertValidLyricTimestamps(lines);
		this.rawLines = structuredClone(lines);
		this.isDirty = true;
	}

	public setConfig(config: LyricDataConfig): void {
		if (config.optimizeOptions) {
			this.optimizeOpts = { ...this.optimizeOpts, ...config.optimizeOptions };
		}

		this.maskMode = config.maskMode ?? this.maskMode;
		this.maskChar = config.maskChar?.charAt(0) ?? this.maskChar;

		this.isDirty = true;
	}

	public getRawLines(): ReadonlyArray<LyricLine> {
		return this.rawLines;
	}

	public getProcessedLines(): ReadonlyArray<LyricLine> {
		this.ensurePipeline();
		return this.processedLines;
	}

	public getIsNonDynamic(): boolean {
		this.ensurePipeline();
		return this.isNonDynamic;
	}

	public getHasDuetLine(): boolean {
		this.ensurePipeline();
		return this.hasDuetLine;
	}

	public getOptimizeOptions(): OptimizeLyricOptions {
		return this.optimizeOpts;
	}
	public getMaskMode(): MaskObsceneWordsMode {
		return this.maskMode;
	}
	public getMaskChar(): string {
		return this.maskChar;
	}

	private ensurePipeline(): void {
		if (!this.isDirty) return;
		this.processPipeline();
		this.isDirty = false;
	}

	private processPipeline(): void {
		this.processedLines = structuredClone(this.rawLines);

		optimizeLyricLines(this.processedLines, this.optimizeOpts);

		let checkNonDynamic = true;
		let checkDuet = false;

		for (const line of this.processedLines) {
			if (line.words.length > 1) checkNonDynamic = false;
			if (line.isDuet) checkDuet = true;

			for (const word of line.words) {
				this.applyMask(word);
			}
		}

		this.isNonDynamic = checkNonDynamic && this.processedLines.length > 0;
		this.hasDuetLine = checkDuet;
	}

	private applyMask(word: LyricWord): void {
		if (!word.obscene || this.maskMode === MaskObsceneWordsMode.Disabled) {
			return;
		}

		const text = word.word;
		const maskChar = this.maskChar;

		if (this.maskMode === MaskObsceneWordsMode.FullMask) {
			word.word = text.replace(/\S/g, maskChar);
		} else if (this.maskMode === MaskObsceneWordsMode.PartialMask) {
			const trimmed = text.trim();
			if (trimmed.length <= 2) {
				word.word = text.replace(/\S/g, maskChar);
			} else {
				const startPos = text.indexOf(trimmed);
				const endPos = startPos + trimmed.length - 1;
				word.word =
					text.slice(0, startPos + 1) +
					text.slice(startPos + 1, endPos).replace(/\S/g, maskChar) +
					text.slice(endPos);
			}
		}
	}
}
