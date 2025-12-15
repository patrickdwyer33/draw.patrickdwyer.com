import initGLCanvas from "/scripts/webgl/init.js";
import initBuffers from "/scripts/webgl/buffers.js";
import initShaderProgram from "/scripts/webgl/shaders.js";
import createAnimation from "/scripts/webgl/animate.js";
import RBush from "rbush";

const MAX_BALLS = 5000;
const VELOCITY_SCALE = 200.0;

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

const downSampleDrawingData = (finalPositions, colors, maxPixels) => {
	const currentPixels = finalPositions.length / 2;

	if (currentPixels <= maxPixels) {
		return {
			positions: finalPositions,
			colors: colors,
			samplingRatio: 1.0,
			originalPixelCount: currentPixels,
			sampledPixelCount: currentPixels,
		};
	}

	// Calculate sampling interval (every Nth pixel)
	const samplingInterval = Math.ceil(currentPixels / maxPixels);

	const sampledPositions = [];
	const sampledColors = [];

	for (let i = 0; i < currentPixels; i++) {
		if (i % samplingInterval === 0) {
			// Add position (x, y)
			sampledPositions.push(
				finalPositions[i * 2],
				finalPositions[i * 2 + 1]
			);

			// Add color (r, g, b, a)
			sampledColors.push(
				colors[i * 4],
				colors[i * 4 + 1],
				colors[i * 4 + 2],
				colors[i * 4 + 3]
			);
		}
	}

	console.log(
		`Down-sampled from ${currentPixels} to ${
			sampledPositions.length / 2
		} pixels (every ${samplingInterval}th pixel)`
	);

	return {
		positions: sampledPositions,
		colors: sampledColors,
		samplingRatio: samplingInterval,
		originalPixelCount: currentPixels,
		sampledPixelCount: sampledPositions.length / 2,
	};
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
	const dotSize = 4.0; // diameter
	const numBallsPerDrawnPixel = 1;
	const finalDistanceThresholdSquared = (edgeSize + dotSize) ** 2 * 2; // This is the squared distance between a dots current position and final position that will be considered a "collision" (thus stopping the ball and snapping it to the final position)

	const drawingInfo = await getDrawingInfo(
		gl.canvas.width,
		gl.canvas.height,
		dotSize
	);

	// Update page title with drawing name
	const titleElement = document.getElementById("drawing-title");
	if (titleElement && drawingInfo.title) {
		titleElement.textContent = drawingInfo.title;
	}

	const drawingData = drawingInfo.data;

	const finalPositions = drawingData.positions;
	// Scale positions from normalized [0,1] range to actual canvas dimensions
	for (let i = 0; i < finalPositions.length; i += 2) {
		finalPositions[i] = finalPositions[i] * gl.canvas.width;
		finalPositions[i + 1] = finalPositions[i + 1] * gl.canvas.height;
	}
	let n = finalPositions.length / 2; // Positions are flat and x,y

	let colors = drawingData.colors;
	// Ensure colors array has 4 components (RGBA) for each position
	// Also normalize from 0-255 range to 0.0-1.0 range for WebGL
	if (colors.length === n * 3) {
		const rgbaColors = [];
		for (let i = 0; i < colors.length; i += 3) {
			rgbaColors.push(
				colors[i] / 255,
				colors[i + 1] / 255,
				colors[i + 2] / 255,
				1.0
			);
		}
		colors = rgbaColors;
	} else if (colors.length !== n * 4) {
		console.warn(
			"Colors array has unexpected length. Expected RGB or RGBA format."
		);
	}

	// Apply down-sampling if needed BEFORE calculating numBalls
	const downSampleResult = downSampleDrawingData(
		finalPositions,
		colors,
		MAX_BALLS / numBallsPerDrawnPixel
	);

	// Update references to use sampled data
	const sampledFinalPositions = downSampleResult.positions;
	const sampledColors = downSampleResult.colors;
	n = downSampleResult.sampledPixelCount;

	// Log if down-sampling occurred
	if (downSampleResult.samplingRatio > 1) {
		console.log(
			`Drawing down-sampled: ${downSampleResult.originalPixelCount} → ${downSampleResult.sampledPixelCount} pixels`
		);
	}

	const numBalls = n * numBallsPerDrawnPixel;

	console.log(
		`Initializing simulation with ${numBalls} balls for ${n} target pixels`
	);

	// Create expanded colors array for all balls using sampled colors
	const expandedColors = [];
	for (let i = 0; i < n; i++) {
		const colorIndex = i * 4;
		for (let j = 0; j < numBallsPerDrawnPixel; j++) {
			expandedColors.push(
				sampledColors[colorIndex],
				sampledColors[colorIndex + 1],
				sampledColors[colorIndex + 2],
				sampledColors[colorIndex + 3]
			);
		}
	}

	// Generate random positions BEFORE allocating buffers
	// This validates we can actually place this many balls
	let initialPositions;
	try {
		initialPositions = generateRandomPositions(
			numBalls,
			gl.canvas.width,
			gl.canvas.height,
			dotSize
		);
	} catch (error) {
		// This should rarely happen now with down-sampling, but handle gracefully
		console.error(
			"Failed to generate initial positions even after down-sampling:",
			error
		);
		throw new Error(
			`Unable to initialize simulation with ${numBalls} balls. The drawing may be too dense.`
		);
	}

	// Initialize buffers (NOW safe because we validated placement)
	const buffers = initBuffers(gl, numBalls, expandedColors);

	// Create finalPositionsMap using sampled positions
	const finalPositionsMap = new Map(
		Array.from({ length: numBalls }, (_, i) => [
			i,
			[
				sampledFinalPositions[
					Math.floor(i / numBallsPerDrawnPixel) * 2
				],
				sampledFinalPositions[
					Math.floor(i / numBallsPerDrawnPixel) * 2 + 1
				],
			],
		])
	);

	// Generate random timeouts between 30-120 seconds for each ball
	const ballTimeouts = new Array(numBalls);
	const ballSeekingStartTime = new Array(numBalls);
	const ballStuck = new Array(numBalls);
	const ballErased = new Array(numBalls);

	for (let i = 0; i < numBalls; i++) {
		ballTimeouts[i] = 30 + Math.random() * 90; // 30-120 seconds
		ballSeekingStartTime[i] = -1; // -1 means not seeking yet
		ballStuck[i] = false;
		ballErased[i] = false;
	}

	// Create state object using pre-generated initialPositions
	const state = {
		positions: initialPositions,
		finalPositionsMap,
		velocities: generateRandomVelocities(numBalls),
		continueAnimation: true,
		edgeSize,
		dotSize,
		finalDistanceThresholdSquared,
		ballTimeouts,
		ballSeekingStartTime,
		ballStuck,
		ballErased,
		startTime: -1, // Will be set on first frame
		elapsedTime: 0,
		shouldShakeItUp: false, // Flag to trigger shake-up from animation loop
	};

	// Function to trigger shake-up on next animation frame
	const shakeItUp = () => {
		state.shouldShakeItUp = true;
	};

	createAnimation(
		updateAnimationState,
		gl,
		programInfo,
		buffers,
		clearColor,
		numBalls,
		state
	);

	// Return the shakeItUp function so it can be called from outside
	return { shakeItUp };
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
				`Failed to place ${n} balls in the available space. ` +
					`This should not happen after down-sampling. ` +
					`Current failed attempts: ${failedAttempts}. ` +
					`Consider reducing numBallsPerDrawnPixel or increasing canvas size.`
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
			VELOCITY_SCALE *
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

function distanceToLineSegment(x1, y1, x2, y2, px, py) {
	// Calculate the squared length of the line segment
	const lineLengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2;

	// If the line segment is actually a point, return distance to that point
	if (lineLengthSquared === 0) {
		return (px - x1) ** 2 + (py - y1) ** 2;
	}

	// Calculate the projection of the point onto the line
	const t = Math.max(
		0,
		Math.min(
			1,
			((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lineLengthSquared
		)
	);

	// Calculate the closest point on the line segment
	const closestX = x1 + t * (x2 - x1);
	const closestY = y1 + t * (y2 - y1);

	// Return squared distance to the closest point
	return (px - closestX) ** 2 + (py - closestY) ** 2;
}

function updateAnimationState(
	deltaTime,
	now,
	gl,
	programInfo,
	buffers,
	clearColor,
	n,
	state
) {
	// Check if we should shake it up
	if (state.shouldShakeItUp) {
		console.log("Shaking it up!");

		const dotRadius = state.dotSize / 2;
		const tree = new RBush(16);

		// First, add stuck and erased balls to the collision tree
		// so new random positions don't collide with them
		for (let i = 0; i < n; i++) {
			if (state.ballStuck[i] || state.ballErased[i]) {
				const x = state.positions[i * 2];
				const y = state.positions[i * 2 + 1];
				const bbox = {
					minX: x - dotRadius,
					minY: y - dotRadius,
					maxX: x + dotRadius,
					maxY: y + dotRadius,
				};
				tree.insert(bbox);
			}
		}

		// Generate new random positions and velocities for non-stuck, non-erased balls
		let failedAttempts = 0;
		const maxFailedAttempts = 1000;

		for (let i = 0; i < n; i++) {
			// Skip stuck and erased balls
			if (state.ballStuck[i] || state.ballErased[i]) {
				continue;
			}

			// Reset timing state for this ball
			state.ballSeekingStartTime[i] = -1;
			// Set timeout relative to current elapsed time, not absolute
			state.ballTimeouts[i] =
				state.elapsedTime + (30 + Math.random() * 90);

			// Generate new random position without collision
			let placed = false;
			while (!placed && failedAttempts < maxFailedAttempts) {
				const x =
					Math.random() * (gl.canvas.width - state.dotSize) +
					dotRadius;
				const y =
					Math.random() * (gl.canvas.height - state.dotSize) +
					dotRadius;
				const bbox = {
					minX: x - dotRadius,
					minY: y - dotRadius,
					maxX: x + dotRadius,
					maxY: y + dotRadius,
				};

				if (!tree.collides(bbox)) {
					// Place the ball
					state.positions[i * 2] = x;
					state.positions[i * 2 + 1] = y;
					tree.insert(bbox);
					placed = true;

					// Generate new random velocity
					state.velocities[i * 2] =
						Math.max(Math.random(), 0.4) *
						VELOCITY_SCALE *
						(Math.random() < 0.5 ? -1.0 : 1.0);
					state.velocities[i * 2 + 1] =
						Math.max(Math.random(), 0.4) *
						VELOCITY_SCALE *
						(Math.random() < 0.5 ? -1.0 : 1.0);
				} else {
					failedAttempts++;
				}
			}

			if (!placed) {
				console.warn(
					`Failed to place ball ${i} after ${maxFailedAttempts} attempts`
				);
			}
		}

		console.log(
			`Shook up ${n} balls with ${failedAttempts} failed placement attempts`
		);

		// Reset the flag
		state.shouldShakeItUp = false;
	}

	// Initialize start time on first frame
	if (state.startTime === -1) {
		state.startTime = now;
	}
	state.elapsedTime = now - state.startTime;

	const dotRadius = state.dotSize / 2;

	const bboxes = [];

	for (let i = 0; i < n; i++) {
		// Skip erased and stuck balls for collision detection
		if (state.ballErased[i] || state.ballStuck[i]) {
			bboxes.push(null);
			continue;
		}

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
	tree.load(bboxes.filter((bbox) => bbox !== null));
	const foundCollisionIds = new Set();
	for (let i = 0; i < n; i++) {
		if (foundCollisionIds.has(i)) {
			continue;
		}
		const bbox = bboxes[i];
		if (!bbox) continue; // Skip erased balls
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

	// Handle time-based behavior for balls
	for (let i = 0; i < n; i++) {
		// Skip if ball is already stuck or erased
		if (state.ballStuck[i] || state.ballErased[i]) continue;

		const xIndexOffset = i * 2;
		const yIndexOffset = xIndexOffset + 1;
		const finalPosition = state.finalPositionsMap.get(i);

		// Check if timeout has passed and ball should start seeking
		if (
			state.elapsedTime > state.ballTimeouts[i] &&
			state.ballSeekingStartTime[i] === -1
		) {
			// Start seeking - change velocity to point towards final position
			state.ballSeekingStartTime[i] = state.elapsedTime;

			const dx = finalPosition[0] - state.positions[xIndexOffset];
			const dy = finalPosition[1] - state.positions[yIndexOffset];
			const distance = Math.sqrt(dx * dx + dy * dy);

			// Set velocity to move towards final position at a reasonable speed
			const seekSpeed = 100; // pixels per second
			if (distance > 0) {
				state.velocities[xIndexOffset] = (dx / distance) * seekSpeed;
				state.velocities[yIndexOffset] = (dy / distance) * seekSpeed;
			}
		}

		// Check if ball has been seeking for too long (30 seconds) and should be erased
		if (
			state.ballSeekingStartTime[i] !== -1 &&
			state.elapsedTime - state.ballSeekingStartTime[i] > 30
		) {
			state.ballErased[i] = true;
			// Move ball off-screen
			state.positions[xIndexOffset] = -1000;
			state.positions[yIndexOffset] = -1000;
			state.velocities[xIndexOffset] = 0;
			state.velocities[yIndexOffset] = 0;
		}
	}

	for (let i = 0; i < n; i++) {
		// Skip erased balls
		if (state.ballErased[i]) continue;

		const xIndexOffset = i * 2;
		const yIndexOffset = xIndexOffset + 1;
		const finalPosition = state.finalPositionsMap.get(i);

		// Calculate next position
		const nextX =
			state.positions[xIndexOffset] +
			state.velocities[xIndexOffset] * deltaTime;
		const nextY =
			state.positions[yIndexOffset] +
			state.velocities[yIndexOffset] * deltaTime;

		// Calculate minimum distance between the line segment and final position
		const distSquared = distanceToLineSegment(
			state.positions[xIndexOffset],
			state.positions[yIndexOffset],
			nextX,
			nextY,
			finalPosition[0],
			finalPosition[1]
		);

		if (distSquared > state.finalDistanceThresholdSquared) {
			state.positions[xIndexOffset] = nextX;
			state.positions[yIndexOffset] = nextY;
		} else {
			state.positions[xIndexOffset] = finalPosition[0];
			state.positions[yIndexOffset] = finalPosition[1];
			state.velocities[xIndexOffset] = 0;
			state.velocities[yIndexOffset] = 0;
			state.ballStuck[i] = true; // Mark as stuck
		}
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
