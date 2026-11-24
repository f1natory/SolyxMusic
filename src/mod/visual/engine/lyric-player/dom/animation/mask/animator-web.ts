
import type { LineMaskAnimator, MaskContext, MaskTargetWord } from "./types.ts";
import { generateFadeGradient } from "./utils.ts";

interface KeyframeTimelineCursor {
	curPos: number;
	lastPos: number;
	timeOffset: number;
	lastTime: number;
	lastTimeStamp: number;
	frames: Keyframe[];
}

interface KeyframeConfig {
	readonly minOffset: number;
	readonly fadeWidth: number;
}

export class WebMaskAnimator implements LineMaskAnimator {
	private readonly animations: Animation[] = [];
	private readonly totalFadeDuration: number;

	constructor(
		private readonly words: ReadonlyArray<MaskTargetWord>,
		private readonly context: MaskContext,
	) {
		this.totalFadeDuration =
			this.context.lineEndTime - this.context.lineStartTime;
	}

	public apply(): void {
		this.buildAnimations();
	}

	public setCurrentTime(timeRelative: number, isPlaying: boolean): void {
		const t = Math.min(this.totalFadeDuration, Math.max(0, timeRelative));
		for (const a of this.animations) {
			a.currentTime = t;
			a.playbackRate = 1;
			const endTime = this.getAnimationEndTime(a);

			if (isPlaying && t < endTime) {
				a.play();
			} else {
				a.pause();
			}
		}
	}

	public pause(): void {
		for (const a of this.animations) {
			a.pause();
		}
	}

	public resume(): void {
		for (const a of this.animations) {
			const endTime = this.getAnimationEndTime(a);
			const currentTime = Number(a.currentTime ?? 0);

			if (a.playState !== "finished" && currentTime < endTime) {
				a.play();
			}
		}
	}

	private buildAnimations(): void {
		for (const [i, word] of this.words.entries()) {
			const wordEl = word.mainElement;
			if (!wordEl) continue;

			const fadeWidth = word.height * this.context.wordFadeWidth;

			this.updateWordMaskStyles(wordEl, word, fadeWidth);

			const frames = this.generateWordKeyframes(word, i, fadeWidth);

			try {
				const ani = wordEl.animate(frames, {
					duration: Math.max(this.totalFadeDuration, 1),
					id: `fade-word-${word.word}-${i}`,
					fill: "both",
				});
				ani.pause();
				this.animations.push(ani);
			} catch (err) {
				console.warn(
					"Failed to apply gradient animation",
					frames,
					this.totalFadeDuration,
					err,
				);
			}
		}
	}

	private updateWordMaskStyles(
		wordEl: HTMLElement,
		word: MaskTargetWord,
		fadeWidth: number,
	): void {
		const [maskImage, totalAspect] = generateFadeGradient(
			fadeWidth / (word.width + word.padding * 2),
		);

		Object.assign(wordEl.style, {
			maskImage,
			maskRepeat: "no-repeat",
			maskSize: `${totalAspect * 100}% 100%`,
		});
	}

	private generateWordKeyframes(
		targetWord: MaskTargetWord,
		targetIndex: number,
		fadeWidth: number,
	): Keyframe[] {

		const widthBeforeSelf =
			this.words.slice(0, targetIndex).reduce((a, b) => a + b.width, 0) +
			(this.words[0] ? fadeWidth : 0);

		const minOffset = -(targetWord.width + targetWord.padding * 2 + fadeWidth);
		const initialPos =
			-widthBeforeSelf - targetWord.width - targetWord.padding - fadeWidth;

		const config: KeyframeConfig = { minOffset, fadeWidth };
		const cursor: KeyframeTimelineCursor = {
			curPos: initialPos,
			lastPos: initialPos,
			timeOffset: 0,
			lastTime: 0,
			lastTimeStamp: 0,
			frames: [],
		};

		this.pushClampedKeyframe(cursor, config.minOffset);

		for (const [j, otherWord] of this.words.entries()) {

			this.advancePauseTimeline(cursor, otherWord.startTime, config);

			const rubySegments =
				otherWord.ruby?.filter((r) => Boolean(r?.word?.trim())) ?? [];
			if (rubySegments.length > 0) {
				this.advanceRubyWordTimeline(
					cursor,
					otherWord,
					rubySegments,
					config,
					j,
				);
			} else {
				this.advancePlainWordTimeline(cursor, otherWord, config, j);
			}
		}

		return cursor.frames;
	}

	private advancePauseTimeline(
		cursor: KeyframeTimelineCursor,
		targetStartTime: number,
		config: KeyframeConfig,
	): void {
		const curTimeStamp = targetStartTime - this.context.lineStartTime;
		const staticDuration = curTimeStamp - cursor.lastTimeStamp;

		if (staticDuration > 0) {
			this.advanceTimelineStep(cursor, config, staticDuration, 0);
		}
		cursor.lastTimeStamp = curTimeStamp;
	}

