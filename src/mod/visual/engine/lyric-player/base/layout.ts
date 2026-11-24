
import { LayoutAlignAnchor } from "./consts.ts";

export interface LayoutConfig {

	alignAnchor: LayoutAlignAnchor;

	alignPosition: number;

	overscanPx: number;
}

export interface LayoutFrameContext {

	containerHeight: number;

	scrollOffset: number;

	target: FocalTarget;

	bottomLineHeight: number;

	interlude?: {

		totalHeight: number;

		anchorIndex: number;
	};
}

export interface RenderInstruction {

	y: number;

	height: number;

	isInViewport: boolean;
}

export interface LayoutResult {

	lineCount: number;

	readonly lineInstructions: ReadonlyArray<RenderInstruction>;

	hasInterlude: boolean;

	interludeY: number;

	bottomLineY: number;

	isBottomLineInViewport: boolean;
}

export type FocalTargetType = "line" | "interlude" | "bottom";

export type FocalTarget =
	| { type: "line"; index: number }
	| { type: "interlude"; anchorIndex: number }
	| { type: "bottom" };

type ResolvedLayoutMetrics = {
	isValid: boolean;
	focalTopY: number;
	anchorOffset: number;
	interludeTotalHeight: number;
	activeInterludeAnchor: number | undefined;
};

export type LayoutFrameSession = ResolvedLayoutMetrics & {
	containerHeight: number;
	alignPosition: number;
	overscanPx: number;
	bottomLineHeight: number;
};

export class LayoutCalculator {

	private prefixSums: Float64Array = new Float64Array(0);

	private heights: Float64Array = new Float64Array(0);

	private isMeasured: Uint8Array = new Uint8Array(0);

	private instructionPool: RenderInstruction[] = [];
	private isPrefixSumDirty = true;

	private readonly resolvedMetrics: ResolvedLayoutMetrics = {
		isValid: false,
		focalTopY: 0,
		anchorOffset: 0,
		interludeTotalHeight: 0,
		activeInterludeAnchor: undefined,
	};

	private readonly layoutResult: LayoutResult = {
		lineCount: 0,
		lineInstructions: this.instructionPool,
		bottomLineY: 0,
		isBottomLineInViewport: false,
		hasInterlude: false,
		interludeY: 0,
	};

	private lyricCount: number = 0;

	private totalLyricHeight: number = 0;

	public initHeights(count: number, defaultHeight: number): void {
		this.lyricCount = count;

		this.resetLayoutResult();

		if (this.prefixSums.length < count + 1) {
			this.prefixSums = new Float64Array(count + 1);
			this.heights = new Float64Array(count);
			this.isMeasured = new Uint8Array(count);
		} else {
			this.prefixSums.fill(0);
		}

		for (let i = 0; i < count; i++) {
			this.heights[i] = defaultHeight;
			this.isMeasured[i] = 0;
		}

		this.isPrefixSumDirty = true;

		const currentPoolSize = this.instructionPool.length;
		if (count > currentPoolSize) {
			for (let i = currentPoolSize; i < count; i++) {
				this.instructionPool.push({
					y: 0,
					height: 0,
					isInViewport: false,
				});
			}
		}
	}

	public getLineHeight(index: number): number {
		if (index < 0 || index >= this.lyricCount) return 0;
		this.ensurePrefixSums();
		return this.prefixSums[index + 1] - this.prefixSums[index];
	}

	public setLineHeight(index: number, height: number): void {
		if (index < 0 || index >= this.lyricCount) return;

		if (this.heights[index] !== height || this.isMeasured[index] === 0) {
			this.heights[index] = height;
			this.isMeasured[index] = 1;
			this.isPrefixSumDirty = true;
		}
	}

	public updateUnmeasuredHeights(defaultHeight: number): void {
		let changed = false;
		for (let i = 0; i < this.lyricCount; i++) {
			if (this.isMeasured[i] === 0 && this.heights[i] !== defaultHeight) {
				this.heights[i] = defaultHeight;
				changed = true;
			}
		}
		if (changed) {
			this.isPrefixSumDirty = true;
		}
	}

