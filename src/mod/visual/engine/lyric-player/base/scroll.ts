
import { Duration } from "@visual/utils/time.ts";

export type ScrollInputType = "touch" | "wheel";

export interface ScrollEngineHooks {

	onScrollUpdate: (isContinuous: boolean) => void;

	onInteractionStart: (type: ScrollInputType) => void;

	onInteractionEnd?: () => void;
}

const AUTO_ALIGN_RESUME_DELAY_MS = 500;

const WHEEL_IDLE_TIMEOUT_MS = 150;

const BASE_FRAME_DURATION = Duration.fromMillis(1000 / 60);

const MAX_INERTIA_FRAME_DELTA_MS = 100;

export class ScrollInteractionEngine {
	private offset: number = 0;

	private minOffset: number = 0;
	private maxOffset: number = 0;

	private touchState = {
		startY: 0,
		startX: 0,
		lastY: 0,
		startOffset: 0,
		speed: 0,
		lastTimestamp: 0,

		isIntentConfirmed: false,
	};

	private interruptedState = {
		hadInertia: false,
		hadTimer: false,
		wasInteracting: false,
	};

	private inertiaRafId: number = 0;
	private scrollEndTime: number | undefined;
	private isInteracting: boolean = false;
	private wheelEndTimeoutId: number = 0;

	private abortController = new AbortController();

	constructor(
		private container: HTMLElement,
		private hooks: ScrollEngineHooks,
	) {
		const signal = this.abortController.signal;

		this.container.addEventListener("touchstart", this.onTouchStart, {
			passive: false,
			signal,
		});
		this.container.addEventListener("touchmove", this.onTouchMove, {
			passive: false,
			signal,
		});
		this.container.addEventListener("touchend", this.onTouchEnd, {
			passive: false,
			signal,
		});
		this.container.addEventListener("touchcancel", this.onTouchCancel, {
			passive: false,
			signal,
		});
		this.container.addEventListener("wheel", this.onWheel, {
			passive: false,
			signal,
		});
		this.container.addEventListener("pointerdown", this.onPointerDown, {
			signal,
		});
	}

	private startInteraction(type: ScrollInputType): void {
		this.scrollEndTime = undefined;
		if (!this.isInteracting) {
			this.isInteracting = true;
			this.hooks.onInteractionStart(type);
		}
	}

	private endInteraction(): void {
		this.isInteracting = false;

		this.clearTimers();

		this.scrollEndTime = performance.now();
		this.hooks.onInteractionEnd?.();
	}

	private onTouchStart = (evt: TouchEvent) => {

		if (evt.touches.length > 1) {
			const touch = evt.touches[0];
			const state = this.touchState;
			state.startY = touch.screenY;
			state.startX = touch.screenX;
			state.lastY = touch.screenY;
			state.startOffset = this.offset;
			state.lastTimestamp = performance.now();
			state.speed = 0;
			return;
		}

		this.interruptedState.hadInertia = this.inertiaRafId !== 0;
		this.interruptedState.hadTimer = this.wheelEndTimeoutId !== 0;
		this.interruptedState.wasInteracting = this.isInteracting;

		this.clearTimers();

		const touch = evt.touches[0];
		const state = this.touchState;

		state.startY = touch.screenY;
		state.startX = touch.screenX;
		state.lastY = touch.screenY;
		state.startOffset = this.offset;
		state.lastTimestamp = performance.now();
		state.speed = 0;
		state.isIntentConfirmed = false;
	};

	private onTouchMove = (evt: TouchEvent) => {
		const touch = evt.touches[0];
		const state = this.touchState;

		const deltaY = touch.screenY - state.startY;
		const deltaX = touch.screenX - state.startX;

		if (!state.isIntentConfirmed) {

			if (Math.abs(deltaY) > 10 || Math.abs(deltaX) > 10) {
				state.isIntentConfirmed = true;
				this.startInteraction("touch");
			} else {
				return;
			}
		}

		if (evt.cancelable) {
			evt.preventDefault();
		}

		const currentY = touch.screenY;
		this.offset = this.clampOffset(
			state.startOffset - (currentY - state.startY),
		);

		const now = performance.now();
		const dt = Duration.fromMillis(now - state.lastTimestamp);
		const dtMs = Duration.asMillis(dt);
		if (dtMs > 0) {
			state.speed = (currentY - state.lastY) / dtMs;
		}

		state.lastY = currentY;
		state.lastTimestamp = now;

		this.hooks.onScrollUpdate(true);
	};

