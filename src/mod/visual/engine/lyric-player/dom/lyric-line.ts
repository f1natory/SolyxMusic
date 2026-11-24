
import type { LyricLine, LyricWord } from "@visual/interfaces.ts";
import { LyricLineRenderMode } from "@visual/lyric-player/base/consts.ts";
import { LyricLineBase } from "@visual/lyric-player/base/line.ts";
import styles from "@visual/styles/lyric-player.module.css";
import { clampPositive } from "@visual/utils/clamp.ts";
import { isCJK } from "@visual/utils/is-cjk.ts";
import { LineBalancer } from "@visual/utils/line-balancer.ts";
import { chunkAndSplitLyricWords } from "@visual/utils/lyric-split-words.ts";
import { Duration } from "@visual/utils/time.ts";
import type { DomLyricPlayer } from ".";
import {
	createEmphasizeAnimation,
	createFloatAnimation,
	createLineMaskAnimator,
	type LineMaskAnimator,
} from "./animation/index.ts";
import { LineBrightness } from "./line-brightness.ts";

interface RealWord extends LyricWord {
	mainElement: HTMLSpanElement;
	subElements: HTMLSpanElement[];
	elementAnimations: Animation[];
	width: number;
	height: number;
	padding: number;
	shouldEmphasize: boolean;
}

export class LyricLineEl extends LyricLineBase {
	private readonly element: HTMLElement = document.createElement("div");
	private splittedWords: RealWord[] = [];

	private built = false;

	private renderMode: LyricLineRenderMode = LyricLineRenderMode.SOLID;
	private maskAnimator?: LineMaskAnimator;

	private readonly brightness: LineBrightness;

	private maskSignature = "";

	private lastLineSize?: [number, number];

	private lastScaleNum = -1;

	private readonly lineHasRubyWords: boolean;
	private readonly lineHasRomanWords: boolean;

	private readonly balancer?: LineBalancer;

	constructor(
		private readonly lyricPlayer: DomLyricPlayer,
		private readonly lyricLine: LyricLine = {
			words: [],
			translatedLyric: "",
			romanLyric: "",
			startTime: 0,
			endTime: 0,
			isBG: false,
			isDuet: false,
		},
	) {
		super();
		this.lineHasRubyWords = this.lyricLine.words.some(
			(word) => (word.ruby?.length ?? 0) > 0,
		);
		this.lineHasRomanWords = this.lyricLine.words.some(
			(word) => (word.romanWord?.trim().length ?? 0) > 0,
		);
		this.element.setAttribute("class", styles.lyricLine);
		if (this.lyricLine.isBG) {
			this.element.classList.add(styles.lyricBgLine);
		}
		if (this.lyricLine.isDuet) {
			this.element.classList.add(styles.lyricDuetLine);
		}
		this.element.appendChild(document.createElement("div"));
		this.element.appendChild(document.createElement("div"));
		this.element.appendChild(document.createElement("div"));
		const main = this.element.children[0] as HTMLDivElement;
		const trans = this.element.children[1] as HTMLDivElement;
		const roman = this.element.children[2] as HTMLDivElement;
		main.setAttribute("class", styles.lyricMainLine);
		this.brightness = new LineBrightness(
			main,
			!this.lyricPlayer._getIsNonDynamic(),
		);
		trans.setAttribute("class", styles.lyricSubLine);
		roman.setAttribute("class", styles.lyricSubLine);
		if (LyricLineBase.wordSegmenter) {
			this.balancer = new LineBalancer(main);
		}

		this.rebuildStyle();
	}

	private isEnabled = false;
	async enable(
		maskAnimationTime: number = this.lyricPlayer.getCurrentTime(),
		shouldPlay: boolean = this.lyricPlayer.getIsPlaying(),
	): Promise<void> {
		this.isEnabled = true;
		this.element.classList.add(styles.active);
		const main = this.element.children[0] as HTMLDivElement;

		const relativeTime = clampPositive(
			maskAnimationTime - this.lyricLine.startTime,
		);

		for (const word of this.splittedWords) {
			for (const a of word.elementAnimations) {
				a.currentTime = relativeTime;
				a.playbackRate = 1;

				const timing = a.effect?.getComputedTiming();
				const endTime =
					Number(timing?.delay ?? 0) + Number(timing?.duration ?? 0);
				if (shouldPlay && relativeTime < endTime) a.play();
				else a.pause();
			}
		}

		this.maskAnimator?.setCurrentTime(relativeTime, shouldPlay);

		main.classList.add(styles.active);
	}