	private advanceRubyWordTimeline(
		cursor: KeyframeTimelineCursor,
		otherWord: MaskTargetWord,
		rubySegments: NonNullable<MaskTargetWord["ruby"]>,
		config: KeyframeConfig,
		wordIndex: number,
	): void {
		const rubyCharCount = rubySegments.reduce(
			(sum, r) => sum + r.word.length,
			0,
		);
		const widthPerChar = otherWord.width / rubyCharCount;
		let charIndex = 0;

		for (const ruby of rubySegments) {
			const rubyStart = Math.max(ruby.startTime, otherWord.startTime);
			const rubyEnd = Math.min(
				Math.max(ruby.endTime, rubyStart),
				otherWord.endTime,
			);

			const rubyStartStamp = rubyStart - this.context.lineStartTime;
			const rubyStaticDuration = rubyStartStamp - cursor.lastTimeStamp;
			if (rubyStaticDuration > 0) {
				this.advanceTimelineStep(cursor, config, rubyStaticDuration, 0);
			}
			cursor.lastTimeStamp = rubyStartStamp;

			const rubyDuration = Math.max(0, rubyEnd - rubyStart);
			const perCharDuration = rubyDuration / ruby.word.length;

			for (let i = 0; i < ruby.word.length; i++) {
				let movePx = widthPerChar;
				if (wordIndex === 0 && charIndex === 0)
					movePx += config.fadeWidth * 1.5;
				if (
					wordIndex === this.words.length - 1 &&
					charIndex === rubyCharCount - 1
				)
					movePx += config.fadeWidth * 0.5;

				this.advanceTimelineStep(cursor, config, perCharDuration, movePx);
				cursor.lastTimeStamp += perCharDuration;
				charIndex++;
			}
		}

		const wordEndStamp = Math.max(
			otherWord.endTime - this.context.lineStartTime,
			cursor.lastTimeStamp,
		);
		const wordTailDuration = wordEndStamp - cursor.lastTimeStamp;
		if (wordTailDuration > 0) {
			this.advanceTimelineStep(cursor, config, wordTailDuration, 0);
		}
		cursor.lastTimeStamp = wordEndStamp;
	}

	private advancePlainWordTimeline(
		cursor: KeyframeTimelineCursor,
		otherWord: MaskTargetWord,
		config: KeyframeConfig,
		wordIndex: number,
	): void {
		const { startTime, endTime, width } = otherWord;
		const fadeDuration = Math.max(0, endTime - startTime);

		let movePx = width;
		if (wordIndex === 0) {
			movePx += config.fadeWidth * 1.5;
		}
		if (wordIndex === this.words.length - 1) {
			movePx += config.fadeWidth * 0.5;
		}

		this.advanceTimelineStep(cursor, config, fadeDuration, movePx);
		cursor.lastTimeStamp += fadeDuration;
	}

	private advanceTimelineStep(
		cursor: KeyframeTimelineCursor,
		config: KeyframeConfig,
		duration: number,
		movePx: number,
	): void {
		cursor.timeOffset += duration / this.totalFadeDuration;
		cursor.curPos += movePx;

		if (duration > 0) {
			this.pushClampedKeyframe(cursor, config.minOffset);
		}
	}

	private pushClampedKeyframe(
		cursor: KeyframeTimelineCursor,
		minOffset: number,
	): void {
		const moveOffset = cursor.curPos - cursor.lastPos;
		const time = Math.min(1, Math.max(0, cursor.timeOffset));
		const duration = time - cursor.lastTime;
		const msPerPixel = moveOffset !== 0 ? Math.abs(duration / moveOffset) : 0;

		if (cursor.curPos > minOffset && cursor.lastPos < minOffset) {
			const staticTime = Math.abs(cursor.lastPos - minOffset) * msPerPixel;
			cursor.frames.push({
				offset: cursor.lastTime + staticTime,
				maskPosition: `${Math.min(Math.max(cursor.lastPos, minOffset), 0)}px 0`,
			});
		}

		if (cursor.curPos > 0 && cursor.lastPos < 0) {
			const staticTime = Math.abs(cursor.lastPos) * msPerPixel;
			cursor.frames.push({
				offset: cursor.lastTime + staticTime,
				maskPosition: `${Math.min(Math.max(cursor.curPos, minOffset), 0)}px 0`,
			});
		}

		cursor.frames.push({
			offset: time,
			maskPosition: `${Math.min(Math.max(cursor.curPos, minOffset), 0)}px 0`,
		});

		cursor.lastPos = cursor.curPos;
		cursor.lastTime = time;
	}

	private getAnimationEndTime(animation: Animation): number {
		const timing = animation.effect?.getComputedTiming();
		return Number(timing?.delay ?? 0) + Number(timing?.duration ?? 0);
	}

	public dispose(): void {
		for (const a of this.animations) {
			a.cancel();
		}
		this.animations.length = 0;

		for (const word of this.words) {
			const wordEl = word.mainElement;
			if (wordEl) {
				wordEl.style.removeProperty("mask");
			}
		}
	}
}
