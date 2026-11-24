
import type { Disposable, LyricLine, LyricWord } from "@visual/interfaces.ts";
import { isCJK } from "@visual/utils/is-cjk.ts";
import { Spring } from "@visual/utils/spring.ts";
import { Duration } from "@visual/utils/time.ts";
import { LyricLineRenderMode } from "./consts.ts";

interface LineTransforms {
	scale: Spring;
}

export abstract class LyricLineBase extends EventTarget implements Disposable {
	protected top = 0;
	protected scale = 1;
	protected blur = 0;
	protected opacity = 1;
	protected delay: Duration = Duration.ZERO;

	protected isUiDirty = true;

	readonly lineTransforms: LineTransforms = {
		scale: new Spring(100),
	};

	static readonly wordSegmenter: Intl.Segmenter | null =
		typeof Intl !== "undefined" && Intl.Segmenter
			? new Intl.Segmenter(undefined, { granularity: "word" })
			: null;

	static readonly graphemeSegmenter: Intl.Segmenter | null =
		typeof Intl !== "undefined" && Intl.Segmenter
			? new Intl.Segmenter(undefined, { granularity: "grapheme" })
			: null;

	abstract getLine(): LyricLine;
	abstract enable(time?: number, shouldPlay?: boolean): void;
	abstract disable(): void;
	abstract resume(): void;
	abstract pause(): void;
	abstract onLineSizeChange(size: [number, number]): void;
	abstract commitChanges(): void;

	setTransform(
		scale: number = this.scale,
		opacity: number = this.opacity,
		blur: number = this.blur,
		delay: Duration = Duration.ZERO,
		_mode: LyricLineRenderMode = LyricLineRenderMode.SOLID,
		_inBrightnessWindow: boolean = true,
	): void {
		this.scale = scale;
		this.opacity = opacity;
		this.blur = blur;
		this.delay = delay;
		this.isUiDirty = true;
	}

	rebuildElement(): void {}

	static shouldEmphasize(word: LyricWord): boolean {
		if (isCJK(word.word)) return word.endTime - word.startTime >= 1000;

		return (
			word.endTime - word.startTime >= 1000 &&
			word.word.trim().length <= 7 &&
			word.word.trim().length > 1
		);
	}
	abstract update(delta?: Duration): void;
	dispose(): void {}
}