	public beginFrame(
		ctx: LayoutFrameContext,
		config: LayoutConfig,
	): { bounds: { min: number; max: number }; session: LayoutFrameSession } {
		this.ensurePrefixSums();

		const metrics = this.resolveLayoutMetrics(ctx, config);

		const session: LayoutFrameSession = {
			...metrics,
			containerHeight: ctx.containerHeight,
			alignPosition: config.alignPosition,
			overscanPx: config.overscanPx,
			bottomLineHeight: ctx.bottomLineHeight,
		};

		if (!metrics.isValid) {
			return { bounds: { min: 0, max: 0 }, session };
		}

		const {
			focalTopY,
			anchorOffset,
			interludeTotalHeight,
			activeInterludeAnchor,
		} = metrics;

		const minOffset = Math.min(0, -focalTopY);

		const basePosWithoutScroll =
			-focalTopY + ctx.containerHeight * config.alignPosition - anchorOffset;

		let totalContentHeight = this.totalLyricHeight;
		if (activeInterludeAnchor !== undefined) {
			totalContentHeight += interludeTotalHeight;
		}

		const rawMaxOffset =
			basePosWithoutScroll + totalContentHeight - ctx.containerHeight / 2;
		const maxOffset = Math.max(0, rawMaxOffset);

		return { bounds: { min: minOffset, max: maxOffset }, session };
	}

	public commit(
		session: LayoutFrameSession,
		scrollOffset: number,
	): LayoutResult {
		this.ensurePrefixSums();

		if (!session.isValid) {
			return this.resetLayoutResult();
		}

		this.layoutResult.lineCount = this.lyricCount;

		const {
			focalTopY,
			anchorOffset,
			interludeTotalHeight,
			activeInterludeAnchor,
			containerHeight,
			alignPosition,
			overscanPx,
			bottomLineHeight,
		} = session;

		const viewportStartY =
			containerHeight * alignPosition - anchorOffset - scrollOffset - focalTopY;

		const motionBuffer = containerHeight * 0.4;
		const viewportTopBound = -overscanPx - motionBuffer;
		const viewportBottomBound = containerHeight + overscanPx + motionBuffer;

		for (let i = 0; i < this.lyricCount; i++) {
			const instruction = this.instructionPool[i];
			let lineY = viewportStartY + this.prefixSums[i];
			const lineH = this.prefixSums[i + 1] - this.prefixSums[i];

			if (activeInterludeAnchor !== undefined && i > activeInterludeAnchor) {
				lineY += interludeTotalHeight;
			}

			instruction.y = lineY;
			instruction.height = lineH;
			instruction.isInViewport =
				lineY <= viewportBottomBound && lineY + lineH >= viewportTopBound;
		}

		if (activeInterludeAnchor !== undefined) {
			this.layoutResult.hasInterlude = true;
			this.layoutResult.interludeY =
				viewportStartY + this.prefixSums[activeInterludeAnchor + 1];
		} else {
			this.layoutResult.hasInterlude = false;
			this.layoutResult.interludeY = 0;
		}

		let bottomY = viewportStartY + this.totalLyricHeight;
		if (activeInterludeAnchor !== undefined) {
			bottomY += interludeTotalHeight;
		}

		this.layoutResult.bottomLineY = bottomY;
		this.layoutResult.isBottomLineInViewport =
			bottomY <= viewportBottomBound &&
			bottomY + bottomLineHeight >= viewportTopBound;

		return this.layoutResult;
	}

	public static resolveInterludeAnchorIndex(
		interlude: { anchorLineIndex: number } | undefined,
		focalTarget: FocalTarget,
	): number | undefined {

		if (interlude) {
			return interlude.anchorLineIndex;
		}

		if (focalTarget.type === "interlude") {
			return focalTarget.anchorIndex;
		}
		return undefined;
	}

