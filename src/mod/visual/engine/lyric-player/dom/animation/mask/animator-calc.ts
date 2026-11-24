
import type { LineMaskAnimator, MaskContext, MaskTargetWord } from "./types.ts";
import { generateFadeGradient } from "./utils.ts";

export class CalcMaskAnimator implements LineMaskAnimator {
	constructor(
		private readonly words: ReadonlyArray<MaskTargetWord>,
		private readonly context: MaskContext,
	) {}

	public apply(): void {
		for (const word of this.words) {
			const {
				mainElement: wordEl,
				width: textWidth,
				padding: paddingLeft,
				height,
				startTime,
				endTime,
			} = word;

			const totalWordWidth = textWidth + paddingLeft * 2;
			const fadeWidth = height * this.context.wordFadeWidth;
			const [maskImage, totalAspect] = generateFadeGradient(
				fadeWidth / totalWordWidth,
			);
			const totalAspectStr = `${totalAspect * 100}% 100%`;

			const duration = Math.max(Math.abs(endTime - startTime), 1);
			const speed = textWidth / duration;
			const startPos = paddingLeft - totalWordWidth - fadeWidth / 2;
			const minOffset = -totalWordWidth - fadeWidth;

			const maskPos = `clamp(${minOffset}px, ${startPos}px + (var(--visual-player-time) - ${startTime}) * ${speed}px, 0px) 0px`;

			Object.assign(wordEl.style, {
				maskImage,
				webkitMaskImage: maskImage,
				maskRepeat: "no-repeat",
				webkitMaskRepeat: "no-repeat",
				maskSize: totalAspectStr,
				webkitMaskSize: totalAspectStr,
				maskPosition: maskPos,
				webkitMaskPosition: maskPos,
			});
		}
	}

	public setCurrentTime(_timeRelative: number, _isPlaying: boolean): void {}
	public pause(): void {}
	public resume(): void {}

	public dispose(): void {
		for (const word of this.words) {
			const wordEl = word.mainElement;
			if (wordEl) {
				["mask", "-webkit-mask"].forEach((prop) => {
					wordEl.style.removeProperty(prop);
				});
			}
		}
	}
}
