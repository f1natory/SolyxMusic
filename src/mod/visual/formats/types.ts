

export interface LyricWord {

	startTime: number;

	endTime: number;

	word: string;

	romanWord?: string;
}

export interface LyricLine {

	words: LyricWord[];

	translatedLyric: string;

	romanLyric: string;

	isBG: boolean;

	isDuet: boolean;

	startTime: number;

	endTime: number;
}

export type LyricParseResult = TTMLLyric;

export interface TTMLLyric {

	lines: LyricLine[];

	metadata: [string, string[]][];
}
