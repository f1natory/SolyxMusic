
import type { LyricWord } from "@visual/interfaces.ts";

export interface FloatAnimationOptions {

	word: LyricWord;

	lineStartTime: number;

	isBG: boolean;
}

export function createFloatAnimation(
	wordEl: HTMLElement,
	options: FloatAnimationOptions,
): Animation {
	const { word, lineStartTime, isBG } = options;

	const delay = word.startTime - lineStartTime;
	const duration = Math.max(1000, word.endTime - word.startTime);

	let up = 0.05;
	if (isBG) {
		up *= 2;
	}

	const a = wordEl.animate(
		[{ transform: "translateY(0px)" }, { transform: `translateY(${-up}em)` }],
		{
			duration: Number.isFinite(duration) ? duration : 0,
			delay: Number.isFinite(delay) ? delay : 0,
			id: "float-word",
			composite: "add",
			fill: "both",
			easing: "ease-out",
		},
	);

	a.pause();
	return a;
}
