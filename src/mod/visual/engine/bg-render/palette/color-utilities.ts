

import type { ColorVec3, HSVColor } from "./types.ts";

export function rgbToHsv(color: ColorVec3): HSVColor {
	const [r, g, b] = color;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);

	const v = (max * 100) / 255;
	if (max === min) return { h: 0, s: 0, v };

	const s = ((max - min) / max) * 100;
	let h = 0;
	if (max === r) {
		h = (60 * (g - b)) / (max - min);
	} else if (max === g) {
		h = 60 * (2 + (b - r) / (max - min));
	} else {
		h = 60 * (4 + (r - g) / (max - min));
	}
	if (h < 0) h += 360;
	return { h, s, v };
}

export function hsvToRgb(hsv: HSVColor): ColorVec3 {
	const h = hsv.h === 360 ? 0 : hsv.h;
	const hi = Math.floor(h / 60) % 6;
	const f = h / 60 - hi;
	const p = (hsv.v / 100) * (1 - hsv.s / 100) * 255;
	const q = (hsv.v / 100) * (1 - f * (hsv.s / 100)) * 255;
	const t = (hsv.v / 100) * (1 - (1 - f) * (hsv.s / 100)) * 255;
	const v = (hsv.v * 255) / 100;

	const rgbLookup: readonly ColorVec3[] = [
		[v, t, p],
		[q, v, p],
		[p, v, t],
		[p, q, v],
		[t, p, v],
		[v, p, q],
	];
	return rgbLookup[hi] ?? [v, p, q];
}

export function rgbToXyz(rgb: ColorVec3): ColorVec3 {
	const [red, green, blue] = rgb;
	const r = red / 255;
	const g = green / 255;
	const b = blue / 255;
	return [
		r * 0.4124 + g * 0.3576 + b * 0.1805,
		r * 0.2126 + g * 0.7152 + b * 0.0722,
		r * 0.0193 + g * 0.1192 + b * 0.9505,
	];
}

export function xyzToRgb(xyz: ColorVec3): ColorVec3 {
	const [x, y, z] = xyz;
	return [
		(x * 3.2406 - y * 1.5372 - z * 0.4986) * 255,
		(-x * 0.9689 + y * 1.8758 + z * 0.0415) * 255,
		(x * 0.0557 - y * 0.204 + z * 1.057) * 255,
	];
}

const D65 = {
	x: 0.95047,
	y: 1.0,
	z: 1.0883,
} as const;

function fxyz(t: number): number {
	return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

export function xyzToLab(xyz: ColorVec3): ColorVec3 {
	const [x, y, z] = xyz;
	return [
		116 * fxyz(y / D65.y) - 16,
		500 * (fxyz(x / D65.x) - fxyz(y / D65.y)),
		200 * (fxyz(y / D65.y) - fxyz(z / D65.z)),
	];
}

export function labToXyz(lab: ColorVec3): ColorVec3 {
	const delta = 6 / 29;
	const [l, a, b] = lab;
	const fy = (l + 16) / 116;
	const fx = fy + a / 500;
	const fz = fy - b / 200;
	return [
		fx > delta
			? D65.x * fx * fx * fx
			: (fx - 16 / 116) * 3 * delta * delta * D65.x,
		fy > delta
			? D65.y * fy * fy * fy
			: (fy - 16 / 116) * 3 * delta * delta * D65.y,
		fz > delta
			? D65.z * fz * fz * fz
			: (fz - 16 / 116) * 3 * delta * delta * D65.z,
	];
}

export function rgbToLab(rgb: ColorVec3): ColorVec3 {
	return xyzToLab(rgbToXyz(rgb));
}

export function labToRgb(lab: ColorVec3): ColorVec3 {
	return xyzToRgb(labToXyz(lab));
}

export function channelToLinear(value: number): number {
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function srgbToOkLab(rgb: ColorVec3): ColorVec3 {
	const [red, green, blue] = rgb;
	const linearRed = channelToLinear(red);
	const linearGreen = channelToLinear(green);
	const linearBlue = channelToLinear(blue);
	const l = Math.cbrt(
		0.4122214708 * linearRed +
			0.5363325363 * linearGreen +
			0.0514459929 * linearBlue,
	);
	const m = Math.cbrt(
		0.2119034982 * linearRed +
			0.6806995451 * linearGreen +
			0.1073969566 * linearBlue,
	);
	const s = Math.cbrt(
		0.0883024619 * linearRed +
			0.2817188376 * linearGreen +
			0.6299787005 * linearBlue,
	);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	];
}

export function yToLStar(y: number): number {

	if (y <= 216 / 24389) return y * (24389 / 27);
	return Math.cbrt(y) * 116 - 16;
}

function lStar(rgb: ColorVec3): number {
	const [r, g, b] = rgb;
	const y =
		0.2126 * channelToLinear(r / 255) +
		0.7152 * channelToLinear(g / 255) +
		0.0722 * channelToLinear(b / 255);
	return yToLStar(y);
}

export function paletteRgbLStarIsDark(rgb: ColorVec3): boolean {
	return lStar(rgb) <= 40;
}

export function paletteRgbLStarIsLight(rgb: ColorVec3): boolean {
	return lStar(rgb) >= 60;
}

export function rgbLStarIsDark(rgb: ColorVec3): boolean {
	return lStar(rgb) <= 50;
}

export function distanceSquared(a: ColorVec3, b: ColorVec3): number {
	const [ax, ay, az] = a;
	const [bx, by, bz] = b;
	const dx = ax - bx;
	const dy = ay - by;
	const dz = az - bz;
	return dx * dx + dy * dy + dz * dz;
}
