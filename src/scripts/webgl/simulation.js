// modules
import initGLCanvas from "src/scripts/webgl/init.js";
import initBuffers from "src/scripts/webgl/buffers.js";
import initShaderProgram from "src/scripts/webgl/shaders.js";
import createAnimation from "src/scripts/webgl/animate.js";

async function importShaderSource(fileName) {
	return await fetch(fileName).then((response) => response.text());
}

// main loop
export default async function runSimulation(canvasId, clearColor) {
	const gl = initGLCanvas(canvasId, clearColor);
	const vertexShaderSource = await importShaderSource(
		"src/shaders/vertex/basic.vert"
	);
	const fragmentShaderSource = await importShaderSource(
		"src/shaders/fragment/basic.frag"
	);
	const shaderProgram = initShaderProgram(
		gl,
		vertexShaderSource,
		fragmentShaderSource
	);
	const programInfo = {
		program: shaderProgram,
		attributeLocations: {
			vertexPosition: gl.getAttribLocation(shaderProgram, "aPosition"),
		},
		uniformLocations: {
			uResolution: gl.getUniformLocation(shaderProgram, "uResolution"),
			uEdgeSize: gl.getUniformLocation(shaderProgram, "uEdgeSize"),
			dotSize: gl.getUniformLocation(shaderProgram, "dotSize"),
		},
	};
	let n = 20; //temp
	const buffers = initBuffers(gl, n);

	drawScene(gl, 0.0, programInfo, buffers, clearColor, n);
}

function drawScene(gl, _, programInfo, buffers, clearColor, n) {
	gl.clearColor(...clearColor);
	gl.clear(gl.COLOR_BUFFER_BIT);

	setPositionAttribute(gl, buffers, programInfo);

	// Tell WebGL to use our program when drawing
	gl.useProgram(programInfo.program);

	setResolutionUniform(gl, programInfo);

	const offset = 0;
	const vertexCount = n;
	gl.drawArrays(gl.POINTS, offset, vertexCount);
}

function setPositionAttribute(gl, buffers, programInfo) {
	let numComponents = 2; // pull out 2 values per iteration
	let type = gl.SHORT;
	let normalize = false; // don't normalize
	let stride = 0; // how many bytes to get from one set of values to the next
	// 0 = use type and numComponents above
	let offset = 0; // how many bytes inside the buffer to start from
	gl.bindBuffer(gl.ARRAY_BUFFER, buffers.positions);
	gl.vertexAttribPointer(
		programInfo.attributeLocations.vertexPosition,
		numComponents,
		type,
		normalize,
		stride,
		offset
	);
	gl.enableVertexAttribArray(programInfo.attributeLocations.vertexPosition);
}

function setResolutionUniform(gl, programInfo) {
	gl.uniform2f(
		programInfo.uniformLocations.uResolution,
		gl.canvas.width,
		gl.canvas.height
	);
	const edgeSize = 1.0;
	gl.uniform1f(programInfo.uniformLocations.uEdgeSize, edgeSize);
	const dotSize = 100.0;
	gl.uniform1f(programInfo.uniformLocations.dotSize, dotSize);
}
