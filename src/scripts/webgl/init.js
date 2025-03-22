import { resizeCanvasToDisplaySize } from "src/scripts/utils/webgl-utils.js";

export default function init(canvasId, clearColor) {
	const canvas = document.getElementById(canvasId);
	const gl = canvas.getContext("webgl2", {
		antialias: false,
	});

	if (gl === null) {
		alert(
			"Unable to initialize WebGL 2.0. Your browser or machine may not support it."
		);
		return;
	}

	resizeCanvasToDisplaySize(gl.canvas);
	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

	gl.clearColor(...clearColor);
	gl.clear(gl.COLOR_BUFFER_BIT);

	return gl;
}
