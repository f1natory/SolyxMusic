
import bezier from "bezier-easing";
import type { Disposable } from "@visual/interfaces.ts";
import { clamp01 } from "@visual/utils/clamp.ts";
import { Spring } from "@visual/utils/spring.ts";
import { Duration, MediaTime } from "@visual/utils/time.ts";

export interface InterludeDotsSnapshot {

	readonly isActive: boolean;

	readonly dotOpacities: readonly [number, number, number];

	readonly scale: number;

	readonly opacity: number;
}

type Mutable<T> = {
	-readonly [P in keyof T]: T[P];
};

type InterludePhase = "idle" | "performing" | "fading";

type PerformingMode = "breathe" | "fallback-hold";

const DOT3_TRAILING_MS = 750;
const EXIT_PHASE1_MS = 750;
const EXIT_PHASE2_MS = 250;
const EXIT_TOTAL_MS = EXIT_PHASE1_MS + EXIT_PHASE2_MS;
const EXIT_FADE_MS = 250;
const DISMISS_FADE_MS = 150;

const ENTER_HOLD_MS = 500;

const ENTER_FADE_MS = 180;
const DOT_ENTER_FADE_MS = 750;
const DOT_ENTER_STAGGER_MS = 80;

const DOT_ENTER_TOTAL_MS = (3 - 1) * DOT_ENTER_STAGGER_MS + DOT_ENTER_FADE_MS;

const BREATHE_BASE_PERIOD_MS = 4000;
const FALLBACK_HOLD_THRESHOLD_MS = 3000;
const BREATHE_MAX_SCALE = 1.25;
const BREATHE_MIN_SCALE = 0.4;

const DOT_INACTIVE_OPACITY = 0.2;
const DOT_ACTIVE_OPACITY = 0.9;
const DOT_COUNT = 3;

const lightingEasing = bezier(0.56, 0.01, 0.45, 1);
const enterFadeEasing = bezier(0.59, 0.02, 0.07, 1);
const exitPhase1Easing = bezier(0.14, 0.06, 0.25, 1);
const exitPhase2Easing = bezier(0.29, 0.03, 1, 0.38);
const exitFadeEasing = bezier(0.43, 0.08, 0.83, 0.31);

const HIDDEN_SNAPSHOT: Readonly<InterludeDotsSnapshot> = {
	isActive: false,
	dotOpacities: [0, 0, 0],
	scale: 1,
	opacity: 0,
};

export abstract class InterludeDotsBase implements Disposable {

	private left = 0;
	private top = 0;
	public readonly posY: Spring = new Spring(0);

	private shouldSnapPosY = true;

	private currentTime: MediaTime = MediaTime.ZERO;
	private playing = true;
	private phase: InterludePhase = "idle";
	private mode: PerformingMode = "breathe";
	private fadeElapsedMs = 0;
	private fadeInitialOpacity = 0;
	private startTime: MediaTime = MediaTime.ZERO;
	private endTime: MediaTime = MediaTime.ZERO;
	private anchorTime: MediaTime = MediaTime.ZERO;

	private delayEndMs = 0;
	private bodyEndMs = 0;
	private totalEndMs = 0;

	private breathePeriodMs = BREATHE_BASE_PERIOD_MS;
	private segmentMs = 0;
	private dot3DurationMs = 0;
	private dot3Target = 0;

	private readonly mutDotOpacities: [number, number, number] = [0, 0, 0];

	private readonly snapshot: Mutable<InterludeDotsSnapshot> = {
		isActive: true,
		dotOpacities: this.mutDotOpacities,
		scale: 1,
		opacity: 0,
	};

	public setInterlude(
		interlude: [MediaTime, MediaTime],
		currentTime?: MediaTime,
		forceReset = false,
		anchorLineIndex = 0,
	): boolean {
		const [startTime, endTime] = interlude;

		if (currentTime !== undefined && currentTime >= endTime) {
			this.hidePerformance();
			return false;
		}

		const isSameInterlude =
			this.startTime === startTime && this.endTime === endTime;

		if (!forceReset && isSameInterlude && this.phase !== "fading") {
			return this.phase === "performing";
		}

		this.cancelFadeOut();
		this.startTime = startTime;
		this.endTime = endTime;
		this.currentTime = currentTime ?? startTime;

		if (forceReset) {
			this.anchorTime = this.currentTime;
			this.delayEndMs = ENTER_HOLD_MS;
		} else {
			this.anchorTime = startTime;
			this.delayEndMs = anchorLineIndex === -1 ? 0 : ENTER_HOLD_MS;
		}

		const remainingMs = Math.max(
			0,
			Duration.asMillis(MediaTime.since(endTime, this.currentTime)),
		);
		const bodyMs = remainingMs - this.delayEndMs - EXIT_TOTAL_MS;

		if (bodyMs < DOT_ENTER_TOTAL_MS || this.currentTime >= endTime) {

			this.hidePerformance();
			return false;
		}

		this.bodyEndMs = this.delayEndMs + bodyMs;
		this.totalEndMs = this.bodyEndMs + EXIT_TOTAL_MS;

		let mode: PerformingMode;
		if (bodyMs < FALLBACK_HOLD_THRESHOLD_MS) {

			mode = "fallback-hold";
			this.dot3Target = 1.0;
		} else {

			mode = "breathe";
			const breatheCycles = Math.max(
				1,
				Math.floor(bodyMs / BREATHE_BASE_PERIOD_MS),
			);
			this.breathePeriodMs = bodyMs / breatheCycles;
			this.segmentMs = Math.round((bodyMs + DOT3_TRAILING_MS) / DOT_COUNT);
			this.dot3DurationMs = bodyMs - this.segmentMs * 2;
			this.dot3Target = this.dot3DurationMs / this.segmentMs;
		}

		this.enterPerforming(mode);

		return true;
	}

