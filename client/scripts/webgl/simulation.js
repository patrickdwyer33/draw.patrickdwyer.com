import initGLCanvas from "/scripts/webgl/init.js";
import initBuffers from "/scripts/webgl/buffers.js";
import initShaderProgram from "/scripts/webgl/shaders.js";
import createAnimation from "/scripts/webgl/animate.js";
import RBush from "rbush";

async function importShaderSource(fileName) {
	return await fetch(fileName).then((response) => response.text());
}

const generateDefaultColors = (n) => {
	const colors = [];
	for (let i = 0; i < n - 1; i++) {
		colors.push(0.6, 0.2, 0.8, 1.0);
	}
	const yellow = [1.0, 1.0, 0.0, 1.0];
	colors.push(...yellow);
	return colors;
};

const getDrawingInfo = async (width, height, dotSize) => {
	const urlParams = new URLSearchParams(window.location.search);
	const title = urlParams.get("title");
	if (!title) {
		const n = 1000;
		return {
			title: "Random Drawing",
			data: {
				positions: generateRandomPositions(n, width, height, dotSize),
				colors: generateDefaultColors(n),
			},
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		};
	}
	const url = `${window.location.origin}/api/drawings/${title}`;
	const response = await fetch(url);
	const data = await response.json();

	return data;
};

export default async function runSimulation(canvasId, clearColor) {
	const gl = initGLCanvas(canvasId, clearColor);
	const vertexShaderSource = await importShaderSource(
		"/shaders/vertex/basic.vert"
	);
	const fragmentShaderSource = await importShaderSource(
		"/shaders/fragment/basic.frag"
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
			vertexColor: gl.getAttribLocation(shaderProgram, "aColor"),
		},
		uniformLocations: {
			uResolution: gl.getUniformLocation(shaderProgram, "uResolution"),
			uEdgeSize: gl.getUniformLocation(shaderProgram, "uEdgeSize"),
			dotSize: gl.getUniformLocation(shaderProgram, "dotSize"),
		},
	};

	const edgeSize = 1.0;
	const dotSize = 4.0;

	const drawingInfo = await getDrawingInfo(
		gl.canvas.width,
		gl.canvas.height,
		dotSize
	);

	const drawingData = drawingInfo.data;

	const finalPositions = drawingData.positions;
	// Scale positions from normalized [0,1] range to actual canvas dimensions
	for (let i = 0; i < finalPositions.length; i += 2) {
		finalPositions[i] = finalPositions[i] * gl.canvas.width;
		finalPositions[i + 1] = finalPositions[i + 1] * gl.canvas.height;
	}
	console.log(finalPositions);
	let n = finalPositions.length / 2; // Positions are flat and x,y

	let colors = drawingData.colors;
	// Ensure colors array has 4 components (RGBA) for each position
	if (colors.length === n * 3) {
		const rgbaColors = [];
		for (let i = 0; i < colors.length; i += 3) {
			rgbaColors.push(colors[i], colors[i + 1], colors[i + 2], 1.0);
		}
		colors = rgbaColors;
	} else if (colors.length !== n * 4) {
		console.warn(
			"Colors array has unexpected length. Expected RGB or RGBA format."
		);
	}

	const buffers = initBuffers(gl, n, colors);

	const state = {
		positions: finalPositions,
		velocities: generateRandomVelocities(n),
		continueAnimation: true,
		edgeSize,
		dotSize,
	};

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

