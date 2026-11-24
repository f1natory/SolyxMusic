

export interface HasElement {

	getElement(): HTMLElement;
}

export interface Disposable {

	dispose(): void;
}

export interface LyricWordBase {

	startTime: number;

	endTime: number;

	word: string;
}

export interface LyricWord extends LyricWordBase {

	romanWord?: string;

	obscene?: boolean;

	ruby?: LyricWordBase[];
}

export interface LyricLine {

	words: LyricWord[];

	translatedLyric: string;

	romanLyric: string;

	startTime: number;

	endTime: number;

	isBG: boolean;

	isDuet: boolean;
}

export interface OptimizeLyricOptions {

	normalizeSpaces?: boolean;

	resetLineTimestamps?: boolean;

	convertExcessiveBackgroundLines?: boolean;

	syncMainAndBackgroundLines?: boolean;

	cleanUnintentionalOverlaps?: boolean;

	tryAdvanceStartTime?: boolean;
}