	public clearInterlude(immediate = true): void {
		this.startTime = MediaTime.ZERO;
		this.endTime = MediaTime.ZERO;
		this.dismiss(immediate);
	}

	public dismiss(immediate = true): void {
		if (this.phase === "idle") {
			this.hidePerformance();
			return;
		}

		if (immediate || !this.playing) {
			this.cancelFadeOut();
			this.hidePerformance();
			return;
		}

		if (this.phase === "fading") {
			return;
		}

		if (this.snapshot.opacity <= 0) {
			this.hidePerformance();
			return;
		}

		this.enterFading();
	}

	public setTransform(
		left: number = this.left,
		top: number = this.top,
		immediate = false,
	): void {
		this.left = left;
		this.top = top;

		const shouldAnimate =
			!immediate && this.phase !== "idle" && !this.shouldSnapPosY;

		if (shouldAnimate) {
			this.posY.setTargetPosition(top);
		} else {
			this.shouldSnapPosY = false;
			this.posY.setPosition(top);
		}

		this.update();
	}

	public pause(): void {
		this.playing = false;
		if (this.phase === "fading") {
			this.hidePerformance();
		}
	}

	public resume(): void {
		this.playing = true;
	}

	public syncClock(time: MediaTime): void {
		this.currentTime = time;
	}

	public update(delta: Duration = Duration.ZERO): void {
		if (this.phase === "idle") return;

		if (this.phase === "fading") {
			this.updateFadeOut(delta);
			return;
		}

		if (this.playing) {
			this.currentTime = MediaTime.add(this.currentTime, delta);
		}

		const elapsed = Duration.max(
			Duration.ZERO,
			MediaTime.since(this.currentTime, this.anchorTime),
		);

		const snapshot = this.resolveSnapshot(elapsed);
		this.posY.update(delta);
		this.render(snapshot, this.left, this.posY.getCurrentPosition());

		if (!snapshot.isActive) {
			this.enterIdle();
		}
	}

	public dispose(): void {
		this.dismiss(true);
	}

	protected abstract render(
		snapshot: Readonly<InterludeDotsSnapshot>,
		left: number,
		top: number,
	): void;

	private enterPerforming(mode: PerformingMode): void {
		this.mode = mode;
		this.phase = "performing";

		this.shouldSnapPosY = true;
	}

	private enterFading(): void {
		this.fadeElapsedMs = 0;
		this.fadeInitialOpacity = this.snapshot.opacity;
		this.phase = "fading";
	}

	private enterIdle(): void {
		this.phase = "idle";
	}

	private cancelFadeOut(): void {
		if (this.phase === "fading") {
			this.enterIdle();
		}
	}

	private hidePerformance(): void {
		this.enterIdle();
		this.snapshot.isActive = false;
		this.snapshot.opacity = 0;
		this.snapshot.scale = 1;
		this.mutDotOpacities[0] = 0;
		this.mutDotOpacities[1] = 0;
		this.mutDotOpacities[2] = 0;
		this.render(HIDDEN_SNAPSHOT, this.left, this.posY.getCurrentPosition());
	}

	private writeDotOpacities(
		internalMs: number,
		fractions: readonly [number, number, number],
	): void {
		this.mutDotOpacities[0] =
			dotOpacity(fractions[0]) * dotEnterAlpha(0, internalMs);
		this.mutDotOpacities[1] =
			dotOpacity(fractions[1]) * dotEnterAlpha(1, internalMs);
		this.mutDotOpacities[2] =
			dotOpacity(fractions[2]) * dotEnterAlpha(2, internalMs);
	}

