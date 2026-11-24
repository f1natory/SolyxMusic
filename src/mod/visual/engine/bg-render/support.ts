

let webgl1Support: boolean | undefined;
let webgl2Support: boolean | undefined;
let highpFragmentSupport: boolean | undefined;

function withProbeContext(
	contextId: "webgl" | "webgl2",
	probe: (gl: WebGLRenderingContext | WebGL2RenderingContext) => boolean = () =>
		true,
): boolean {
	try {
		const canvas = document.createElement("canvas");
		canvas.width = 1;
		canvas.height = 1;
		const gl = canvas.getContext(contextId) as
			| WebGLRenderingContext
			| WebGL2RenderingContext
			| null;
		if (!gl) return false;
		try {
			return probe(gl);
		} finally {

			gl.getExtension("WEBGL_lose_context")?.loseContext();
		}
	} catch {
		return false;
	}
}

export function isWebGL1Supported(): boolean {
	if (webgl1Support === undefined) webgl1Support = withProbeContext("webgl");
	return webgl1Support;
}

export function isWebGL2Supported(): boolean {
	if (webgl2Support === undefined) webgl2Support = withProbeContext("webgl2");
	return webgl2Support;
}

export function isHighpFragmentSupported(): boolean {
	if (highpFragmentSupport === undefined) {
		highpFragmentSupport = withProbeContext("webgl", (gl) => {
			const format = gl.getShaderPrecisionFormat(
				gl.FRAGMENT_SHADER,
				gl.HIGH_FLOAT,
			);
			return (format?.precision ?? 0) > 0;
		});
	}
	return highpFragmentSupport;
}
