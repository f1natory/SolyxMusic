
import bezier from "bezier-easing";
import type { LyricWord } from "@visual/interfaces.ts";
import { clamp01, clampPositive } from "@visual/utils/clamp.ts";
import { createMatrix4, matrix4ToCSS, scaleMatrix4 } from "@visual/utils/matrix.ts";

const ANIMATION_FRAME_QUANTITY = 32;

const norNum = (min: number, max: number) => (x: number) =>
	clamp01((x - min) / (max - min));
const EMP_EASING_MID = 0.5;
const beginNum = norNum(0, EMP_EASING_MID);
const endNum = norNum(EMP_EASING_MID, 1);

const bezIn = bezier(0.2, 0.4, 0.58, 1.0);
const bezOut = bezier(0.3, 0.0, 0.58, 1.0);

const makeEmpEasing = (mid: number) => {
	return (x: number) => (x < mid ? bezIn(beginNum(x)) : 1 - bezOut(endNum(x)));
};
const empEasing = makeEmpEasing(EMP_EASING_MID);

export interface EmphasizeAnimationOptions {

	word: LyricWord;

	characterElements: HTMLElement[];

	duration: number;

	delay: number;

	rubyCharCount: number;

	isBG: boolean;

	isLastWord: boolean;
}

interface EmphasizeParams {
	amount: number;
	blur: number;
	du: number;
	de: number;
	anchorCharCount: number;
	animateDu: number;
}

export function createEmphasizeAnimation(
	options: EmphasizeAnimationOptions,
): Animation[] {
	const params = calculateEmphasizeParams(options);
	const totalChars = options.characterElements.length;
	const result: Animation[] = [];

	options.characterElements.forEach((el, i) => {
		const wordDe = params.de + (params.du / 2.5 / params.anchorCharCount) * i;

		result.push(createCharGlowAnimation(el, i, totalChars, wordDe, params));
		result.push(createCharFloatAnimation(el, wordDe, options.isBG, params));
	});

	return result;
}

function calculateEmphasizeParams(
	options: EmphasizeAnimationOptions,
): EmphasizeParams {
	const { duration, delay, rubyCharCount, characterElements, isLastWord } =
		options;

	const de = clampPositive(delay);
	let du = Math.max(1000, duration);
	const anchorCharCount =
		rubyCharCount > 0 ? rubyCharCount : Math.max(1, characterElements.length);

	let amount = du / 2000;
	amount = amount > 1 ? Math.sqrt(amount) : amount ** 3;

	let blur = du / 3000;
	blur = blur > 1 ? Math.sqrt(blur) : blur ** 3;

	amount *= 0.6;
	blur *= 0.5;

	if (isLastWord) {
		amount *= 1.6;
		blur *= 1.5;
		du *= 1.2;
	}

	amount = Math.min(1.2, amount);
	blur = Math.min(0.8, blur);

	const animateDu = Number.isFinite(du) ? du : 0;

	return {
		amount,
		blur,
		du,
		de,
		anchorCharCount,
		animateDu,
	};
}

function generateGlowKeyframes(
	charIndex: number,
	totalChars: number,
	amount: number,
	blur: number,
): Keyframe[] {
	return new Array(ANIMATION_FRAME_QUANTITY).fill(0).map((_, j) => {
		const x = (j + 1) / ANIMATION_FRAME_QUANTITY;
		const transX = empEasing(x);
		const glowLevel = transX * blur;

		const mat = scaleMatrix4(createMatrix4(), 1 + transX * 0.1 * amount);

		const offsetX = -transX * 0.03 * amount * (totalChars / 2 - charIndex);
		const offsetY = -transX * 0.025 * amount;

		return {
			offset: x,
			transform: `${matrix4ToCSS(mat, 4)} translate(${offsetX}em, ${offsetY}em)`,
			textShadow: `0 0 ${Math.min(0.3, blur * 0.3)}em rgba(255, 255, 255, ${glowLevel})`,
		};
	});
}

function generateFloatKeyframes(isBG: boolean): Keyframe[] {
	return new Array(ANIMATION_FRAME_QUANTITY).fill(0).map((_, j) => {
		const x = (j + 1) / ANIMATION_FRAME_QUANTITY;
		let y = Math.sin(x * Math.PI);
		if (isBG) {
			y *= 2;
		}

		return {
			offset: x,
			transform: `translateY(${-y * 0.05}em)`,
		};
	});
}

function createCharGlowAnimation(
	el: HTMLElement,
	charIndex: number,
	totalChars: number,
	wordDelay: number,
	params: EmphasizeParams,
): Animation {
	const frames = generateGlowKeyframes(
		charIndex,
		totalChars,
		params.amount,
		params.blur,
	);

	const glow = el.animate(frames, {
		duration: params.animateDu,
		delay: Number.isFinite(wordDelay) ? wordDelay : 0,
		id: `emphasize-word-${el.textContent}-${charIndex}`,
		iterations: 1,
		composite: "replace",
		fill: "both",
	});
	glow.onfinish = () => glow.pause();
	glow.pause();

	return glow;
}

function createCharFloatAnimation(
	el: HTMLElement,
	wordDelay: number,
	isBG: boolean,
	params: EmphasizeParams,
): Animation {
	const frames = generateFloatKeyframes(isBG);

	const float = el.animate(frames, {
		duration: params.animateDu * 1.4,

		delay: Number.isFinite(wordDelay) ? wordDelay - 400 : 0,
		id: "emphasize-word-float",
		iterations: 1,
		composite: "add",
		fill: "both",
	});
	float.onfinish = () => float.pause();
	float.pause();

	return float;
}
