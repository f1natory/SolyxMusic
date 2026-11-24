
import type {
	Disposable,
	HasElement,
	LyricLine,
	OptimizeLyricOptions,
} from "@visual/interfaces.ts";
import styles from "@visual/styles/lyric-player.module.css";
import { clampPositive } from "@visual/utils/clamp.ts";
import { areOptimizeOptionsEqual } from "@visual/utils/optimize-lyric.ts";
import type { SpringParams } from "@visual/utils/spring.ts";
import { Duration, MediaTime } from "@visual/utils/time.ts";
import type { BottomLine } from "./bottom-line.ts";
import {
	LayoutAlignAnchor,
	LayoutReason,
	LayoutReasonStrategyMap,
	MAX_FRAME_DELTA,
	type MaskObsceneWordsMode,
} from "./consts.ts";
import { FocusController } from "./focus.ts";
import type { LyricLineGroupBase } from "./group.ts";
import type { InterludeDotsBase } from "./interlude-dots.ts";
import {
	LayoutCalculator,
	type LayoutConfig,
	type LayoutFrameContext,
} from "./layout.ts";
import type { LyricLineBase } from "./line.ts";
import {
	type LyricDataConfig,
	LyricDataManager,
} from "./lyric-data-manager.ts";
import { type ScrollInputType, ScrollInteractionEngine } from "./scroll.ts";
import { SeekDetector } from "./seek-detector.ts";
import { getPosYSpringPolicy } from "./spring";
import { TimelineController, type TimelineSnapshot } from "./timeline.ts";

export type { BottomLine, BottomLineTransforms } from "./bottom-line.ts";
export type {
	InterludeDotsBase,
	InterludeDotsSnapshot,
} from "./interlude-dots.ts";
export type { LyricLineBase } from "./line.ts";
export type { LyricDataConfig } from "./lyric-data-manager.ts";

function getEntrySize(entry: ResizeObserverEntry): [number, number] {
	if (entry.borderBoxSize && entry.borderBoxSize.length > 0) {
		const borderBox = entry.borderBoxSize[0];
		return [borderBox.inlineSize, borderBox.blockSize];
	}
	const el = entry.target as HTMLElement;
	return [
		el.offsetWidth || entry.contentRect.width,
		el.offsetHeight || entry.contentRect.height,
	];
}

const BRIGHTNESS_WINDOW_LINES = 2;

interface PlayerLayoutState {

	interludeDotsSize: [number, number];
}

interface PlayerScrollState {

	isAutoAlignSuspended: boolean;
	isTouchScrolled: boolean;
}

