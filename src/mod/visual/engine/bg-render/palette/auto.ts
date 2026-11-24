

import { rgbToLab } from "./color-utilities.ts";
import {
	createKMeansPalette,
	createRandom,
	createThemeColor,
	seedFromHistogram,
} from "./kmeans.ts";
import { createOctTreePalette } from "./octtree.ts";
import type {
	ColorCount,
	ColorVec3,
	PaletteIntent,
	PaletteResult,
} from "./types.ts";

function calculateSpatialDiversity(palette: readonly ColorVec3[]): number {
	if (palette.length === 0) return 0;

	const labVectors = palette.map(rgbToLab);
	let centroidL = 0;
	let centroidA = 0;
	let centroidB = 0;
	for (const [l, a, b] of labVectors) {
		centroidL += l;
		centroidA += a;
		centroidB += b;
	}
	centroidL /= labVectors.length;
	centroidA /= labVectors.length;
	centroidB /= labVectors.length;

	let sumSquaredDistances = 0;
	for (const [l, a, b] of labVectors) {
		const dl = l - centroidL;
		const da = a - centroidA;
		const db = b - centroidB;
		sumSquaredDistances += dl * dl + da * da + db * db;
	}
	return sumSquaredDistances / labVectors.length;
}

function countDistinctColors(palette: readonly ColorVec3[]): number {
	return new Set(palette.map((color) => color.join(","))).size;
}

export function createAutoPalette(
	sourceColors: readonly ColorCount[],
	clusterCount: number,
	ignoreWhite = false,
	toLab = false,
	useKMeansPP = false,
	intent: PaletteIntent = "accent",
): PaletteResult {
	const random = createRandom(seedFromHistogram(sourceColors));
	const themeColor = createThemeColor(sourceColors, ignoreWhite, toLab, random);
	const kmeansResult = createKMeansPalette(
		sourceColors,
		clusterCount,
		themeColor,
		ignoreWhite,
		toLab,
		useKMeansPP,
		intent,
		random,
	);
	const octTreeResult = createOctTreePalette(
		sourceColors,
		clusterCount,
		themeColor,
		ignoreWhite,
		intent,
	);

	const kMeansDistinct = countDistinctColors(kmeansResult.palette);
	const octTreeDistinct = countDistinctColors(octTreeResult.palette);
	if (kMeansDistinct !== octTreeDistinct) {
		return kMeansDistinct > octTreeDistinct ? kmeansResult : octTreeResult;
	}

	const kMeansDiversity = calculateSpatialDiversity(kmeansResult.palette);
	const octTreeDiversity = calculateSpatialDiversity(octTreeResult.palette);

	if (intent === "dominant" || kmeansResult.paletteIsDark) {
		return kMeansDiversity >= octTreeDiversity ? kmeansResult : octTreeResult;
	}
	return kMeansDiversity <= octTreeDiversity || octTreeDiversity === 0
		? kmeansResult
		: octTreeResult;
}
