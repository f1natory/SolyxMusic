
import type {
	BottomLine,
	BottomLineTransforms,
} from "@visual/lyric-player/base/bottom-line.ts";
import type { LyricPlayerBase } from "@visual/lyric-player/base/index.ts";
import styles from "@visual/styles/lyric-player.module.css";
import { Spring } from "@visual/utils/spring.ts";
import { Duration } from "@visual/utils/time.ts";

export class BottomLineEl implements BottomLine {
	private element: HTMLElement = document.createElement("div");
	private contentElement: HTMLElement = document.createElement("div");
	private top = 0;
	private isFocused = false;
	private blur = 0;

	private lastTransformStyle = "";
	private lastFilterStyle = "";

	readonly lineTransforms: BottomLineTransforms = {
		posY: new Spring(0),
	};

	public lineSize: [number, number] = [0, 0];

	constructor(private lyricPlayer: LyricPlayerBase) {
		this.element.setAttribute(
			"class",
			`${styles.lyricLineWrapper} ${styles.bottomLineWrapper}`,
		);
		this.contentElement.setAttribute(
			"class",
			`${styles.lyricLine} ${styles.bottomLine}`,
		);
		this.contentElement.dataset.bottomLine = "true";
		this.element.appendChild(this.contentElement);
		this.rebuildStyle();
	}

	public getElement(): HTMLElement {
		return this.element;
	}

	public getContentElement(): HTMLElement {
		return this.contentElement;
	}

	public resetPosition(): void {
		this.lineTransforms.posY.setPosition(window.innerHeight * 2);
		this.rebuildStyle();
	}

	public setFocused(focused: boolean): void {
		if (this.isFocused !== focused) {
			this.isFocused = focused;
			this.contentElement.classList.toggle(styles.gradientMask, focused);
			if (focused) {
				this.element.dataset.focused = "true";
			} else {
				delete this.element.dataset.focused;
			}
		}
	}

	public setTransform(
		top: number = this.top,
		blur = 0,
		immediate = false,
		delay: Duration = Duration.ZERO,
	): void {
		this.top = top;

		if (immediate || !this.lyricPlayer.getEnableSpring()) {
			this.blur = Math.min(32, blur);
			if (immediate) this.element.classList.add(styles.tmpDisableTransition);
			this.lineTransforms.posY.setPosition(top);
			this.rebuildStyle();
			if (immediate)
				requestAnimationFrame(() => {
					this.element.classList.remove(styles.tmpDisableTransition);
				});
		} else {
			this.blur = Math.min(5, blur);
			this.lineTransforms.posY.setTargetPosition(top, delay);
		}
	}

	public update(delta: Duration = Duration.ZERO): void {
		if (!this.lyricPlayer.getEnableSpring()) return;
		this.lineTransforms.posY.update(delta);
		this.rebuildStyle();
	}

	private rebuildStyle(): void {
		const style = this.element.style;

		const posY = this.lineTransforms.posY.getCurrentPosition().toFixed(2);
		const transformStr = `translate(0px, ${posY}px)`;

		if (this.lastTransformStyle !== transformStr) {
			this.lastTransformStyle = transformStr;
			style.transform = transformStr;
		}

		const blurVal = Math.min(5, this.blur);
		const filterStr = blurVal > 0.01 ? `blur(${blurVal.toFixed(2)}px)` : "none";
		if (this.lastFilterStyle !== filterStr) {
			this.lastFilterStyle = filterStr;
			style.filter = filterStr;
		}
	}

	public dispose(): void {
		this.element.remove();
	}
}
