

export type LrcMetadata = [string, string[]][];

export type LrcMode = "plain" | "enhanced" | "spl";

export interface LrcModeFeatures {

	wordLevel: boolean;

	inlineAuxiliary: boolean;
}

export const LRC_MODE_FEATURES: Record<LrcMode, LrcModeFeatures> = {
	plain: { wordLevel: false, inlineAuxiliary: true },
	enhanced: { wordLevel: true, inlineAuxiliary: false },
	spl: { wordLevel: true, inlineAuxiliary: false },
};