	disable(): void {
		this.isEnabled = false;
		this.element.classList.remove(styles.active);
		this.setRenderMode(LyricLineRenderMode.SOLID);

		const main = this.element.children[0] as HTMLDivElement;

		for (const word of this.splittedWords) {
			for (const a of word.elementAnimations) {
				if (
					a.id === "float-word" ||
					a.id.includes("emphasize-word-float-only")
				) {
					a.playbackRate = -1;
					a.play();
				}
			}
		}

		this.maskAnimator?.pause();
		main.classList.remove(styles.active);
	}

	private lastWord?: RealWord;

	async resume(): Promise<void> {
		if (!this.isEnabled) return;
		for (const word of this.splittedWords) {
			for (const a of word.elementAnimations) {
				if (
					!this.lastWord ||
					this.splittedWords.indexOf(this.lastWord) <
						this.splittedWords.indexOf(word)
				) {
					const timing = a.effect?.getComputedTiming();
					const endTime =
						Number(timing?.delay ?? 0) + Number(timing?.duration ?? 0);
					if (
						a.playState !== "finished" &&
						((a.currentTime as number) || 0) < endTime
					)
						a.play();
				}
			}
		}
		this.maskAnimator?.resume();
	}

	async pause(): Promise<void> {
		if (!this.isEnabled) return;
		for (const word of this.splittedWords) {
			for (const a of word.elementAnimations) {
				a.pause();
			}
		}
		this.maskAnimator?.pause();
	}

	getLine(): LyricLine {
		return this.lyricLine;
	}

	show(): void {
		if (!this.built) {
			this.rebuildElement();
			this.built = true;
		} else if (!this.maskAnimator) {

			this.updateMaskImageSync();
		}
		this.brightness.sync();
	}

	hide(): void {
		this.brightness.deactivate();
	}

	private rebuildStyle(): void {
		const style = this.element.style;
		const currentScale = this.lineTransforms.scale.getCurrentPosition() / 100;

		if (Math.abs(currentScale - this.lastScaleNum) >= 0.0001) {
			this.lastScaleNum = currentScale;
			style.transform = `scale(${currentScale.toFixed(3)})`;
		}
	}

	override rebuildElement(): void {
		this.disposeElements();
		const main = this.element.children[0] as HTMLDivElement;
		const trans = this.element.children[1] as HTMLDivElement;
		const roman = this.element.children[2] as HTMLDivElement;

		if (this.lyricPlayer._getIsNonDynamic()) {
			main.textContent = this.lyricLine.words.map((w) => w.word).join("");
			this.setSubLinesText(trans, roman);
			this.syncMaskAfterRebuild();
			return;
		}

		const chunkedWords = chunkAndSplitLyricWords(this.lyricLine.words);
		main.innerHTML = "";

		for (const chunk of chunkedWords) {
			this.buildWord(chunk, main);
		}

		this.setSubLinesText(trans, roman);
		this.syncMaskAfterRebuild();
	}

	private syncMaskAfterRebuild(): void {
		if (this.element.isConnected) this.updateMaskImageSync();
	}

	private setSubLinesText(trans: HTMLDivElement, roman: HTMLDivElement) {
		trans.textContent = this.lyricLine.translatedLyric;
		roman.textContent = this.lyricLine.romanLyric;
	}

	private getRubyCharCount(word: LyricWord) {
		return (word.ruby ?? []).reduce(
			(total, ruby) => total + ruby.word.length,
			0,
		);
	}

	private getRubySegments(word: LyricWord) {
		return (word.ruby ?? []).filter(
			(ruby) => (ruby?.word?.trim().length ?? 0) > 0,
		);
	}

