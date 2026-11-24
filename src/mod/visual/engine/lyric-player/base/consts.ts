
import { Duration } from "@visual/utils/time.ts";

type ValueOf<T extends Record<PropertyKey, unknown>> = T[keyof T];

export const MaskObsceneWordsMode = {

	Disabled: "",

	FullMask: "full-mask",

	PartialMask: "partial-mask",
} as const;

export type MaskObsceneWordsMode = ValueOf<typeof MaskObsceneWordsMode>;

export const LyricLineRenderMode = {
	SOLID: 0,
	GRADIENT: 1,
} as const;

export type LyricLineRenderMode = ValueOf<typeof LyricLineRenderMode>;

export const LayoutAlignAnchor = {
	Top: "top",
	Center: "center",
	Bottom: "bottom",
} as const;

export type LayoutAlignAnchor = ValueOf<typeof LayoutAlignAnchor>;

export const LayoutReason = {

	PlaybackTick: "playback-tick",

	Resize: "resize",

	InteractionStart: "interaction-start",

	ContinuousScroll: "continuous-scroll",

	DiscreteScroll: "discrete-scroll",

	Seek: "seek",

	RebuildView: "rebuild-view",

	ConfigChange: "config-change",
} as const;

export type LayoutReason = ValueOf<typeof LayoutReason>;

export interface LayoutStrategy {

	disableStagger: boolean;

	resetInterlude: boolean;

	snapPosY: boolean;
}

export const LayoutReasonStrategyMap: Record<LayoutReason, LayoutStrategy> = {
	[LayoutReason.PlaybackTick]: {
		disableStagger: false,
		resetInterlude: false,
		snapPosY: false,
	},
	[LayoutReason.ContinuousScroll]: {
		disableStagger: true,
		resetInterlude: false,
		snapPosY: true,
	},
	[LayoutReason.DiscreteScroll]: {
		disableStagger: true,
		resetInterlude: false,
		snapPosY: false,
	},
	[LayoutReason.InteractionStart]: {
		disableStagger: true,
		resetInterlude: false,
		snapPosY: false,
	},
	[LayoutReason.Seek]: {
		disableStagger: true,
		resetInterlude: true,
		snapPosY: false,
	},

	[LayoutReason.RebuildView]: {
		disableStagger: true,
		resetInterlude: true,
		snapPosY: false,
	},
	[LayoutReason.Resize]: {
		disableStagger: true,
		resetInterlude: false,
		snapPosY: false,
	},
	[LayoutReason.ConfigChange]: {
		disableStagger: true,
		resetInterlude: false,
		snapPosY: false,
	},
};

export const MAX_FRAME_DELTA: Duration = Duration.fromMillis(100);
