
import type { FocalTarget } from "./layout.ts";
import type { TimelineSnapshot } from "./timeline.ts";

export interface FocusResolveFlags {

	isAutoAlignSuspended: boolean;

	hasBottomContent: boolean;

	canDisplayInterlude: boolean;
}

export class FocusController {
	private target: FocalTarget = { type: "line", index: 0 };

	public resolve(
		snapshot: TimelineSnapshot,
		lineCount: number,
		flags: FocusResolveFlags,
	): FocalTarget {
		const nextTarget = flags.isAutoAlignSuspended
			? this.resolveSuspendedTarget(snapshot, lineCount, flags)
			: this.resolveActiveTarget(snapshot, lineCount, flags);

		this.target = nextTarget;
		return nextTarget;
	}

	private resolveSuspendedTarget(
		snapshot: TimelineSnapshot,
		lineCount: number,
		flags: FocusResolveFlags,
	): FocalTarget {
		const target = this.target;

		switch (target.type) {
			case "line":
				return {
					type: "line",
					index: this.clampLineIndex(target.index, lineCount),
				};

			case "interlude": {
				const isInterludeActive =
					snapshot.isFocusOnInterlude &&
					!!snapshot.activeInterlude &&
					flags.canDisplayInterlude;

				if (!isInterludeActive) {
					return {
						type: "line",
						index: this.clampLineIndex(target.anchorIndex + 1, lineCount),
					};
				}
				return target;
			}

			case "bottom":
				return target;
		}
	}

	private resolveActiveTarget(
		snapshot: TimelineSnapshot,
		lineCount: number,
		flags: FocusResolveFlags,
	): FocalTarget {

		if (snapshot.isFocusOnInterlude && snapshot.activeInterlude) {

			if (!flags.canDisplayInterlude) {
				return {
					type: "line",
					index: this.clampLineIndex(
						snapshot.activeInterlude.anchorLineIndex + 1,
						lineCount,
					),
				};
			}
			return {
				type: "interlude",
				anchorIndex: snapshot.activeInterlude.anchorLineIndex,
			};
		}

		if (snapshot.isEndOfSong) {
			if (flags.hasBottomContent) {
				return { type: "bottom" };
			}
			return {
				type: "line",
				index: this.clampLineIndex(lineCount - 1, lineCount),
			};
		}

		return {
			type: "line",
			index: this.clampLineIndex(snapshot.scrollToIndex, lineCount),
		};
	}

	private clampLineIndex(index: number, lineCount: number): number {
		if (lineCount <= 0) return 0;
		return Math.min(Math.max(0, index), lineCount - 1);
	}

	public reset(): void {
		this.target = { type: "line", index: 0 };
	}
}
