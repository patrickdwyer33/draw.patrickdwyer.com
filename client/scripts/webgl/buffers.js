export default function initBuffers(gl, n, colors) {
	const positionBuffer = initPositionBuffer(gl, n);
	const colorBuffer = initColorBuffer(gl, colors);

	return {
		positions: positionBuffer,
		colors: colorBuffer,
	};
}

function initColorBuffer(gl, colors) {
	const colorBuffer = gl.createBuffer();

	gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);

	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

	return colorBuffer;
}

function initPositionBuffer(gl, n) {
	const positionBuffer = gl.createBuffer();

	// Select the positionBuffer as the one to apply buffer
	// operations to from here out.
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

	// Allocate space for the buffer without passing data
	gl.bufferData(gl.ARRAY_BUFFER, n * 2 * 4, gl.DYNAMIC_DRAW); // n * 2 for x,y coordinates * 4 bytes per Float32

	return positionBuffer;
}