	private createWord(word: LyricWord, shouldEmphasize: boolean): RealWord {
		const mainWordEl = document.createElement("span");
		const subElements: HTMLSpanElement[] = [];
		const romanWord = word.romanWord?.trim() ?? "";
		const wordContainer = this.lineHasRubyWords
			? document.createElement("span")
			: mainWordEl;
		const wordTextContainer = this.lineHasRubyWords
			? document.createElement("span")
			: wordContainer;

		if (this.lineHasRubyWords) {
			const rubyWordEl = document.createElement("span");
			const rubySegments = this.getRubySegments(word);
			for (const ruby of rubySegments) {
				const rubyPartEl = document.createElement("span");
				rubyPartEl.textContent = ruby.word;
				rubyPartEl.dataset.startTime = String(ruby.startTime);
				rubyPartEl.dataset.endTime = String(ruby.endTime);
				rubyWordEl.appendChild(rubyPartEl);
			}
			rubyWordEl.classList.add(styles.rubyWord);
			mainWordEl.classList.add(styles.wordWithRuby);
			wordContainer.classList.add(styles.wordBody);
			wordTextContainer.classList.add(styles.rubyBaseWord);
			wordContainer.appendChild(wordTextContainer);
			mainWordEl.appendChild(rubyWordEl);
			mainWordEl.appendChild(wordContainer);
		}

		const displayWord = word.word;

		if (shouldEmphasize) {
			mainWordEl.classList.add(styles.emphasize);
			const trimmedWord = displayWord.trim();

			if (LyricLineBase.graphemeSegmenter) {
				for (const { segment } of LyricLineBase.graphemeSegmenter.segment(
					trimmedWord,
				)) {
					const charEl = document.createElement("span");
					charEl.textContent = segment;
					subElements.push(charEl);
					wordTextContainer.appendChild(charEl);
				}
			} else {
				for (const segment of Array.from(trimmedWord)) {
					const charEl = document.createElement("span");
					charEl.textContent = segment;
					subElements.push(charEl);
					wordTextContainer.appendChild(charEl);
				}
			}
		} else {
			if (this.lineHasRomanWords) {
				const wordEl = document.createElement("span");
				wordEl.textContent = displayWord.trim();
				wordTextContainer.appendChild(wordEl);
			} else if (romanWord.length === 0) {
				wordTextContainer.textContent = displayWord.trim();
			}
		}

		if (this.lineHasRomanWords) {
			const romanWordEl = document.createElement("span");
			romanWordEl.textContent = romanWord.length > 0 ? romanWord : "\u00A0";
			romanWordEl.classList.add(styles.romanWord);
			wordContainer.appendChild(romanWordEl);
		}

		const realWord: RealWord = {
			...word,
			mainElement: mainWordEl,
			subElements: subElements,
			elementAnimations: [
				createFloatAnimation(mainWordEl, {
					word: word,
					lineStartTime: this.lyricLine.startTime,
					isBG: this.lyricLine.isBG,
				}),
			],
			width: 0,
			height: 0,
			padding: 0,
			shouldEmphasize: shouldEmphasize,
		};

		return realWord;
	}

