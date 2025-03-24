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
	let n = 40; //temp
	const buffers = initBuffers(gl, n);

	const edgeSize = 1.0;
	const dotSize = 10.0;

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

	const tree = new RBush(9);

	// Update positions based on velocities
	for (let i = 0; i < n; i++) {
		const x = state.positions[i * 2];
		const y = state.positions[i * 2 + 1];

		// Check for collisions with canvas boundaries
		if (
			(x <= 0 + dotRadius && state.velocities[i * 2] < 0) ||
			(x >= gl.canvas.width - dotRadius && state.velocities[i * 2] > 0)
		) {
			state.velocities[i * 2] *= -1; // Reverse x velocity
		}
		if (
			(y <= 0 + dotRadius && state.velocities[i * 2 + 1] < 0) ||
			(y >= gl.canvas.height - dotRadius &&
				state.velocities[i * 2 + 1] > 0)
		) {
			state.velocities[i * 2 + 1] *= -1; // Reverse y velocity
		}

		// search tree
		const bbox = {
			minX: state.positions[i * 2] - dotRadius + 1.0,
			minY: state.positions[i * 2 + 1] - dotRadius + 1.0,
			maxX: state.positions[i * 2] + dotRadius + 1.0,
			maxY: state.positions[i * 2 + 1] + dotRadius + 1.0,
		};
		const collisions = tree.search(bbox);
		if (collisions.length === 0) {
			const item = {
				x: state.positions[i * 2],
				y: state.positions[i * 2 + 1],
				index: i,
				...bbox,
			};
			tree.insert(item);
		}
		let collision = collisions.pop(); // just handling one collision at a time for now. Will need to handle the edge case later
		// also note that weird things may happen with current setup around the walls
		// this loop handles the fact that the bounding box checks for square overlap
		if (!collision) {
			const vx = state.velocities[i * 2];
			const vy = state.velocities[i * 2 + 1];

			// Update position
			state.positions[i * 2] = x + vx * deltaTime;
			state.positions[i * 2 + 1] = y + vy * deltaTime;

			continue;
		}

		while (
			positionsArrayDistSquared(state.positions, i, collision.index) >
			state.dotSize ** 2 // same radius so we can just use diameter for collision detection
		) {
			collision = collisions.pop();
			if (collision === undefined) {
				collision = tree.search(bbox)[0];
				console.log(
					state.positions[i * 2],
					state.positions[i * 2 + 1],
					state.positions[collision.index * 2],
					state.positions[collision.index * 2 + 1]
				);
				collision = false;
				break;
			}
		}
		if (collision) {
			// get updated velocities after collision
			const [vx1, vy1, vx2, vy2] = processCollision(
				state.positions[i * 2],
				state.positions[i * 2 + 1],
				state.velocities[i * 2],
				state.velocities[i * 2 + 1],
				collision.x,
				collision.y,
				state.velocities[collision.index * 2],
				state.velocities[collision.index * 2 + 1]
			);
			// undo other particles movement before making checks
			state.positions[collision.index * 2] -=
				state.velocities[collision.index * 2] * deltaTime;
			state.positions[collision.index * 2 + 1] -=
				state.velocities[collision.index * 2 + 1] * deltaTime;
			// update
			state.velocities[i * 2] = vx1;
			state.velocities[i * 2 + 1] = vy1;
			state.velocities[collision.index * 2] = vx2;
			state.velocities[collision.index * 2 + 1] = vy2;
			// apply new velocities to other particle
			state.positions[collision.index * 2] +=
				state.velocities[collision.index * 2] * deltaTime;
			state.positions[collision.index * 2 + 1] +=
				state.velocities[collision.index * 2 + 1] * deltaTime;
		}

		const vx = state.velocities[i * 2];
		const vy = state.velocities[i * 2 + 1];

		// Update position
		state.positions[i * 2] = x + vx * deltaTime;
		state.positions[i * 2 + 1] = y + vy * deltaTime;
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
	const xlineBetween = x2 - x1;
	const ylineBetween = y2 - y1;
	const phi = Math.atan2(xlineBetween, ylineBetween);
	// first check to make sure that the balls are moving towards each other
	// if they're not return early so the balls don't get stuck
	const dotProduct = v1x * xlineBetween + v1y * ylineBetween;
	if (dotProduct >= 0) {
		return [v1x, v1y, v2x, v2y];
	}
	const dotProduct2 = v2x * xlineBetween + v2y * ylineBetween;
	if (dotProduct2 <= 0) {
		return [v1x, v1y, v2x, v2y];
	}
	// convert to new coordinate system and swap y components
	const v2xPrimeSwap = v1x * Math.cos(phi) - v1y * Math.sin(phi); // v1Prime x component
	const v1yPrimeSwap = v1x * Math.sin(phi) + v1y * Math.cos(phi); // v1Prime y component
	const v1xPrimeSwap = v2x * Math.cos(phi) - v2y * Math.sin(phi); // v2Prime x component
	const v2yPrimeSwap = v2x * Math.sin(phi) + v2y * Math.cos(phi); // v2Prime y component
	// now convert back to og coordinate system
	const v1xSwap = v1xPrimeSwap * Math.cos(phi) + v1yPrimeSwap * Math.sin(phi);
	const v1ySwap =
		-1 * v1xPrimeSwap * Math.sin(phi) + v1yPrimeSwap * Math.cos(phi);
	const v2xSwap = v2xPrimeSwap * Math.cos(phi) + v2yPrimeSwap * Math.sin(phi);
	const v2ySwap =
		-1 * v2xPrimeSwap * Math.sin(phi) + v2yPrimeSwap * Math.cos(phi);
	return [v1xSwap, v1ySwap, v2xSwap, v2ySwap];
}