export abstract class LyricPlayerBase
	extends EventTarget
	implements HasElement, Disposable
{
	protected element: HTMLElement = document.createElement("div");
	abstract get baseFontSize(): number;

	protected isPlaying = false;
	protected timelineController: TimelineController = new TimelineController();
	protected seekDetector: SeekDetector = new SeekDetector();
	protected enableAutoSeekDetection = true;

	private hasBottomContent = false;
	private bottomLineObserver: MutationObserver;
	private autoReturnTimerId: number = 0;

	private clearAutoReturnTimer(): void {
		if (this.autoReturnTimerId) {
			window.clearTimeout(this.autoReturnTimerId);
			this.autoReturnTimerId = 0;
		}
	}

	private scheduleAutoReturn(): void {
		this.clearAutoReturnTimer();
		this.autoReturnTimerId = window.setTimeout(() => {
			this.autoReturnTimerId = 0;
			if (this.scrollState.isAutoAlignSuspended) {
				this.resetScroll();
				this.calcLayout(LayoutReason.DiscreteScroll);
			}
		}, 2500);
	}

	lyricGroupElementMap: WeakMap<Element, LyricLineGroupBase> = new WeakMap();
	protected lyricLinesIndexes: WeakMap<LyricLineBase, number> = new WeakMap();
	protected disableSpring = false;

	protected dataManager: LyricDataManager = new LyricDataManager();
	protected get processedLines(): ReadonlyArray<LyricLine> {
		return this.dataManager.getProcessedLines();
	}
	protected get isNonDynamic(): boolean {
		return this.dataManager.getIsNonDynamic();
	}
	protected get hasDuetLine(): boolean {
		return this.dataManager.getHasDuetLine();
	}

	protected layoutState: PlayerLayoutState = {
		interludeDotsSize: [0, 0],
	};
	protected layoutConfig: LayoutConfig = {
		alignAnchor: LayoutAlignAnchor.Center,
		alignPosition: 0.35,
		overscanPx: 300,
	};

	private frameContext: LayoutFrameContext = {
		containerHeight: 0,
		scrollOffset: 0,
		target: { index: 0, type: "line" },
		bottomLineHeight: 0,
		interlude: undefined,
	};

	private visualFrame = {

		latestIndex: 0,

		passedBoundary: 0,

		isNarrowViewport: false,
	};
	protected interludeDots: InterludeDotsBase & HasElement;
	protected bottomLine: BottomLine;
	protected enableBlur = true;
	protected enableScale = true;
	protected hidePassedLines = false;

	protected scrollEngine: ScrollInteractionEngine;
	protected scrollState: PlayerScrollState = {
		isAutoAlignSuspended: false,
		isTouchScrolled: false,
	};

	protected layoutCalculator: LayoutCalculator = new LayoutCalculator();
	private focusController: FocusController = new FocusController();

	public currentLyricGroups: LyricLineGroupBase[] = [];
	lyricGroupSize: WeakMap<LyricLineGroupBase, [number, number]> = new WeakMap();
	readonly size: [number, number] = [0, 0];
	protected isPageVisible = true;

	public get defaultLineHeight(): number {
		return this.size[1] / 5;
	}

	public getLineHeight(index: number): number {
		return this.layoutCalculator.getLineHeight(index);
	}

	protected alwaysPostpositionBackground = false;

	protected posXSpringParams: Partial<SpringParams> = {
		mass: 1,
		damping: 10,
		stiffness: 100,
	};
	protected posYSpringParams: Partial<SpringParams> = {
		mass: 0.9,
		damping: 15,
		stiffness: 90,
	};
	protected scaleSpringParams: Partial<SpringParams> = {
		mass: 2,
		damping: 25,
		stiffness: 100,
	};
	protected scaleForBGSpringParams: Partial<SpringParams> = {
		mass: 1,
		damping: 20,
		stiffness: 50,
	};
	private lyricGroupIndexMap = new WeakMap<LyricLineGroupBase, number>();
	private onPageShow = () => {
		this.isPageVisible = true;
		this.setCurrentTime(this.getCurrentTime(), true);
	};
	private onPageHide = () => {
		this.isPageVisible = false;
	};
	private onVisibilityChange = () => {
		if (document.visibilityState !== "visible") return;

		this.seekDetector.reset();
	};

	resizeObserver: ResizeObserver = new ResizeObserver(((entries) => {
		let shouldRelayout = false;
		let shouldRebuildPlayerStyle = false;
		let shouldUpdateFallback = false;

		for (const entry of entries) {
			if (entry.target === this.element) {
				const rect = entry.contentRect;
				this.size[0] = rect.width;
				this.size[1] = rect.height;
				shouldRebuildPlayerStyle = true;
				shouldUpdateFallback = true;
			} else if (entry.target === this.interludeDots.getElement()) {
				const size = getEntrySize(entry);
				this.layoutState.interludeDotsSize[0] = size[0];
				this.layoutState.interludeDotsSize[1] = size[1];
				shouldRelayout = true;
			} else if (entry.target === this.bottomLine.getElement()) {
				const newSize = getEntrySize(entry);
				const oldSize: [number, number] = this.bottomLine.lineSize;

				if (newSize[0] !== oldSize[0] || newSize[1] !== oldSize[1]) {
					this.bottomLine.lineSize = newSize;
					shouldRelayout = true;
				}
			} else {
				const groupObj = this.lyricGroupElementMap.get(entry.target);
				if (groupObj) {
					const newSize = getEntrySize(entry);

					const isGroupElement = entry.target === groupObj.getElement();

					if (isGroupElement) {
						const oldSize: [number, number] = this.lyricGroupSize.get(
							groupObj,
						) ?? [0, 0];

						if (newSize[0] !== oldSize[0] || newSize[1] !== oldSize[1]) {
							this.lyricGroupSize.set(groupObj, newSize);
							groupObj.onLineSizeChange(newSize);

							const index = this.lyricGroupIndexMap.get(groupObj) ?? -1;
							if (index !== -1) {
								this.layoutCalculator.setLineHeight(index, newSize[1]);
							}
							shouldRelayout = true;
						}
					} else {
						groupObj.onBgSizeChange?.(newSize);
					}
				}
			}
		}

		if (shouldUpdateFallback) {
			this.layoutCalculator.updateUnmeasuredHeights(this.defaultLineHeight);
			shouldRelayout = true;
		}

		if (shouldRelayout) {
			this.calcLayout(LayoutReason.Resize);
		}
		if (shouldRebuildPlayerStyle) {
			this.onResize();
		}
	}) as ResizeObserverCallback);
	protected wordFadeWidth = 0.5;

	constructor(element?: HTMLElement) {
		super();
		if (element) this.element = element;
		this.element.classList.add("visual-lyric-player");

		this.interludeDots = this.createInterludeDots();
		this.bottomLine = this.createBottomLine();

		this.resizeObserver.observe(this.element);
		this.resizeObserver.observe(this.interludeDots.getElement());
		this.resizeObserver.observe(this.bottomLine.getElement());

		this.element.appendChild(this.interludeDots.getElement());
		this.element.appendChild(this.bottomLine.getElement());
		this.interludeDots.setTransform(0, 200);

		this.bottomLineObserver = new MutationObserver(() => {
			const bottomEl = this.getBottomLineElement();
			const newHasBottomContent = bottomEl.innerHTML.trim().length > 0;
			if (this.hasBottomContent !== newHasBottomContent) {
				if (newHasBottomContent) {

					this.bottomLine.resetPosition();
				}
				this.hasBottomContent = newHasBottomContent;
				this.calcLayout(LayoutReason.ConfigChange);
			}
		});
		this.bottomLineObserver.observe(this.getBottomLineElement(), {
			childList: true,
			characterData: true,
			subtree: true,
		});

		window.addEventListener("pageshow", this.onPageShow);
		window.addEventListener("pagehide", this.onPageHide);
		document.addEventListener("visibilitychange", this.onVisibilityChange);

		this.scrollEngine = new ScrollInteractionEngine(this.element, {
			onScrollUpdate: (isContinuous: boolean) => {
				this.clearAutoReturnTimer();
				this.calcLayout(
					isContinuous
						? LayoutReason.ContinuousScroll
						: LayoutReason.DiscreteScroll,
				);
			},
			onInteractionStart: (type: ScrollInputType) => {
				this.clearAutoReturnTimer();
				this.scrollState.isAutoAlignSuspended = true;
				this.scrollState.isTouchScrolled = type === "touch";
				this.calcLayout(LayoutReason.InteractionStart);
			},
			onInteractionEnd: () => {
				this.scheduleAutoReturn();
			},
		});
	}

	setWordFadeWidth(value = 0.5): void {
		this.wordFadeWidth = Math.max(0.0001, value);
	}

	setEnableScale(enable = true): void {
		this.enableScale = enable;
		this.calcLayout(LayoutReason.ConfigChange);
	}

	getEnableScale(): boolean {
		return this.enableScale;
	}

	getWordFadeWidth(): number {
		return this.wordFadeWidth;
	}

	setIsSeeking(_isSeeking: boolean): void {}

	setEnableAutoSeekDetection(enable = true): void {
		if (this.enableAutoSeekDetection === enable) return;
		this.enableAutoSeekDetection = enable;
		this.seekDetector.reset();
	}

	getEnableAutoSeekDetection(): boolean {
		return this.enableAutoSeekDetection;
	}

	setHidePassedLines(hide: boolean): void {
		this.hidePassedLines = hide;
		this.calcLayout(LayoutReason.ConfigChange);
	}

	setEnableBlur(enable: boolean): void {
		if (this.enableBlur === enable) return;
		this.enableBlur = enable;
		this.calcLayout(LayoutReason.ConfigChange);
	}

	setLyricProcessConfig(config: LyricDataConfig): void {
		this.dataManager.setConfig(config);
	}

	updateLyricProcessConfig(config: LyricDataConfig): void {
		const currentOptimize = this.dataManager.getOptimizeOptions();
		const currentMaskMode = this.dataManager.getMaskMode();
		const currentMaskChar = this.dataManager.getMaskChar();

		const newOptimize =
			config.optimizeOptions !== undefined
				? config.optimizeOptions
				: currentOptimize;
		const newMaskMode =
			config.maskMode !== undefined ? config.maskMode : currentMaskMode;
		const newMaskChar =
			config.maskChar !== undefined ? config.maskChar : currentMaskChar;

		if (
			newMaskMode === currentMaskMode &&
			newMaskChar === currentMaskChar &&
			areOptimizeOptionsEqual(newOptimize, currentOptimize)
		) {
			return;
		}

		this.dataManager.setConfig({
			optimizeOptions: newOptimize,
			maskMode: newMaskMode,
			maskChar: newMaskChar,
		});

		if (this.dataManager.getRawLines().length > 0) {
			this.rebuildLyricView(this.getCurrentTime());
			this.calcLayout(LayoutReason.ConfigChange);
		}
	}

	setMaskObsceneWords(mode: MaskObsceneWordsMode): void {
		this.updateLyricProcessConfig({ maskMode: mode });
	}

	setMaskObsceneWordChar(char: string): void {
		const c = char.charAt(0) || "*";
		this.updateLyricProcessConfig({ maskChar: c });
	}

	setOptimizeOptions(options: OptimizeLyricOptions): void {
		const currentOpts = this.dataManager.getOptimizeOptions();
		this.updateLyricProcessConfig({
			optimizeOptions: { ...currentOpts, ...options },
		});
	}

	rebuildLyricLines(): void {
		for (const group of this.currentLyricGroups) {
			group.rebuildAllLines();
		}
	}

	setAlignAnchor(alignAnchor: LayoutAlignAnchor): void {
		this.layoutConfig.alignAnchor = alignAnchor;
	}

	setAlignPosition(alignPosition: number): void {
		this.layoutConfig.alignPosition = alignPosition;
	}

	setOverscanPx(px: number): void {
		this.layoutConfig.overscanPx = clampPositive(px | 0);
	}

	getOverscanPx(): number {
		return this.layoutConfig.overscanPx;
	}

	setEnableSpring(enable = true): void {
		this.disableSpring = !enable;
		if (enable) {
			this.element.classList.remove(styles.disableSpring);
		} else {
			this.element.classList.add(styles.disableSpring);
		}
		this.calcLayout(LayoutReason.ConfigChange);
	}

	getEnableSpring(): boolean {
		return !this.disableSpring;
	}

	setLyricLines(lines: LyricLine[], initialTime = 0): void {
		if (import.meta.env.DEV) {
			console.log("Setting lyric lines", lines, initialTime);
		}

		this.dataManager.setOriginalLines(lines);
		this.rebuildLyricView(initialTime);
	}

	public getIsPlaying(): boolean {
		return this.isPlaying;
	}

	setCurrentTime(time: number, isSeek = false): void {
		if (!Number.isFinite(time)) return;

		const mediaTime = MediaTime.round(MediaTime.fromMillis(time));

		const isDetectedSeek = this.enableAutoSeekDetection
			? this.seekDetector.detect(mediaTime, this.isPlaying)
			: false;

		this.syncTime(mediaTime, isSeek || isDetectedSeek);
	}

	private syncTime(mediaTime: MediaTime, isSeek: boolean): void {
		const wasFocusOnInterlude =
			this.timelineController.getSnapshot().isFocusOnInterlude;
		const diff = this.timelineController.sync(mediaTime, isSeek);

		this.interludeDots.syncClock(mediaTime);

		if (!diff.hasChanged) {
			return;
		}

		const isTimeJumped = diff.isTimeJumped;
		const snapshot = this.timelineController.getSnapshot();

		for (let i = 0; i < diff.removedHighlighted.length; i++) {
			this.currentLyricGroups[diff.removedHighlighted[i]]?.disable();
		}

		if (isTimeJumped) {
			for (const index of snapshot.highlightedGroups) {
				this.currentLyricGroups[index]?.enable();
			}
		} else {
			for (let i = 0; i < diff.addedHighlighted.length; i++) {
				this.currentLyricGroups[diff.addedHighlighted[i]]?.enable();
			}
		}

		if (isTimeJumped) {
			if (!this.scrollState.isTouchScrolled) {
				this.resetScroll();
			}
		} else if (
			(diff.isScrollToChanged || wasFocusOnInterlude) &&
			!snapshot.isFocusOnInterlude &&
			snapshot.playingGroups.has(snapshot.scrollToIndex) &&
			this.scrollState.isAutoAlignSuspended &&
			this.scrollEngine.canResumeAutoAlign
		) {
			this.resetScroll();
		}

		if (
			diff.isInterludeChanged ||
			diff.isScrollToChanged ||
			diff.isEndOfSongChanged ||
			isTimeJumped
		) {
			this.updateSpringParams(
				!!snapshot.activeInterlude,
				isTimeJumped,
				snapshot.isEndOfSong,
			);
		}

		this.calcLayout(
			isTimeJumped ? LayoutReason.Seek : LayoutReason.PlaybackTick,
		);
	}

	protected abstract buildLyricGroups(): void;

	protected abstract createInterludeDots(): InterludeDotsBase & HasElement;

	protected abstract createBottomLine(): BottomLine;

	public rebuildLyricView(initialTime: number = this.getCurrentTime()): void {
		this.resetScroll();
		this.focusController.reset();

		const bottomLineContent = this.getBottomLineElement();
		if (bottomLineContent.innerHTML.trim().length > 0) {
			this.bottomLine.resetPosition();
		}

		for (const group of this.currentLyricGroups) {
			group.dispose();
		}
		this.currentLyricGroups = [];

		this.interludeDots.clearInterlude(true);

		this.buildLyricGroups();

		this.currentLyricGroups.sort((a, b) =>
			MediaTime.cmp(a.startTime, b.startTime),
		);
		for (let i = 0; i < this.currentLyricGroups.length; i++) {
			this.lyricGroupIndexMap.set(this.currentLyricGroups[i], i);
		}

		const bounds = this.currentLyricGroups.map((group) => ({
			startTime: group.startTime,
			endTime: group.endTime,
		}));
		this.timelineController.setTimeBounds(bounds);

		this.layoutCalculator.initHeights(
			this.currentLyricGroups.length,
			this.defaultLineHeight,
		);

		this.seekDetector.reset();
		this.setCurrentTime(initialTime, true);
		this.calcLayout(LayoutReason.RebuildView);

		if (import.meta.env.DEV) {
			console.log("Lyric view rebuilt", this);
		}
	}

	private updateSpringParams(
		isInterludeActive: boolean,
		isSeeking: boolean,
		isEndOfSong: boolean,
	): void {
		if (!this.getEnableSpring() || this.currentLyricGroups.length === 0) {
			return;
		}

		const { scrollToIndex } = this.timelineController.getSnapshot();

		const currentGroup = this.currentLyricGroups[scrollToIndex];
		const prevGroup = this.currentLyricGroups[scrollToIndex - 1];

		let interval: number | undefined;
		if (currentGroup && prevGroup) {
			interval = Duration.asMillis(
				MediaTime.since(currentGroup.startTime, prevGroup.startTime),
			);
		}

		const policy = getPosYSpringPolicy(
			isSeeking,
			isInterludeActive,
			interval,
			isEndOfSong,
		);

		this.setLinePosYSpringParams(policy);
	}

	calcLayout(reason: LayoutReason): void {
		const strategy = LayoutReasonStrategyMap[reason];

		const snapshot = this.timelineController.getSnapshot();
		const interlude = snapshot.activeInterlude;

		const isLyricsSinging =
			(snapshot.playingGroups && snapshot.playingGroups.size > 0) ||
			(snapshot.highlightedGroups && snapshot.highlightedGroups.size > 0);

		let canDisplayInterlude = false;
		if (interlude && !isLyricsSinging && snapshot.currentTime < interlude.endTime) {
			canDisplayInterlude = this.interludeDots.setInterlude(
				[interlude.startTime, interlude.endTime],
				snapshot.currentTime,
				strategy.resetInterlude,
				interlude.anchorLineIndex,
			);
		} else {
			this.interludeDots.clearInterlude(true);
		}

		const focalTarget = this.focusController.resolve(
			snapshot,
			this.currentLyricGroups.length,
			{
				isAutoAlignSuspended: this.scrollState.isAutoAlignSuspended,
				hasBottomContent: this.hasBottomContent,
				canDisplayInterlude,
			},
		);

		const fontSize = this.baseFontSize || 24;
		const dotMargin = fontSize * 0.4;
		const totalInterludeHeight =
			this.layoutState.interludeDotsSize[1] + dotMargin * 2;

		const ctx = this.frameContext;
		ctx.containerHeight = this.size[1];
		ctx.target = focalTarget;
		ctx.bottomLineHeight = this.bottomLine.lineSize[1] || 0;

		const activeInterludeForLayout = canDisplayInterlude
			? interlude
			: undefined;
		const interludeAnchorIndex = LayoutCalculator.resolveInterludeAnchorIndex(
			activeInterludeForLayout,
			focalTarget,
		);

		if (interludeAnchorIndex !== undefined) {
			ctx.interlude = ctx.interlude || { totalHeight: 0, anchorIndex: 0 };
			ctx.interlude.totalHeight = totalInterludeHeight;
			ctx.interlude.anchorIndex = interludeAnchorIndex;
		} else {
			ctx.interlude = undefined;
		}

		const { bounds, session } = this.layoutCalculator.beginFrame(
			ctx,
			this.layoutConfig,
		);
		ctx.scrollOffset = this.scrollEngine.updateBoundary(bounds.min, bounds.max);

		const result = this.layoutCalculator.commit(session, ctx.scrollOffset);

		if (
			result.hasInterlude &&
			canDisplayInterlude &&
			interlude &&
			!isLyricsSinging &&
			snapshot.currentTime < interlude.endTime
		) {
			const nextLineIndex = interlude.anchorLineIndex + 1;
			const nextGroup = this.currentLyricGroups[nextLineIndex];
			const isNextDuet = nextGroup?.mainLine.getLine().isDuet ?? false;

			const targetX = isNextDuet
				? this.size[0] - this.layoutState.interludeDotsSize[0]
				: 0;

			this.interludeDots.setTransform(
				targetX,
				result.interludeY + dotMargin,
				strategy.snapPosY || !this.getEnableSpring(),
			);
		} else {
			this.interludeDots.clearInterlude(true);
		}

		const visual = this.visualFrame;
		visual.latestIndex =
			snapshot.latestHighlightedIndex ?? snapshot.scrollToIndex;
		visual.passedBoundary = interlude
			? interlude.anchorLineIndex + 1
			: snapshot.scrollToIndex;
		visual.isNarrowViewport = this.size[0] <= 1024;

		let windowEarliest = snapshot.scrollToIndex;
		let windowLatest = snapshot.scrollToIndex;
		for (const index of snapshot.highlightedGroups) {
			if (index < windowEarliest) windowEarliest = index;
			if (index > windowLatest) windowLatest = index;
		}
		const brightnessWindowFrom = windowEarliest - BRIGHTNESS_WINDOW_LINES;
		const brightnessWindowTo = windowLatest + BRIGHTNESS_WINDOW_LINES;

		const activeCount = result.lineCount;

		let delay = Duration.ZERO;
		let baseDelay = strategy.disableStagger
			? Duration.ZERO
			: Duration.fromSecs(0.05);

		for (let i = 0; i < activeCount; i++) {
			const group = this.currentLyricGroups[i];
			const instruction = result.lineInstructions[i];
			const curPos = instruction.y;
			const isInViewport = instruction.isInViewport;
			const isActive = this.resolveIsActive(i, snapshot);

			group.setTransform(
				curPos,
				strategy.snapPosY,
				delay,
				isActive,
				this.resolveOpacity(i, isInViewport, snapshot),
				this.resolveBlurLevel(i, isActive, isInViewport, snapshot),
				i >= brightnessWindowFrom && i <= brightnessWindowTo,
			);

			const lineH = instruction.height;
			if (curPos + lineH >= 0) {
				delay = Duration.add(delay, baseDelay);
				if (i >= snapshot.scrollToIndex) {
					baseDelay = Duration.mulF64(baseDelay, 1 / 1.05);
				}
			}
		}

		const isBottomFocused = focalTarget.type === "bottom";
		this.bottomLine.setFocused(isBottomFocused);

		this.bottomLine.setTransform(
			result.bottomLineY,

			this.resolveBlurLevel(
				activeCount,
				isBottomFocused,
				result.isBottomLineInViewport,
				snapshot,
			),
			strategy.snapPosY,
			delay,
		);
	}

	private resolveIsActive(index: number, snapshot: TimelineSnapshot): boolean {
		return (
			snapshot.highlightedGroups.has(index) ||
			(index >= snapshot.scrollToIndex && index < this.visualFrame.latestIndex)
		);
	}

	private resolveOpacity(
		index: number,
		isInViewport: boolean,
		snapshot: TimelineSnapshot,
	): number {

		if (!isInViewport) return 0;

		if (
			this.hidePassedLines &&
			this.isPlaying &&
			index < this.visualFrame.passedBoundary
		) {

			return 1e-4;
		}

		if (snapshot.highlightedGroups.has(index)) return 0.85;

		return this.isNonDynamic ? 0.2 : 1;
	}

	private resolveBlurLevel(
		index: number,
		isFocused: boolean,
		isInViewport: boolean,
		snapshot: TimelineSnapshot,
	): number {
		if (!this.enableBlur) return 0;

		if (!isInViewport) return 0;

		if (this.scrollState.isTouchScrolled || isFocused) return 0;

		const scrollToIndex = snapshot.scrollToIndex;
		const distance =
			index < scrollToIndex
				? Math.abs(scrollToIndex - index) + 1
				: Math.abs(index - this.visualFrame.latestIndex);

		const level = 1 + distance;
		return this.visualFrame.isNarrowViewport ? level * 0.8 : level;
	}

	setLinePosXSpringParams(_params: Partial<SpringParams> = {}): void {}

	setLinePosYSpringParams(params: Partial<SpringParams> = {}): void {
		this.posYSpringParams = {
			...this.posYSpringParams,
			...params,
		};
		this.bottomLine.lineTransforms.posY.updateParams(this.posYSpringParams);
		this.interludeDots.posY.updateParams(this.posYSpringParams);
		for (const group of this.currentLyricGroups) {
			group.posY.updateParams(this.posYSpringParams);
			group.bgSlideY.updateParams(this.posYSpringParams);
		}
	}

	setLineScaleSpringParams(params: Partial<SpringParams> = {}): void {
		this.scaleSpringParams = {
			...this.scaleSpringParams,
			...params,
		};
		this.scaleForBGSpringParams = {
			...this.scaleForBGSpringParams,
			...params,
		};
		for (const group of this.currentLyricGroups) {
			group.mainLine.lineTransforms.scale.updateParams(this.scaleSpringParams);

			group.bgLine?.lineTransforms.scale.updateParams(
				this.scaleForBGSpringParams,
			);
		}
	}

	pause(): void {
		this.interludeDots.pause();
		if (this.isPlaying) {
			this.isPlaying = false;
			this.calcLayout(LayoutReason.ConfigChange);
		}
	}

	resume(): void {
		this.interludeDots.resume();
		if (!this.isPlaying) {
			this.isPlaying = true;
			this.calcLayout(LayoutReason.ConfigChange);
		}
	}

	update(delta = 0): void {
		const d = Duration.min(Duration.fromMillis(delta), MAX_FRAME_DELTA);
		this.bottomLine.update(d);
		this.interludeDots.update(d);
	}

	protected onResize(): void {}

	getBottomLineElement(): HTMLElement {
		return (
			this.bottomLine.getContentElement?.() ?? this.bottomLine.getElement()
		);
	}

	resetScroll(): void {
		this.clearAutoReturnTimer();
		this.scrollEngine.resetScroll(0);
		this.scrollState.isAutoAlignSuspended = false;
		this.scrollState.isTouchScrolled = false;
	}

	getLyricLines(): ReadonlyArray<LyricLine> {
		return this.dataManager.getRawLines();
	}

	getCurrentTime(): number {
		return MediaTime.asMillis(
			this.timelineController.getSnapshot().currentTime,
		);
	}

	setAlwaysPostpositionBackground(enable: boolean): void {
		if (this.alwaysPostpositionBackground === enable) {
			return;
		}

		this.alwaysPostpositionBackground = enable;

		this.rebuildLyricLines();
		this.calcLayout(LayoutReason.ConfigChange);
	}

	getAlwaysPostpositionBackground(): boolean {
		return this.alwaysPostpositionBackground;
	}

	getElement(): HTMLElement {
		return this.element;
	}
	dispose(): void {
		this.clearAutoReturnTimer();
		this.scrollEngine.dispose();
		this.element.remove();
		this.bottomLineObserver.disconnect();
		this.interludeDots.dispose();
		this.bottomLine.dispose();
		window.removeEventListener("pageshow", this.onPageShow);
		window.removeEventListener("pagehide", this.onPageHide);
		document.removeEventListener("visibilitychange", this.onVisibilityChange);
	}
}