	private updateFadeOut(delta: Duration): void {
		this.fadeElapsedMs += Duration.asMillis(delta);
		const progress = clamp01(this.fadeElapsedMs / DISMISS_FADE_MS);

		if (progress >= 1) {
			this.hidePerformance();
			return;
		}

		this.snapshot.opacity =
			this.fadeInitialOpacity * (1 - exitFadeEasing(progress));
		this.snapshot.isActive = true;

		this.posY.update(delta);
		this.render(this.snapshot, this.left, this.posY.getCurrentPosition());
	}

	private resolveSnapshot(elapsed: Duration): Readonly<InterludeDotsSnapshot> {
		if (this.phase === "idle") {
			return HIDDEN_SNAPSHOT;
		}

		if (this.currentTime >= this.endTime) {
			this.hidePerformance();
			return HIDDEN_SNAPSHOT;
		}

		const elapsedMs = Duration.asMillis(elapsed);

		if (elapsedMs >= this.totalEndMs) {
			this.hidePerformance();
			return HIDDEN_SNAPSHOT;
		}

		this.snapshot.isActive = true;

		if (elapsedMs < this.delayEndMs) {
			this.snapshot.opacity = 0;
			this.snapshot.scale = 1;
			this.mutDotOpacities[0] = 0;
			this.mutDotOpacities[1] = 0;
			this.mutDotOpacities[2] = 0;
			return this.snapshot;
		}

		const internalMs = elapsedMs - this.delayEndMs;
		const fractionAt = (startDelay: number, duration: number, target: number) =>
			computeDotFraction(startDelay, duration, internalMs, target);

		if (elapsedMs >= this.bodyEndMs) {
			const exitElapsedMs = elapsedMs - this.bodyEndMs;

			const fadeT = clamp01(
				(exitElapsedMs - (EXIT_TOTAL_MS - EXIT_FADE_MS)) / EXIT_FADE_MS,
			);
			this.snapshot.opacity =
				enterOpacity(internalMs) * (1 - exitFadeEasing(fadeT));

			if (exitElapsedMs < EXIT_PHASE1_MS) {
				this.snapshot.scale =
					1 +
					exitPhase1Easing(exitElapsedMs / EXIT_PHASE1_MS) *
						(BREATHE_MAX_SCALE - 1);
			} else {

				const phase2T = clamp01(
					(exitElapsedMs - EXIT_PHASE1_MS) / EXIT_PHASE2_MS,
				);
				this.snapshot.scale =
					BREATHE_MAX_SCALE -
					exitPhase2Easing(phase2T) * (BREATHE_MAX_SCALE - BREATHE_MIN_SCALE);
			}

			const trailing = clamp01(exitElapsedMs / DOT3_TRAILING_MS);

			this.writeDotOpacities(internalMs, [
				1,
				1,
				this.dot3Target + (1 - this.dot3Target) * trailing,
			]);

			return this.snapshot;
		}

		this.snapshot.opacity = enterOpacity(internalMs);

		if (this.mode === "fallback-hold") {

			this.snapshot.scale = 1;
			this.writeDotOpacities(internalMs, [1, 1, 1]);
			return this.snapshot;
		}

		const cycleT = (internalMs % this.breathePeriodMs) / this.breathePeriodMs;
		const progress = breathingProgress(cycleT);
		this.snapshot.scale =
			progress <= 0.5
				? 1 + (progress / 0.5) * (BREATHE_MAX_SCALE - 1)
				: BREATHE_MAX_SCALE -
					((progress - 0.5) / 0.5) * (BREATHE_MAX_SCALE - 1);

		this.writeDotOpacities(internalMs, [
			fractionAt(0, this.segmentMs, 1),
			fractionAt(this.segmentMs, this.segmentMs, 1),
			fractionAt(this.segmentMs * 2, this.dot3DurationMs, this.dot3Target),
		]);

		return this.snapshot;
	}

}

function breathingProgress(t: number): number {
	if (t <= 0) return 0;
	if (t >= 1) return 1;
	const angle = 4.0 * Math.PI * t;
	const s = Math.sin(angle);
	const c = Math.cos(angle);
	return t - 0.084 * s + 0.008 * (1 - c) + 0.0046 * s * (c - s);
}

function dotOpacity(fraction: number): number {
	return (
		DOT_INACTIVE_OPACITY +
		(DOT_ACTIVE_OPACITY - DOT_INACTIVE_OPACITY) * clamp01(fraction)
	);
}

function enterOpacity(internalMs: number): number {
	return enterFadeEasing(clamp01(internalMs / ENTER_FADE_MS));
}

function dotEnterAlpha(index: number, internalMs: number): number {
	const t = clamp01(
		(internalMs - index * DOT_ENTER_STAGGER_MS) / DOT_ENTER_FADE_MS,
	);
	return t * t;
}

function computeDotFraction(
	startDelay: number,
	duration: number,
	internalMs: number,
	target: number,
): number {
	if (internalMs <= startDelay) return 0;
	const localT = (internalMs - startDelay) / duration;
	return lightingEasing(clamp01(localT)) * target;
}