	private buildWord(input: LyricWord | LyricWord[], main: HTMLDivElement) {
		const chunk = Array.isArray(input) ? input : [input];
		if (chunk.length === 0) return;

		const isPureSpace = chunk.every((w) => !w.word.trim());
		if (isPureSpace) {
			const textContent = chunk.map((w) => w.word).join("");
			main.appendChild(document.createTextNode(textContent));
			return;
		}

		const merged = chunk.reduce(
			(a, b) => {
				a.endTime = Math.max(a.endTime, b.endTime);
				a.startTime = Math.min(a.startTime, b.startTime);
				a.word += b.word;
				return a;
			},
			{
				word: "",
				romanWord: "",
				startTime: Number.POSITIVE_INFINITY,
				endTime: Number.NEGATIVE_INFINITY,
				wordType: "normal",
				obscene: false,
			} as LyricWord,
		);

		let emp = chunk.some((word) => LyricLineBase.shouldEmphasize(word));
		if (!isCJK(merged.word)) {
			emp = emp || LyricLineBase.shouldEmphasize(merged);
		}

		const wrapperWordEl = document.createElement("span");
		wrapperWordEl.classList.add(styles.emphasizeWrapper);

		const characterElements: HTMLElement[] = [];

		for (const word of chunk) {
			if (!word.word.trim()) {
				wrapperWordEl.appendChild(document.createTextNode(word.word));
				continue;
			}

			const realWord = this.createWord(word, emp);

			if (emp) {
				characterElements.push(...realWord.subElements);
			}

			this.splittedWords.push(realWord);
			wrapperWordEl.appendChild(realWord.mainElement);
		}

		if (emp && this.splittedWords.length > 0) {
			const lastWordOfChunk = this.splittedWords[this.splittedWords.length - 1];
			const rubyCharCount = chunk.reduce(
				(total, word) => total + this.getRubyCharCount(word),
				0,
			);

			const lineWords = this.lyricLine.words;
			const isLastWord =
				lineWords.length > 0 &&
				merged.word.includes(lineWords[lineWords.length - 1].word);

			lastWordOfChunk.elementAnimations.push(
				...createEmphasizeAnimation({
					word: merged,
					characterElements: characterElements,
					duration: merged.endTime - merged.startTime,
					delay: merged.startTime - this.lyricLine.startTime,
					rubyCharCount: rubyCharCount,
					isBG: this.lyricLine.isBG,
					isLastWord: isLastWord,
				}),
			);
		}

		main.appendChild(wrapperWordEl);
	}

	override onLineSizeChange(size: [number, number]): void {
		if (
			this.maskAnimator &&
			this.lastLineSize &&
			this.lastLineSize[0] === size[0] &&
			this.lastLineSize[1] === size[1]
		) {
			return;
		}

		const isInitialObservation =
			!this.lastLineSize && Boolean(this.maskAnimator);
		this.lastLineSize = [size[0], size[1]];

		if (isInitialObservation) {
			return;
		}

		this.updateMaskImageSync();
	}
	private measureWords(): void {
		const words = this.splittedWords;
		if (words.length === 0) return;

		const firstEl = words[0].mainElement;
		const padding = firstEl
			? Number.parseFloat(getComputedStyle(firstEl).paddingLeft)
			: 0;

		for (const word of words) {
			const el = word.mainElement;
			if (el) {
				word.padding = padding;
				word.width = el.clientWidth - padding * 2;
				word.height = el.clientHeight - padding * 2;
			} else {
				word.width = 0;
				word.height = 0;
				word.padding = 0;
			}
		}
	}

	private computeMaskSignature(
		containerWidth: number,
		maxEndTime: number,
	): string {

		let signature = `${this.splittedWords.length}|${this.lyricLine.startTime}|${maxEndTime}|${containerWidth}|${this.lyricPlayer.getWordFadeWidth()}|${this.lyricPlayer.supportMaskImage ? 1 : 0}|${this.lyricPlayer._getIsNonDynamic() ? 1 : 0}`;
		for (const word of this.splittedWords) {
			signature += `|${word.width},${word.height},${word.padding}`;
		}
		return signature;
	}

	updateMaskImageSync(): boolean {

		if (!this.element.isConnected) {
			this.invalidateMask();
			return false;
		}

		const mainStyle = getComputedStyle(this.element.children[0]);

		this.measureWords();

		this.brightness.captureGeometry(mainStyle);

		const maxEndTime = Math.max(
			0,
			...this.splittedWords.map((w) => w.endTime),
			this.lyricLine.endTime,
		);

		const containerWidth = this.balancer?.getContainerWidth(mainStyle) ?? 0;
		const signature = this.computeMaskSignature(containerWidth, maxEndTime);

		if (this.maskAnimator && signature === this.maskSignature) return false;
		this.maskSignature = signature;

		if (this.balancer && LyricLineBase.wordSegmenter) {
			this.balancer.balanceLineBreaks(
				this.lyricPlayer._getIsNonDynamic(),
				this.splittedWords.length > 0,
				LyricLineBase.wordSegmenter,
				mainStyle,
			);
		}

		this.maskAnimator?.dispose();

		this.maskAnimator = createLineMaskAnimator(this.splittedWords, {
			lineStartTime: this.lyricLine.startTime,
			lineEndTime: maxEndTime,
			wordFadeWidth: this.lyricPlayer.getWordFadeWidth(),
			supportMaskImage: this.lyricPlayer.supportMaskImage,
		});

		this.maskAnimator.apply();
		this.brightness.sync(true);

		if (this.isEnabled) {
			const isPlayerRunning = this.lyricPlayer.getIsPlaying?.() ?? true;
			this.enable(this.lyricPlayer.getCurrentTime(), isPlayerRunning);
		}

		return true;
	}

