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
	let n = 100; //temp
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
		dotDiameter: 2.0 * Math.sqrt(dotSize / Math.PI) + edgeSize + 1.0,
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
		const x = Math.floor(Math.random() * (width + 1));
		const y = Math.floor(Math.random() * (height + 1));
		positions.push(x, y);
	}
	return positions;
}

function generateRandomVelocities(n) {
	const velocities = [];
	for (let i = 0; i < n * 2; i++) {
		let velocity =
			Math.max(Math.random(), 0.4) *
			100.0 *
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

function setResolutionUniform(gl, programInfo, state) {
	gl.uniform2f(
		programInfo.uniformLocations.uResolution,
		gl.canvas.width,
		gl.canvas.height
	);
	gl.uniform1f(programInfo.uniformLocations.uEdgeSize, state.edgeSize);
	gl.uniform1f(programInfo.uniformLocations.dotSize, state.dotSize);
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
	const dotRadius = state.dotDiameter / 2;

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
			minX: state.positions[i * 2] - dotRadius,
			minY: state.positions[i * 2 + 1] - dotRadius,
			maxX: state.positions[i * 2] + dotRadius,
			maxY: state.positions[i * 2 + 1] + dotRadius,
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
		while (
			collision &&
			Math.sqrt(
				(state.positions[i * 2] -
					state.positions[collision.index * 2]) **
					2 +
					(state.positions[i * 2 + 1] -
						state.positions[collision.index * 2 + 1]) **
						2
			) > state.dotDiameter
		) {
			collision = collisions.pop();
			if (collision === undefined) {
				collision = false;
				break;
			}
		}
		if (collision) {
			const [vx1, vy1, vx2, vy2] = processCollision(
				state.positions[i * 2],
				state.positions[i * 2 + 1],
				state.velocities[i * 2],
				state.velocities[i * 2 + 1],
				collision.x,
				collision.y,
				state.velocities[collision.index * 2],
				state.velocities[collision.index * 2 + 1],
				deltaTime
			);
			// undo other particles movement before applying new velocities
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
	gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Int16Array(state.positions));

	// Draw the updated scene
	drawScene(gl, programInfo, buffers, clearColor, n, state);

	return state;
}

function processCollision(x1, y1, v1x, v1y, x2, y2, v2x, v2y, deltaTime) {
	// calculate line between
	// calculate angle between og x axis and line between
	// find coordinates of v1 and v2 in new coordinate system
	// swap x components
	// convert back to original coordinate system
	// return new velocities
	const lineBetween = [x2 - x1, y2 - y1];
	const phi = Math.atan2(lineBetween[1], lineBetween[0]);
	const v1 = [v1x, v1y];
	const v2 = [v2x, v2y];
	// first check to make sure that the balls are moving towards each other
	// if they're not return early so the balls don't get stuck
	const dotProduct = v1[0] * lineBetween[0] + v1[1] * lineBetween[1];
	if (dotProduct < 0) {
		return [v1[0], v1[1], v2[0], v2[1]];
	}
	const v1Prime = [
		v1[0] * Math.cos(phi) - v1[1] * Math.sin(phi),
		v1[0] * Math.sin(phi) + v1[1] * Math.cos(phi),
	];
	const v2Prime = [
		v2[0] * Math.cos(phi) - v2[1] * Math.sin(phi),
		v2[0] * Math.sin(phi) + v2[1] * Math.cos(phi),
	];
	const v1PrimeSwap = [v2Prime[0], v1Prime[1]];
	const v2PrimeSwap = [v1Prime[0], v2Prime[1]];
	const v1Swap = [
		v1PrimeSwap[0] * Math.cos(phi) + v1PrimeSwap[1] * Math.sin(phi),
		-1 * v1PrimeSwap[0] * Math.sin(phi) + v1PrimeSwap[1] * Math.cos(phi),
	];
	const v2Swap = [
		v2PrimeSwap[0] * Math.cos(phi) + v2PrimeSwap[1] * Math.sin(phi),
		-1 * v2PrimeSwap[0] * Math.sin(phi) + v2PrimeSwap[1] * Math.cos(phi),
	];
	return [v1Swap[0], v1Swap[1], v2Swap[0], v2Swap[1]];
}
