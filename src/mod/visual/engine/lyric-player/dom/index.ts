

import "@visual/styles/index.css";
import type { BottomLine } from "@visual/lyric-player/base/bottom-line.ts";
import { MAX_FRAME_DELTA } from "@visual/lyric-player/base/consts.ts";
import { LyricPlayerBase } from "@visual/lyric-player/base/index.ts";
import type { LyricLineBase } from "@visual/lyric-player/base/line.ts";
import styles from "@visual/styles/lyric-player.module.css";
import { Duration } from "@visual/utils/time.ts";
import { BottomLineEl } from "./bottom-line.ts";
import { InterludeDotsEl } from "./interlude-dots.ts";
import { LyricLineGroup } from "./lyric-group.ts";
import { LyricLineEl } from "./lyric-line.ts";

export class LyricLineMouseEvent extends MouseEvent {

	public isPropagationStopped = false;

	constructor(

		public readonly lineIndex: number,

		public readonly line: LyricLineBase,

		public readonly bgLine: LyricLineBase | undefined,
		event: MouseEvent,
	) {
		super(`line-${event.type}`, event);
	}

	override stopPropagation(): void {
		this.isPropagationStopped = true;
		super.stopPropagation();
	}

	override stopImmediatePropagation(): void {
		this.isPropagationStopped = true;
		super.stopImmediatePropagation();
	}
}

export type LyricLineMouseEventListener = (evt: LyricLineMouseEvent) => void;

export class DomLyricPlayer extends LyricPlayerBase {
	private abortController = new AbortController();
	override currentLyricGroups: LyricLineGroup[] = [];

	override onResize(): void {
		const computedStyles = getComputedStyle(this.element);
		this._baseFontSize = Number.parseFloat(computedStyles.fontSize);
		this.rebuildStyle();
	}

	readonly supportPlusLighter: boolean = CSS.supports(
		"mix-blend-mode",
		"plus-lighter",
	);
	readonly supportMaskImage: boolean = CSS.supports("mask-image", "none");
	readonly innerSize: [number, number] = [0, 0];

	private readonly onMouseEventHandler = (e: MouseEvent) => {
		const target = e.target;
		if (!(target instanceof Element)) return;

		const groupEl = target.closest(`.${styles.lyricLineWrapper}`);
		if (!groupEl) return;

		const group = this.lyricGroupElementMap.get(groupEl);
		if (!group) return;

		const mainLine = group.mainLine;
		const bgLine = group.bgLine;
		const lineIndex = this.lyricLinesIndexes.get(mainLine) ?? -1;

		const evt = new LyricLineMouseEvent(lineIndex, mainLine, bgLine, e);
		const isDispatched = this.dispatchEvent(evt);

		if (!isDispatched || evt.defaultPrevented) {
			e.preventDefault();
		}

		if (evt.isPropagationStopped) {
			e.stopPropagation();
			e.stopImmediatePropagation();
		}
	};

	_getIsNonDynamic(): boolean {
		return this.isNonDynamic;
	}
	private _baseFontSize = Number.parseFloat(
		getComputedStyle(this.element).fontSize,
	);
	public get baseFontSize(): number {
		return this._baseFontSize;
	}
	constructor() {
		super();
		this.onResize();
		this.element.classList.add("visual-lyric-player", "dom");
		if (this.disableSpring) {
			this.element.classList.add(styles.disableSpring);
		}

		this.element.addEventListener("click", this.onMouseEventHandler, {
			signal: this.abortController.signal,
		});
		this.element.addEventListener("contextmenu", this.onMouseEventHandler, {
			signal: this.abortController.signal,
		});
	}

	private rebuildStyle() {

	}

	override setWordFadeWidth(value = 0.5): void {
		super.setWordFadeWidth(value);
		for (const group of this.currentLyricGroups) {
			group.mainLine.updateMaskImageSync();
			group.bgLine?.updateMaskImageSync();
		}
	}

	protected override createInterludeDots(): InterludeDotsEl {
		return new InterludeDotsEl();
	}

	protected override createBottomLine(): BottomLine {
		return new BottomLineEl(this);
	}

	protected override buildLyricGroups(): void {
		if (this.hasDuetLine) {
			this.element.classList.add(styles.hasDuetLine);
		} else {
			this.element.classList.remove(styles.hasDuetLine);
		}

		let currentGroup: LyricLineGroup | null = null;

		for (let i = 0; i < this.processedLines.length; i++) {
			const line = this.processedLines[i];
			const lineEl = new LyricLineEl(this, line);

			this.lyricLinesIndexes.set(lineEl, i);

			if (!line.isBG || !currentGroup) {
				currentGroup = new LyricLineGroup(this, lineEl);
				this.currentLyricGroups.push(currentGroup);
				this.lyricGroupElementMap.set(currentGroup.element, currentGroup);
			} else {
				currentGroup.addBgLine(lineEl);
			}
		}
	}

	public override rebuildLyricView(
		initialTime: number = this.getCurrentTime(),
	): void {
		super.rebuildLyricView(initialTime);
		this.setLinePosXSpringParams({});
		this.setLinePosYSpringParams({});
		this.setLineScaleSpringParams({});
		this.update(0);
	}

	override pause(): void {
		super.pause();
		this.element.classList.remove(styles.playing);
		for (const group of this.currentLyricGroups) {
			group.mainLine.pause();
			group.bgLine?.pause();
		}
	}

	override resume(): void {
		super.resume();
		this.element.classList.add(styles.playing);
		for (const group of this.currentLyricGroups) {
			group.mainLine.resume();
			group.bgLine?.resume();
		}
	}

	override update(delta = 0): void {
		const d = Duration.min(Duration.fromMillis(delta), MAX_FRAME_DELTA);
		super.update(Duration.asMillis(d));
		if (!this.supportMaskImage) {
			this.element.style.setProperty(
				"--visual-player-time",
				`${this.getCurrentTime()}`,
			);
		}
		if (!this.isPageVisible) return;
		for (const group of this.currentLyricGroups) {
			group.update(d);
		}

		for (const group of this.currentLyricGroups) {
			group.commitChanges();
		}
	}

	override dispose(): void {
		super.dispose();
		this.abortController.abort();
		this.element.remove();
		for (const group of this.currentLyricGroups) {
			group.dispose();
		}
	}
}