function generateRandomPositions(n, width, height, dotDiameter) {
	const dotRadius = dotDiameter / 2;
	const positions = [];
	const tree = new RBush(16);
	let failedAttempts = 0;
	const maxFailedAttempts = 1000;
	for (let i = 0; i - failedAttempts < n; i++) {
		if (failedAttempts > maxFailedAttempts) {
			throw new Error(
				"Failed to generate random positions, too many failed attempts"
			);
		}
		const x = Math.random() * (width - dotDiameter) + dotRadius;
		const y = Math.random() * (height - dotDiameter) + dotRadius;
		const bbox = {
			minX: x - dotRadius,
			minY: y - dotRadius,
			maxX: x + dotRadius,
			maxY: y + dotRadius,
		};
		const collision = tree.collides(bbox); // note that this is a collision check for a square, not a circle. Might want to change this later
		if (collision) {
			failedAttempts++;
			continue;
		}
		positions.push(x, y);
		tree.insert(bbox);
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

	gl.useProgram(programInfo.program);

	setResolutionUniform(gl, programInfo, state);

	const offset = 0;
	const vertexCount = n;
	gl.drawArrays(gl.POINTS, offset, vertexCount);
}

function setPositionAttribute(gl, buffers, programInfo) {
	let numComponents = 2;
	let type = gl.FLOAT;
	let normalize = false;
	let stride = 0;
	let offset = 0;
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
	numComponents = 4;
	type = gl.FLOAT;
	normalize = false;
	stride = 0;
	offset = 0;
	gl.bindBuffer(gl.ARRAY_BUFFER, buffers.colors);
	gl.vertexAttribPointer(
		programInfo.attributeLocations.vertexColor,
		numComponents,
		type,
		normalize,
		stride,
		offset
	);
	gl.enableVertexAttribArray(programInfo.attributeLocations.vertexColor);
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

	for (let i = 0; i < n; i++) {
		const xIndexOffset = i * 2;
		const yIndexOffset = xIndexOffset + 1;
		const x = state.positions[xIndexOffset];
		const y = state.positions[yIndexOffset];
		const vx = state.velocities[xIndexOffset];
		const vy = state.velocities[yIndexOffset];

		if (
			(x <= 0 + dotRadius && vx < 0) ||
			(x >= gl.canvas.width - dotRadius && vx > 0)
		) {
			state.velocities[xIndexOffset] *= -1;
		}
		if (
			(y <= 0 + dotRadius && vy < 0) ||
			(y >= gl.canvas.height - dotRadius && vy > 0)
		) {
			state.velocities[yIndexOffset] *= -1;
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
		let collision = collisions.pop();
		// Just handling one collision at a time for now. Will need to handle the edge case later
		// Also note that weird things may happen with current setup around the walls
		// This loop handles the fact that the bounding box checks for square overlap
		if (!collision) continue;
		while (
			collision.index == i ||
			positionsArrayDistSquared(state.positions, i, collision.index) >
				state.dotSize ** 2 // Same radius so we can just use diameter for collision detection
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
		state.velocities[xIndexOffset] = vx1;
		state.velocities[yIndexOffset] = vy1;
		state.velocities[xIndexOffsetCollision] = vx2;
		state.velocities[yIndexOffsetCollision] = vy2;
	}

	for (let i = 0; i < n; i++) {
		const xIndexOffset = i * 2;
		const yIndexOffset = xIndexOffset + 1;
		state.positions[xIndexOffset] +=
			state.velocities[xIndexOffset] * deltaTime;
		state.positions[yIndexOffset] +=
			state.velocities[yIndexOffset] * deltaTime;
	}

	gl.bindBuffer(gl.ARRAY_BUFFER, buffers.positions);
	gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(state.positions));

	drawScene(gl, programInfo, buffers, clearColor, n, state);

	return state;
}

function processCollision(x1, y1, v1x, v1y, x2, y2, v2x, v2y) {
	// Calculate line between
	// Calculate angle between og x axis and line between
	// Find coordinates of v1 and v2 in new coordinate system
	// Swap x components
	// Convert back to original coordinate system
	// Return new velocities
	const xlineBetween = x1 - x2;
	const ylineBetween = y1 - y2;
	const phi = Math.atan2(ylineBetween, xlineBetween);
	// First check to make sure that the balls are moving towards each other
	// If they're not return early so the balls don't get stuck
	const dotProductv1 = v1x * xlineBetween + v1y * ylineBetween;
	const dotProductv2 = v2x * xlineBetween + v2y * ylineBetween;
	// p1 heading toward p2 if v1 in opposite direction of lineBetween
	// p2 heading towards p1 if v2 in direction of lineBetween
	if (dotProductv1 > 0 && dotProductv2 < 0) {
		return [v1x, v1y, v2x, v2y];
	}
	// Convert to new coordinate system and swap components
	const v1xPrime = v1x * Math.cos(phi) + v1y * Math.sin(phi); // v1 x in rotated frame
	const v1yPrime = -v1x * Math.sin(phi) + v1y * Math.cos(phi); // v1 y in rotated frame
	const v2xPrime = v2x * Math.cos(phi) + v2y * Math.sin(phi); // v2 x in rotated frame
	const v2yPrime = -v2x * Math.sin(phi) + v2y * Math.cos(phi); // v2 y in rotated frame

	// Swap x components (parallel to collision line)
	const v1xPrimeSwapped = v2xPrime;
	const v2xPrimeSwapped = v1xPrime;

	// Convert back to original coordinate system
	const v1xSwap = v1xPrimeSwapped * Math.cos(phi) - v1yPrime * Math.sin(phi);
	const v1ySwap = v1xPrimeSwapped * Math.sin(phi) + v1yPrime * Math.cos(phi);
	const v2xSwap = v2xPrimeSwapped * Math.cos(phi) - v2yPrime * Math.sin(phi);
	const v2ySwap = v2xPrimeSwapped * Math.sin(phi) + v2yPrime * Math.cos(phi);
	return [v1xSwap, v1ySwap, v2xSwap, v2ySwap];
}
