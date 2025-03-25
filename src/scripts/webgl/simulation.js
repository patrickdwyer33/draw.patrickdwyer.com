// modules
import initGLCanvas from "src/scripts/webgl/init.js";
import initBuffers from "src/scripts/webgl/buffers.js";
import initShaderProgram from "src/scripts/webgl/shaders.js";
import createAnimation from "src/scripts/webgl/animate.js";
import RBush from "rbush";

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
	let n = 10; //temp
	const buffers = initBuffers(gl, n);

	const edgeSize = 1.0;
	const dotSize = 100.0;

	// Initialize animation state
	const state = {
		positions: generateRandomPositions(
			n,
			gl.canvas.width,
			gl.canvas.height
		),
		velocities: generateRandomVelocities(n),
		continueAnimation: true,
		edgeSize,
		dotSize,
	};

	// Start animation loop
	createAnimation(
		updateAnimationState,
		gl,
		programInfo,
		buffers,
		clearColor,
		n,
		state
	);
}

function generateRandomPositions(n, width, height) {
	const positions = [];
	for (let i = 0; i < n; i++) {
		const x = Math.random() * width;
		const y = Math.random() * height;
		positions.push(x, y);
	}
	return positions;
}

function generateRandomVelocities(n) {
	const velocities = [];
	for (let i = 0; i < n * 2; i++) {
		let velocity =
			Math.max(Math.random(), 0.4) *
			10.0 *
			(Math.random() < 0.5 ? -1.0 : 1.0);
		velocities.push(velocity);
	}
	return velocities;
}

function drawScene(gl, programInfo, buffers, clearColor, n, state) {
	gl.clearColor(...clearColor);
	gl.clear(gl.COLOR_BUFFER_BIT);

	setPositionAttribute(gl, buffers, programInfo);

	// Tell WebGL to use our program when drawing
	gl.useProgram(programInfo.program);

	setResolutionUniform(gl, programInfo, state);

	const offset = 0;
	const vertexCount = n;
	gl.drawArrays(gl.POINTS, offset, vertexCount);
}

function setPositionAttribute(gl, buffers, programInfo) {
	let numComponents = 2; // pull out 2 values per iteration
	let type = gl.FLOAT;
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

function setResolutionUniform(gl, programInfo, state) {
	gl.uniform2f(
		programInfo.uniformLocations.uResolution,
		gl.canvas.width,
		gl.canvas.height
	);
	gl.uniform1f(programInfo.uniformLocations.uEdgeSize, state.edgeSize);
	gl.uniform1f(programInfo.uniformLocations.dotSize, state.dotSize);
}

// Returns distance between two indices in positions array squared
function positionsArrayDistSquared(positions, idx1, idx2) {
	return (
		(positions[idx1 * 2] - positions[idx2 * 2]) ** 2 +
		(positions[idx1 * 2 + 1] - positions[idx2 * 2 + 1]) ** 2
	);
}

function updateAnimationState(
	deltaTime,
	gl,
	programInfo,
	buffers,
	clearColor,
	n,
	state
) {
	const dotRadius = state.dotSize / 2;

	const bboxes = [];

	// Update positions based on velocities
	for (let i = 0; i < n; i++) {
		const xIndexOffset = i * 2;
		const yIndexOffset = xIndexOffset + 1;
		const x = state.positions[xIndexOffset];
		const y = state.positions[yIndexOffset];
		const vx = state.velocities[xIndexOffset];
		const vy = state.velocities[yIndexOffset];

		// Check for collisions with canvas boundaries
		if (
			(x <= 0 + dotRadius && vx < 0) ||
			(x >= gl.canvas.width - dotRadius && vx > 0)
		) {
			state.velocities[xIndexOffset] *= -1; // Reverse x velocity
		}
		if (
			(y <= 0 + dotRadius && vy < 0) ||
			(y >= gl.canvas.height - dotRadius && vy > 0)
		) {
			state.velocities[yIndexOffset] *= -1; // Reverse y velocity
		}

		const bbox = {
			minX: x - dotRadius,
			minY: y - dotRadius,
			maxX: x + dotRadius,
			maxY: y + dotRadius,
			x,
			y,
			index: i,
		};
		bboxes.push(bbox);
	}

	const tree = new RBush(9);
	tree.load(bboxes);
	const foundCollisionIds = new Set();
	for (let i = 0; i < n; i++) {
		if (foundCollisionIds.has(i)) {
			continue;
		}
		const bbox = bboxes[i];
		const collisions = tree.search(bbox);
		let collision = collisions.pop(); // just handling one collision at a time for now. Will need to handle the edge case later
		// also note that weird things may happen with current setup around the walls
		// this loop handles the fact that the bounding box checks for square overlap
		if (!collision) continue;
		while (
			collision.index == i
			// collision.index == i ||
			// positionsArrayDistSquared(state.positions, i, collision.index) >
			// 	state.dotSize ** 2 // same radius so we can just use diameter for collision detection
		) {
			collision = collisions.pop();
			if (collision === undefined) {
				collision = false;
				break;
			}
		}
		if (!collision) continue;
		foundCollisionIds.add(collision.index);
		const xIndexOffset = i * 2;
		const yIndexOffset = xIndexOffset + 1;
		const xIndexOffsetCollision = collision.index * 2;
		const yIndexOffsetCollision = xIndexOffsetCollision + 1;
		// get updated velocities after collision
		console.log(i);
		const [vx1, vy1, vx2, vy2] = processCollision(
			state.positions[xIndexOffset],
			state.positions[yIndexOffset],
			state.velocities[xIndexOffset],
			state.velocities[yIndexOffset],
			collision.x,
			collision.y,
			state.velocities[xIndexOffsetCollision],
			state.velocities[yIndexOffsetCollision]
		);
		// update
		state.velocities[xIndexOffset] = vx1;
		state.velocities[yIndexOffset] = vy1;
		state.velocities[xIndexOffsetCollision] = vx2;
		state.velocities[yIndexOffsetCollision] = vy2;
	}

	for (let i = 0; i < n; i++) {
		// Update position
		const xIndexOffset = i * 2;
		const yIndexOffset = xIndexOffset + 1;
		state.positions[xIndexOffset] +=
			state.velocities[xIndexOffset] * deltaTime;
		state.positions[yIndexOffset] +=
			state.velocities[yIndexOffset] * deltaTime;
	}

	// Update the buffer with new positions
	gl.bindBuffer(gl.ARRAY_BUFFER, buffers.positions);
	gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(state.positions));

	// Draw the updated scene
	drawScene(gl, programInfo, buffers, clearColor, n, state);

	return state;
}

