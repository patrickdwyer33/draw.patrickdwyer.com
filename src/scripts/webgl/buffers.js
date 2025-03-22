export default function initBuffers(gl, n) {
	const positionBuffer = initPositionBuffer(gl, n);
	const colorBuffer = initColorBuffer(gl);

	return {
		positions: positionBuffer,
		color: colorBuffer,
	};
}

function initColorBuffer(gl) {
	const colorBuffer = gl.createBuffer();

	gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);

	const sizes = [10.0, 10.0, 10.0, 10.0, 10.0];

	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sizes), gl.STATIC_DRAW);

	return colorBuffer;
}

function generateRandomPositions(n, width, height) {
	const positions = [];
	for (let i = 0; i < n; i++) {
		const x = Math.floor(Math.random() * (width + 1));
		const y = Math.floor(Math.random() * (height + 1));
		positions.push(x, y);
	}
	return positions;
}

function initPositionBuffer(gl, n) {
	const positionBuffer = gl.createBuffer();

	// Select the positionBuffer as the one to apply buffer
	// operations to from here out.
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

	const positions = generateRandomPositions(
		n,
		gl.canvas.width,
		gl.canvas.height
	);

	// Now pass the list of positions into WebGL to build the
	// shape. We do this by creating a Float32Array from the
	// JavaScript array, then use it to fill the current buffer.
	gl.bufferData(gl.ARRAY_BUFFER, new Int16Array(positions), gl.DYNAMIC_DRAW);

	return positionBuffer;
}