	getElement(): HTMLElement {
		return this.element;
	}

	private setRenderMode(mode: LyricLineRenderMode): void {
		if (this.renderMode === mode) return;

		if (this.renderMode === LyricLineRenderMode.GRADIENT) {
			this.brightness.markHighlightExited();
		}

		this.renderMode = mode;
		this.element.classList.toggle(
			styles.gradientMask,
			mode === LyricLineRenderMode.GRADIENT,
		);
	}

	override setTransform(
		scale: number = this.scale,
		opacity: number = this.opacity,
		blur = 0,
		delay: Duration = Duration.ZERO,
		mode: LyricLineRenderMode = LyricLineRenderMode.SOLID,
		inBrightnessWindow = true,
	): void {
		super.setTransform(scale, opacity, blur, delay);

		const isColdActivation =
			this.renderMode !== LyricLineRenderMode.GRADIENT &&
			mode === LyricLineRenderMode.GRADIENT &&
			!this.brightness.isReady;

		this.setRenderMode(mode);
		this.top = 0;
		this.scale = scale;
		this.delay = delay;

		this.brightness.setInWindow(inBrightnessWindow);

		if (isColdActivation) {
			this.brightness.playActivationTransition();
		}

		if (this.lyricPlayer.getEnableSpring()) {
			this.lineTransforms.scale.setTargetPosition(scale);
		} else {
			this.lineTransforms.scale.setPosition(scale);
		}
	}

	update(delta: Duration = Duration.ZERO): void {
		if (!this.lyricPlayer.getEnableSpring()) return;

		const scaleMoving = !this.lineTransforms.scale.arrived();
		this.lineTransforms.scale.update(delta);

		if (scaleMoving) {
			this.isUiDirty = true;
		}
	}

	override commitChanges(): void {
		if (this.isUiDirty) {
			this.rebuildStyle();
			this.isUiDirty = false;
		}
	}

	_getDebugTargetPos(): string {
		return `[offset: ${this.top}; scale: ${this.scale}; delay: ${this.delay}]`;
	}

	private invalidateMask(): void {
		this.maskAnimator?.dispose();
		this.maskAnimator = undefined;
		this.maskSignature = "";
		this.lastLineSize = undefined;
	}

	private disposeElements() {
		this.brightness.deactivate();
		this.balancer?.reset();
		this.invalidateMask();

		for (const realWord of this.splittedWords) {
			for (const a of realWord.elementAnimations) {
				a.cancel();
			}
			for (const sub of realWord.subElements) {
				sub.remove();
				sub.parentNode?.removeChild(sub);
			}
			realWord.elementAnimations = [];
			realWord.subElements = [];
			if (realWord.mainElement?.parentNode) {
				realWord.mainElement.parentNode.removeChild(realWord.mainElement);
			}
		}
		this.splittedWords = [];
		const main = this.element.children[0] as HTMLDivElement;
		const trans = this.element.children[1] as HTMLDivElement;
		const roman = this.element.children[2] as HTMLDivElement;
		if (main) main.innerHTML = "";
		if (trans) trans.innerHTML = "";
		if (roman) roman.innerHTML = "";
	}
	override dispose(): void {
		this.brightness.dispose();
		this.disposeElements();
		this.element.remove();
	}
}