function processCollision(x1, y1, v1x, v1y, x2, y2, v2x, v2y) {
	// calculate line between
	// calculate angle between og x axis and line between
	// find coordinates of v1 and v2 in new coordinate system
	// swap x components
	// convert back to original coordinate system
	// return new velocities
	const xlineBetween = x1 - x2;
	const ylineBetween = y1 - y2;
	const phi = Math.atan2(ylineBetween, xlineBetween);
	// first check to make sure that the balls are moving towards each other
	// if they're not return early so the balls don't get stuck
	const dotProductv1 = v1x * xlineBetween + v1y * ylineBetween;
	const dotProductv2 = v2x * xlineBetween + v2y * ylineBetween;
	console.log("TRYING TO COLLIDE");
	// p1 heading toward p2 if v1 in opposite direction of lineBetween
	// p2 heading towards p1 if v2 in direction of lineBetween
	if (dotProductv1 > 0 && dotProductv2 < 0) {
		console.log(x1, y1);
		console.log(x2, y2);
		console.log(dotProductv1);
		console.log(dotProductv2);
		console.log(v1x, v1y);
		console.log(v2x, v2y);
		return [v1x, v1y, v2x, v2y];
	}
	console.log("SWITCHING");
	console.log([v1x, v1y, v2x, v2y]);
	// convert to new coordinate system and swap components
	const v1xPrime = v1x * Math.cos(phi) - v1y * Math.sin(phi); // v1 x in rotated frame
	const v1yPrime = v1x * Math.sin(phi) + v1y * Math.cos(phi); // v1 y in rotated frame
	const v2xPrime = v2x * Math.cos(phi) - v2y * Math.sin(phi); // v2 x in rotated frame
	const v2yPrime = v2x * Math.sin(phi) + v2y * Math.cos(phi); // v2 y in rotated frame

	// Swap x components (parallel to collision line)
	const v1xPrimeSwapped = v2xPrime;
	const v2xPrimeSwapped = v1xPrime;

	// Convert back to original coordinate system
	const v1xSwap = v1xPrimeSwapped * Math.cos(phi) + v1yPrime * Math.sin(phi);
	const v1ySwap = -v1xPrimeSwapped * Math.sin(phi) + v1yPrime * Math.cos(phi);
	const v2xSwap = v2xPrimeSwapped * Math.cos(phi) + v2yPrime * Math.sin(phi);
	const v2ySwap = -v2xPrimeSwapped * Math.sin(phi) + v2yPrime * Math.cos(phi);
	console.log([v1xSwap, v1ySwap, v2xSwap, v2ySwap]);
	console.log("END SWITCHING");
	return [v1xSwap, v1ySwap, v2xSwap, v2ySwap];
}
