

export interface MaskTargetWord {
	readonly word: string;
	readonly startTime: number;
	readonly endTime: number;
	readonly ruby?: ReadonlyArray<{
		readonly word: string;
		readonly startTime: number;
		readonly endTime: number;
	}>;
	readonly mainElement: HTMLElement;
	readonly width: number;
	readonly height: number;
	readonly padding: number;
}

export interface MaskContext {

	readonly lineStartTime: number;

	readonly lineEndTime: number;

	readonly wordFadeWidth: number;

	readonly supportMaskImage: boolean;
}

export interface LineMaskAnimator {
	apply(): void;

	setCurrentTime(timeRelative: number, isPlaying: boolean): void;
	pause(): void;
	resume(): void;
	dispose(): void;
}
