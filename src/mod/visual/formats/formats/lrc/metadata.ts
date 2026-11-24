
import type { LrcMetadata } from "./types";

const LRC_METADATA_REGEX = /^\[\s*(?<key>[a-zA-Z]+)\s*:\s*(?<value>.*?)\s*\]$/;

export function parseLrcMetadataLine(line: string): LrcMetadata | null {
	const match = line.match(LRC_METADATA_REGEX);
	if (!match?.groups) return null;

	const key = match.groups.key.toLowerCase();
	const value = match.groups.value.trim();
	if (!value) return null;

	return [[key, [value]]];
}

export function mergeMetadata(target: LrcMetadata, source: LrcMetadata): void {
	for (const [key, values] of source) {
		const existing = target.find(([targetKey]) => targetKey === key);
		if (!existing) {
			target.push([key, [...values]]);
			continue;
		}
		for (const value of values) {
			if (!existing[1].includes(value)) existing[1].push(value);
		}
	}
}

export function generateLrcMetadataLines(metadata: LrcMetadata): string[] {
	const lines: string[] = [];
	for (const [key, values] of metadata) {
		const printableValues = values.filter((value) => value.trim() !== "");
		if (!key.trim() || printableValues.length === 0) continue;
		lines.push(`[${key}:${printableValues.join("/")}]`);
	}
	return lines;
}
