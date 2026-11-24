
import { Duration, MediaTime } from "@visual/utils/time.ts";

export type WallClock = () => number;

const JITTER_TOLERANCE = Duration.fromMillis(150);

const DRIFT_SLACK = 0.5;

const MAX_TRUSTED_GAP = Duration.fromMillis(800);

export class SeekDetector {
	private readonly now: WallClock;

	private lastMediaTime: MediaTime = MediaTime.ZERO;
	private lastWallTime = 0;
	private hasBaseline = false;

	public constructor(now: WallClock = () => performance.now()) {
		this.now = now;
	}

	public detect(time: MediaTime, isPlaying: boolean): boolean {
		const wall = this.now();

		if (!this.hasBaseline) {
			this.rebase(time, wall);
			this.hasBaseline = true;
			return false;
		}

		if (time < this.lastMediaTime) {
			this.rebase(time, wall);
			return true;
		}

		const mediaDelta = MediaTime.since(time, this.lastMediaTime);
		const elapsed = Duration.clampPositive(
			Duration.fromMillis(wall - this.lastWallTime),
		);
		const wallDelta = Duration.min(elapsed, MAX_TRUSTED_GAP);

		this.rebase(time, wall);

		const expected = isPlaying ? wallDelta : Duration.ZERO;
		const tolerance = isPlaying
			? Duration.max(JITTER_TOLERANCE, Duration.mulF64(wallDelta, DRIFT_SLACK))
			: JITTER_TOLERANCE;

		const drift = Duration.sub(mediaDelta, expected);

		return drift > tolerance;
	}

	public reset(): void {
		this.hasBaseline = false;
		this.lastMediaTime = MediaTime.ZERO;
		this.lastWallTime = 0;
	}

	private rebase(time: MediaTime, wall: number): void {
		this.lastMediaTime = time;
		this.lastWallTime = wall;
	}
}
