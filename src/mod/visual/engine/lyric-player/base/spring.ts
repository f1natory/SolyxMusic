
import type { SpringParams } from "@visual/utils/spring.ts";

const SLOW_STIFFNESS = 90;
const SLOW_DAMPING = 15;

const MEDIUM_STIFFNESS = 140;
const MEDIUM_DAMPING = 22;

const MIN_INTERVAL = 100;
const MAX_INTERVAL = 800;
const MIN_STIFFNESS = 170;
const MAX_STIFFNESS = 220;
const DAMPING_MULTIPLIER = 2.2;
const INTERVAL_EXPONENT = 0.2;

export function getPosYSpringPolicy(
	isSeeking: boolean,
	isInterludeActive: boolean,
	intervalMs?: number,
	isEndOfSong = false,
): Partial<SpringParams> {

	if (isSeeking || isInterludeActive) {
		return {
			stiffness: SLOW_STIFFNESS,
			damping: SLOW_DAMPING,
		};
	}

	if (isEndOfSong) {
		return {
			stiffness: MEDIUM_STIFFNESS,
			damping: MEDIUM_DAMPING,
		};
	}

	if (intervalMs == null) {
		return {
			stiffness: SLOW_STIFFNESS,
			damping: SLOW_DAMPING,
		};
	}

	const clampedInterval = Math.min(
		Math.max(intervalMs, MIN_INTERVAL),
		MAX_INTERVAL,
	);

	let ratio =
		1 - (clampedInterval - MIN_INTERVAL) / (MAX_INTERVAL - MIN_INTERVAL);

	ratio = ratio ** INTERVAL_EXPONENT;

	const targetStiffness =
		MIN_STIFFNESS + ratio * (MAX_STIFFNESS - MIN_STIFFNESS);
	const targetDamping = Math.sqrt(targetStiffness) * DAMPING_MULTIPLIER;

	return {
		stiffness: targetStiffness,
		damping: targetDamping,
	};
}
