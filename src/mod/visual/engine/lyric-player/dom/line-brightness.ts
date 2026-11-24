
import type { Disposable } from "@visual/interfaces.ts";
import styles from "@visual/styles/lyric-player.module.css";

interface Geometry {
	readonly top: string;
	readonly left: string;
	readonly right: string;
}

const BRIGHTNESS_SETTLE_MS = 500;

export class LineBrightness implements Disposable {

	private dim?: HTMLElement;

	private geometry?: Geometry;

	private transitionRestore?: number;

	private inWindow = true;

	private highlightExitedAt = 0;

	private dimAnimation?: Animation;
	private mainAnimation?: Animation;

	private isDisposed = false;

	constructor(
		private readonly main: HTMLElement,
		private readonly enabled = true,
	) {}

	public get disposed(): boolean {
		return this.isDisposed;
	}

	public get isReady(): boolean {
		return !this.isDisposed && this.dim !== undefined;
	}

	public setInWindow(inWindow: boolean): void {
		if (this.isDisposed) return;
		if (this.inWindow === inWindow) {
			if (!inWindow) this.sync();
			return;
		}
		this.inWindow = inWindow;
		this.sync();
	}

	public markHighlightExited(): void {
		if (this.isDisposed) return;
		this.cancelActivationAnimation();
		this.highlightExitedAt = performance.now();
	}

	public playActivationTransition(): void {
		if (this.isDisposed || !this.dim) return;

		this.cancelActivationAnimation();

		const dimAnim = this.dim.animate(
			[{ opacity: 0.2 }, { opacity: 0 }],
			{
				duration: 300,
				easing: "ease-out",
			},
		);
		this.dimAnimation = dimAnim;
		dimAnim.onfinish = () => {
			if (this.dimAnimation === dimAnim) {
				this.dimAnimation = undefined;
			}
		};

		const mainAnim = this.main.animate(
			[{ opacity: 0 }, { opacity: 1 }],
			{
				duration: 300,
				easing: "ease-out",
			},
		);
		this.mainAnimation = mainAnim;
		mainAnim.onfinish = () => {
			if (this.mainAnimation === mainAnim) {
				this.mainAnimation = undefined;
			}
		};
	}

	public cancelActivationAnimation(): void {
		if (this.dimAnimation) {
			this.dimAnimation.cancel();
			this.dimAnimation = undefined;
		}
		if (this.mainAnimation) {
			this.mainAnimation.cancel();
			this.mainAnimation = undefined;
		}
	}

	public sync(forceRebuild = false): void {
		if (this.isDisposed) return;
		if (!this.enabled) {
			if (this.isReady) this.deactivate();
			return;
		}

		if (this.inWindow) {
			if ((!this.isReady || forceRebuild) && this.main.isConnected) {
				this.rebuild();
			}
			return;
		}

		if (
			this.isReady &&
			performance.now() - this.highlightExitedAt >= BRIGHTNESS_SETTLE_MS
		) {
			this.deactivate();
		}
	}

	public captureGeometry(mainStyle?: CSSStyleDeclaration): void {
		if (this.isDisposed) return;
		this.geometry = this.measureGeometry(mainStyle);
		if (this.dim && this.geometry) {
			Object.assign(this.dim.style, this.geometry);
		}
	}

	public rebuild(): void {
		if (!this.enabled || this.isDisposed) return;

		const parent = this.main.parentElement;
		const geometry = this.geometry ?? this.measureGeometry();

		if (!parent || !geometry) return;

		this.clearCopy();

		const dim = this.main.cloneNode(true);
		if (!(dim instanceof HTMLElement)) return;

		dim.classList.remove(styles.lyricMainLineBright);
		dim.classList.add(styles.lyricMainLineDim);
		dim.setAttribute("aria-hidden", "true");
		dim.inert = true;

		dim.style.removeProperty("transition");
		Object.assign(dim.style, geometry);

		dim.style.removeProperty("mask");
		dim.style.removeProperty("-webkit-mask");
		for (const element of dim.querySelectorAll("*")) {
			if (!(element instanceof HTMLElement)) continue;
			element.style.removeProperty("mask");
			element.style.removeProperty("-webkit-mask");
		}

		parent.append(dim);

		this.setMainBright(true);
		this.dim = dim;
	}

	public deactivate(): void {
		if (this.isDisposed) return;
		this.clearCopy();
		this.setMainBright(false);
	}

	public dispose(): void {
		if (this.isDisposed) return;
		this.isDisposed = true;
		this.releaseTransitionSuppression();
		this.clearCopy();
		this.main.classList.remove(styles.lyricMainLineBright);
		this.main.style.transition = "";
	}

	private measureGeometry(
		mainStyle?: CSSStyleDeclaration,
	): Geometry | undefined {
		const parent = this.main.parentElement;
		if (!parent) return undefined;

		const mainComputed = mainStyle ?? getComputedStyle(this.main);
		const parentStyle = getComputedStyle(parent);
		const edges = [
			parentStyle.paddingTop,
			parentStyle.paddingLeft,
			parentStyle.paddingRight,
			mainComputed.marginTop,
			mainComputed.marginLeft,
			mainComputed.marginRight,
		].map((value) => LineBrightness.parsePx(value));

		if (edges.some((value) => value === undefined)) {
			return undefined;
		}

		const [
			paddingTop,
			paddingLeft,
			paddingRight,
			marginTop,
			marginLeft,
			marginRight,
		] = edges as number[];

		return {
			top: `${paddingTop + marginTop}px`,
			left: `${paddingLeft + marginLeft}px`,
			right: `${paddingRight + marginRight}px`,
		};
	}

	private static parsePx(value: string): number | undefined {
		return value.endsWith("px") ? Number.parseFloat(value) : undefined;
	}

	private setMainBright(enabled: boolean): void {
		if (this.isDisposed) return;
		if (this.main.classList.contains(styles.lyricMainLineBright) === enabled) {
			return;
		}

		this.releaseTransitionSuppression();
		this.main.classList.toggle(styles.lyricMainLineBright, enabled);

		if (!this.main.isConnected) {
			return;
		}

		this.main.style.transition = "none";
		this.transitionRestore = requestAnimationFrame(() => {
			this.transitionRestore = undefined;

			if (this.isDisposed || !this.main.isConnected) {
				this.main.style.transition = "";
				return;
			}
			this.releaseTransitionSuppression();
		});
	}

	private releaseTransitionSuppression(): void {
		if (this.transitionRestore !== undefined) {
			cancelAnimationFrame(this.transitionRestore);
			this.transitionRestore = undefined;
		}
		this.main.style.transition = "";
	}

	private clearCopy(): void {
		this.cancelActivationAnimation();
		this.dim?.remove();
		this.dim = undefined;
	}

}