	private onTouchCancel = (_evt: TouchEvent) => {
		const state = this.touchState;

		if (!state.isIntentConfirmed) {
			const { hadInertia, hadTimer, wasInteracting } = this.interruptedState;

			if (hadInertia || hadTimer || wasInteracting) {
				this.endInteraction();
			}

			return;
		}

		state.speed = 0;
		state.startY = 0;

		this.endInteraction();
	};

	private onTouchEnd = (evt: TouchEvent) => {
		const state = this.touchState;

		if (evt.touches.length > 0) {
			const remainingTouch = evt.touches[0];
			state.startY = remainingTouch.screenY;
			state.startX = remainingTouch.screenX;
			state.lastY = remainingTouch.screenY;
			state.startOffset = this.offset;
			state.lastTimestamp = performance.now();
			state.speed = 0;
			return;
		}

		if (!state.isIntentConfirmed) {
			const { hadInertia, hadTimer, wasInteracting } = this.interruptedState;

			if (hadInertia || hadTimer || wasInteracting) {
				this.endInteraction();
			}

			return;
		}

		state.isIntentConfirmed = false;

		if (evt.cancelable) {
			evt.preventDefault();
		}
		state.startY = 0;

		if (this.inertiaRafId) {
			cancelAnimationFrame(this.inertiaRafId);
			this.inertiaRafId = 0;
		}

		if (Math.abs(state.speed) < 0.1) {
			state.speed = 0;
		}

		if (Math.abs(state.speed) > 0.05) {
			let lastFrameTime = performance.now();

			const onScrollFrame = (time: number) => {
				const dt = Duration.fromMillis(time - lastFrameTime);
				lastFrameTime = time;
				const dtMs = Duration.asMillis(dt);

				if (dtMs <= 0 || dtMs > MAX_INERTIA_FRAME_DELTA_MS) {
					this.inertiaRafId = requestAnimationFrame(onScrollFrame);
					return;
				}

				if (Math.abs(state.speed) > 0.05) {
					this.offset -= state.speed * dtMs;
					this.offset = this.clampOffset(this.offset);

					const steps = Duration.divDuration(dt, BASE_FRAME_DURATION);
					state.speed *= 0.95 ** steps;

					this.hooks.onScrollUpdate(true);
					this.inertiaRafId = requestAnimationFrame(onScrollFrame);
				} else {
					this.inertiaRafId = 0;
					this.endInteraction();
				}
			};

			this.inertiaRafId = requestAnimationFrame(onScrollFrame);
		} else {
			this.endInteraction();
		}
	};

	private onWheel = (evt: WheelEvent) => {
		this.clearTimers();
		this.startInteraction("wheel");

		if (evt.cancelable) {
			evt.preventDefault();
		}

		if (evt.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
			this.offset += evt.deltaY;
		} else {
			this.offset += evt.deltaY * 50;
		}

		this.offset = this.clampOffset(this.offset);
		this.hooks.onScrollUpdate(false);

		this.wheelEndTimeoutId = window.setTimeout(() => {
			this.wheelEndTimeoutId = 0;
			this.endInteraction();
		}, WHEEL_IDLE_TIMEOUT_MS);
	};

	private onPointerDown = (evt: PointerEvent) => {
		if (evt.pointerType === "touch") return;
		if (evt.button !== 0) return;

		this.interruptedState.hadInertia = this.inertiaRafId !== 0;
		this.interruptedState.hadTimer = this.wheelEndTimeoutId !== 0;
		this.interruptedState.wasInteracting = this.isInteracting;

		this.clearTimers();

		const state = this.touchState;
		state.startY = evt.screenY;
		state.startX = evt.screenX;
		state.lastY = evt.screenY;
		state.startOffset = this.offset;
		state.lastTimestamp = performance.now();
		state.speed = 0;
		state.isIntentConfirmed = false;

		window.addEventListener("pointermove", this.onPointerMove);
		window.addEventListener("pointerup", this.onPointerUp);
		window.addEventListener("pointercancel", this.onPointerUp);
	};

