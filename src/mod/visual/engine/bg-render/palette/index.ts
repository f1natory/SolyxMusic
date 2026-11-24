

export { createAutoPalette } from "./auto.ts";
export {
	channelToLinear,
	hsvToRgb,
	labToRgb,
	labToXyz,
	paletteRgbLStarIsDark,
	paletteRgbLStarIsLight,
	rgbLStarIsDark,
	rgbToHsv,
	rgbToLab,
	rgbToXyz,
	srgbToOkLab,
	xyzToLab,
	xyzToRgb,
	yToLStar,
} from "./color-utilities.ts";
export type { HistogramSource } from "./histogram.ts";
export { buildColorHistogram } from "./histogram.ts";
export { createKMeansPalette, createThemeColor } from "./kmeans.ts";
export { createOctTreePalette } from "./octtree.ts";
export type {
	ColorCount,
	ColorVec3,
	HSVColor,
	PaletteIntent,
	PaletteResult,
	ThemeColorResult,
} from "./types.ts";

import { createAutoPalette } from "./auto.ts";
import { buildColorHistogram, type HistogramSource } from "./histogram.ts";
import { createKMeansPalette, createThemeColor } from "./kmeans.ts";
import { createOctTreePalette } from "./octtree.ts";
import type { PaletteIntent, PaletteResult } from "./types.ts";

export type PaletteAlgorithm = "auto" | "kmeans" | "octtree";

export interface CreatePaletteOptions {

	algorithm?: PaletteAlgorithm;

	ignoreWhite?: boolean;

	toLab?: boolean;

	useKMeansPP?: boolean;

	intent?: PaletteIntent;

	sampleSize?: number;
}

export function createPaletteFromImage(
	source: HistogramSource,
	clusterCount: number,
	options: CreatePaletteOptions = {},
): PaletteResult {
	const normalizedClusterCount = Math.max(0, Math.floor(clusterCount));
	const {
		algorithm = "auto",
		ignoreWhite = false,
		toLab = false,
		useKMeansPP = false,
		intent = "accent",
		sampleSize,
	} = options;

	const entries = buildColorHistogram(source, sampleSize);
	if (entries.length === 0) {
		const themeColor = {
			color: [0, 0, 0] as [number, number, number],
			colorIsDark: true,
		};
		return {
			palette: Array.from(
				{ length: normalizedClusterCount },
				() => [0, 0, 0] as [number, number, number],
			),
			paletteIsDark: true,
			themeColor,
		};
	}

	switch (algorithm) {
		case "kmeans": {
			const themeColor = createThemeColor(entries, ignoreWhite, toLab);
			return createKMeansPalette(
				entries,
				normalizedClusterCount,
				themeColor,
				ignoreWhite,
				toLab,
				useKMeansPP,
				intent,
			);
		}
		case "octtree": {
			const themeColor = createThemeColor(entries, ignoreWhite, true);
			return createOctTreePalette(
				entries,
				normalizedClusterCount,
				themeColor,
				ignoreWhite,
				intent,
			);
		}
		default:
			return createAutoPalette(
				entries,
				normalizedClusterCount,
				ignoreWhite,
				toLab,
				useKMeansPP,
				intent,
			);
	}
}
