

export type ColorVec3 = [number, number, number];

export interface HSVColor {
	h: number;
	s: number;
	v: number;
}

export interface ColorCount {
	color: ColorVec3;
	count: number;
}

export interface ThemeColorResult {

	color: ColorVec3;

	colorIsDark: boolean;
}

export interface PaletteResult {

	palette: ColorVec3[];

	paletteIsDark: boolean;

	themeColor: ThemeColorResult;
}

export type PaletteIntent = "accent" | "dominant";