	private onPointerMove = (evt: PointerEvent) => {
		const state = this.touchState;
		const deltaY = evt.screenY - state.startY;
		const deltaX = evt.screenX - state.startX;

		if (!state.isIntentConfirmed) {
			if (Math.abs(deltaY) > 8 || Math.abs(deltaX) > 8) {
				state.isIntentConfirmed = true;
				this.startInteraction("touch");
			} else {
				return;
			}
		}

		const currentY = evt.screenY;
		this.offset = this.clampOffset(
			state.startOffset - (currentY - state.startY),
		);

		const now = performance.now();
		const dtMs = now - state.lastTimestamp;
		if (dtMs > 0) {
			state.speed = (currentY - state.lastY) / dtMs;
		}

		state.lastY = currentY;
		state.lastTimestamp = now;

		this.hooks.onScrollUpdate(true);
	};

	private onPointerUp = (_evt: PointerEvent) => {
		window.removeEventListener("pointermove", this.onPointerMove);
		window.removeEventListener("pointerup", this.onPointerUp);
		window.removeEventListener("pointercancel", this.onPointerUp);

		const state = this.touchState;
		if (!state.isIntentConfirmed) {
			const { hadInertia, hadTimer, wasInteracting } = this.interruptedState;
			if (hadInertia || hadTimer || wasInteracting) {
				this.endInteraction();
			}
			return;
		}

		state.isIntentConfirmed = false;
		state.startY = 0;

		if (Math.abs(state.speed) < 0.1) {
			state.speed = 0;
		}

		if (Math.abs(state.speed) > 0.05) {
			let lastFrameTime = performance.now();
			const onScrollFrame = (time: number) => {
				const dtMs = time - lastFrameTime;
				lastFrameTime = time;

				if (dtMs <= 0 || dtMs > MAX_INERTIA_FRAME_DELTA_MS) {
					this.inertiaRafId = requestAnimationFrame(onScrollFrame);
					return;
				}

				if (Math.abs(state.speed) > 0.05) {
					this.offset -= state.speed * dtMs;
					this.offset = this.clampOffset(this.offset);

					const steps = dtMs / 16.666;
					state.speed *= 0.95 ** steps;

					this.hooks.onScrollUpdate(true);
					this.inertiaRafId = requestAnimationFrame(onScrollFrame);
				} else {
					this.inertiaRafId = 0;
					this.endInteraction();
				}
			};
			this.inertiaRafId = requestAnimationFrame(onScrollFrame);
		} else {
			this.endInteraction();
		}
	};

	private clampOffset(val: number): number {
		const min = Math.min(this.minOffset, this.maxOffset);
		const max = Math.max(this.minOffset, this.maxOffset);
		return Math.min(Math.max(val, min), max);
	}

	public get canResumeAutoAlign(): boolean {
		return (
			this.scrollEndTime !== undefined &&
			performance.now() - this.scrollEndTime >= AUTO_ALIGN_RESUME_DELAY_MS
		);
	}

	public updateBoundary(min: number, max: number): number {
		this.minOffset = Math.min(0, min);
		this.maxOffset = Math.max(0, max);

		this.offset = this.clampOffset(this.offset);
		return this.offset;
	}

	public resetScroll(targetOffset: number = 0): void {
		this.clearTimers();
		this.scrollEndTime = undefined;

		this.isInteracting = false;
		this.touchState.isIntentConfirmed = false;
		this.touchState.speed = 0;
		this.touchState.startY = 0;
		this.touchState.lastY = 0;
		this.touchState.lastTimestamp = 0;

		this.offset = this.clampOffset(targetOffset);
	}

	private clearTimers(): void {
		if (this.inertiaRafId) {
			cancelAnimationFrame(this.inertiaRafId);
			this.inertiaRafId = 0;
		}
		if (this.wheelEndTimeoutId) {
			window.clearTimeout(this.wheelEndTimeoutId);
			this.wheelEndTimeoutId = 0;
		}
	}

	public dispose(): void {
		this.abortController.abort();
		window.removeEventListener("pointermove", this.onPointerMove);
		window.removeEventListener("pointerup", this.onPointerUp);
		window.removeEventListener("pointercancel", this.onPointerUp);
		this.clearTimers();
		this.scrollEndTime = undefined;
	}

}
