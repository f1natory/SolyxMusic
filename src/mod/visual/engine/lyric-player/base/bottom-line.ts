
import type { Disposable, HasElement } from "@visual/interfaces.ts";
import type { Spring } from "@visual/utils/spring.ts";
import type { Duration } from "@visual/utils/time.ts";

export interface BottomLineTransforms {
	posY: Spring;
}

export interface BottomLine extends HasElement, Disposable {

	resetPosition(): void;

	getContentElement?(): HTMLElement;

	lineSize: [number, number];

	readonly lineTransforms: BottomLineTransforms;

	setFocused(focused: boolean): void;

	setTransform(
		top?: number,
		blur?: number,
		immediate?: boolean,
		delay?: Duration,
	): void;

	update(delta?: Duration): void;
}