	private ensurePrefixSums(): void {
		if (!this.isPrefixSumDirty) return;

		let sum = 0;
		this.prefixSums[0] = 0;
		for (let i = 0; i < this.lyricCount; i++) {
			sum += this.heights[i];
			this.prefixSums[i + 1] = sum;
		}
		this.totalLyricHeight = sum;
		this.isPrefixSumDirty = false;
	}

	private resolveLayoutMetrics(
		ctx: LayoutFrameContext,
		config: LayoutConfig,
	): ResolvedLayoutMetrics {
		const interludeTotalHeight = ctx.interlude?.totalHeight ?? 0;
		const activeInterludeAnchor = ctx.interlude?.anchorIndex;

		this.resolvedMetrics.interludeTotalHeight = interludeTotalHeight;
		this.resolvedMetrics.activeInterludeAnchor = activeInterludeAnchor;

		if (
			this.lyricCount === 0 ||
			(ctx.target.type === "line" &&
				(ctx.target.index < 0 || ctx.target.index >= this.lyricCount)) ||
			(ctx.target.type === "interlude" &&
				(ctx.target.anchorIndex < -1 ||
					ctx.target.anchorIndex >= this.lyricCount - 1))
		) {
			this.resolvedMetrics.isValid = false;
			this.resolvedMetrics.focalTopY = 0;
			this.resolvedMetrics.anchorOffset = 0;
			return this.resolvedMetrics;
		}

		this.updateFocalMetrics(
			ctx.target,
			interludeTotalHeight,
			activeInterludeAnchor,
			ctx.bottomLineHeight,
			config,
		);

		this.resolvedMetrics.isValid = true;
		return this.resolvedMetrics;
	}

	private updateFocalMetrics(
		target: FocalTarget,
		interludeTotalHeight: number,
		activeInterludeAnchor: number | undefined,
		bottomLineHeight: number,
		config: LayoutConfig,
	): void {
		let focalTopY = 0;
		let targetHeight = 0;

		if (target.type === "line") {
			focalTopY = this.prefixSums[target.index];

			if (
				activeInterludeAnchor !== undefined &&
				target.index > activeInterludeAnchor
			) {
				focalTopY += interludeTotalHeight;
			}
			targetHeight =
				this.prefixSums[target.index + 1] - this.prefixSums[target.index];
		} else if (target.type === "interlude") {
			focalTopY = this.prefixSums[target.anchorIndex + 1];
			targetHeight = interludeTotalHeight;
		} else if (target.type === "bottom") {
			focalTopY = this.totalLyricHeight;
			if (activeInterludeAnchor !== undefined) {
				focalTopY += interludeTotalHeight;
			}
			targetHeight = bottomLineHeight;
		}

		this.resolvedMetrics.focalTopY = focalTopY;
		this.resolvedMetrics.anchorOffset = this.calculateAnchorOffset(
			config.alignAnchor,
			targetHeight,
		);
	}

	private calculateAnchorOffset(
		alignAnchor: LayoutAlignAnchor,
		targetHeight: number,
	): number {
		if (targetHeight <= 0) return 0;

		switch (alignAnchor) {
			case LayoutAlignAnchor.Top:
				return 0;
			case LayoutAlignAnchor.Center:
				return targetHeight / 2;
			case LayoutAlignAnchor.Bottom:
				return targetHeight;
		}

		const exhaustiveCheck: never = alignAnchor;
		return exhaustiveCheck;
	}

	private resetLayoutResult(): LayoutResult {
		this.layoutResult.lineCount = 0;
		this.layoutResult.hasInterlude = false;
		this.layoutResult.interludeY = 0;
		this.layoutResult.bottomLineY = 0;
		this.layoutResult.isBottomLineInViewport = false;

		for (let i = 0; i < this.instructionPool.length; i++) {
			this.instructionPool[i].isInViewport = false;
			this.instructionPool[i].y = 0;
			this.instructionPool[i].height = 0;
		}

		return this.layoutResult;
	}

}
