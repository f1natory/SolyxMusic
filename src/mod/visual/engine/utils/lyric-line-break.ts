
import { isCJK } from "./is-cjk.ts";

export interface ChildNodeInfo {
	width: number;
	text: string;
	isSpace: boolean;
}

const OVERFLOW_PENALTY_MULTIPLIER = 1000;

const CJK_BREAK_PENALTY_RATIO = 0.15;

const NORMAL_BREAK_PENALTY_RATIO = 0.5;

const SPACE_BREAK_REWARD_RATIO = 0.4;

const PUNCTUATION_BREAK_REWARD_RATIO = 0.6;
const PUNCTUATION_REGEX = /[,.;:!?，。；：！？、）】》」』’”)[\]}>~…]$/;

export function calcBalancedBreaks(
	children: ChildNodeInfo[],
	containerWidth: number,
	fullText: string,
	segmenter: Intl.Segmenter,
): number[] {
	const n = children.length;
	if (n === 0 || containerWidth <= 0) {
		return [];
	}

	const cjkBoundaries = new Set<number>();
	let offset = 0;
	for (const { segment, isWordLike } of segmenter.segment(fullText)) {
		if (offset > 0 && isWordLike) {
			if ([...segment].some((ch) => isCJK(ch))) {
				cjkBoundaries.add(offset);
			}
		}
		offset += segment.length;
	}

	const charOffsets = new Int32Array(n + 1);
	const prefixWidth = new Float64Array(n + 1);
	for (let i = 0; i < n; i++) {
		charOffsets[i + 1] = charOffsets[i] + children[i].text.length;
		prefixWidth[i + 1] = prefixWidth[i] + children[i].width;
	}

	if (prefixWidth[n] <= containerWidth) {
		return [];
	}

	const dp = new Float64Array(n + 1).fill(Number.POSITIVE_INFINITY);
	const nextBreak = new Int32Array(n + 1).fill(-1);
	dp[n] = 0;

	const PENALTY_CJK = (containerWidth * CJK_BREAK_PENALTY_RATIO) ** 2;
	const PENALTY_NORMAL = (containerWidth * NORMAL_BREAK_PENALTY_RATIO) ** 2;

	for (let i = n - 1; i >= 0; i--) {
		for (let j = i + 1; j <= n; j++) {
			const w = prefixWidth[j] - prefixWidth[i];

			let lineCost = 0;

			if (w > containerWidth) {
				if (j === i + 1) {

					lineCost = (w - containerWidth) ** 2 * OVERFLOW_PENALTY_MULTIPLIER;
				} else {

					continue;
				}
			} else {

				lineCost = (containerWidth - w) ** 2;
			}

			let breakPenalty = 0;
			if (j < n) {
				const prevChild = children[j - 1];

				if (PUNCTUATION_REGEX.test(prevChild.text)) {
					breakPenalty = -(
						(containerWidth * PUNCTUATION_BREAK_REWARD_RATIO) **
						2
					);
				} else if (prevChild.isSpace) {
					breakPenalty = -((containerWidth * SPACE_BREAK_REWARD_RATIO) ** 2);
				} else if (cjkBoundaries.has(charOffsets[j])) {
					breakPenalty = PENALTY_CJK;
				} else {
					breakPenalty = PENALTY_NORMAL;
				}
			}

			const totalCost = lineCost + breakPenalty + dp[j];

			if (totalCost < dp[i]) {
				dp[i] = totalCost;
				nextBreak[i] = j;
			}
		}
	}

	const breaks: number[] = [];
	let curr = 0;
	while (curr < n) {
		curr = nextBreak[curr];
		if (curr > 0 && curr < n) {
			breaks.push(curr);
		}
	}

	return breaks;
}
