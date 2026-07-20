import initGLCanvas from "/scripts/webgl/init.js";
import initBuffers from "/scripts/webgl/buffers.js";
import initShaderProgram from "/scripts/webgl/shaders.js";
import createAnimation from "/scripts/webgl/animate.js";
import RBush from "rbush";
import { decodeDrawing } from "/shared/codec.js";
import { objectsBase } from "/scripts/utils/objects-host.js";
// GLSL inlined at build time via Vite's ?raw suffix — the shader text becomes a
// string in the JS bundle, so there is NO runtime fetch to miss in production.
// (The old fetch("/shaders/...") worked only in dev, where Vite served the file
// from source; the build never bundled it because a runtime fetch is invisible
// to the bundler.)
import vertexShaderSource from "/shaders/vertex/basic.vert?raw";
import fragmentShaderSource from "/shaders/fragment/basic.frag?raw";

const MAX_BALLS = 4000;
const VELOCITY_SCALE = 200.0;

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
	const randomDrawing = () => ({
		title: "Random Drawing",
		data: {
			positions: generateRandomPositions(1000, width, height, dotSize),
			colors: generateDefaultColors(1000),
		},
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	});

	const urlParams = new URLSearchParams(window.location.search);
	const title = urlParams.get("title");
	if (!title) {
		return randomDrawing();
	}

	const base = objectsBase() || window.location.origin;
	const url = `${base}/draw/public/drawings/${encodeURIComponent(title)}.bin`;
	const response = await fetch(url);
	if (!response.ok) {
		// Fall back to the random drawing if the title is missing.
		return randomDrawing();
	}
	const buf = await response.arrayBuffer();
	const { positions, colors } = decodeDrawing(buf);
	const lastModified = response.headers.get("last-modified");
	return {
		title,
		data: { positions, colors },
		created_at: lastModified || new Date().toISOString(),
		updated_at: lastModified || new Date().toISOString(),
	};
};

export default async function runSimulation(canvasId, clearColor) {
	const gl = initGLCanvas(canvasId, clearColor);
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
	if (titleElement) {
		// Use display_title if available, otherwise fall back to title
		titleElement.textContent = drawingInfo.display_title || drawingInfo.title;
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

	// Each ball's target position, flat and index-parallel to `positions` (ball i is
	// at [i*2], [i*2+1]). This was a Map<number, [x, y]>, which cost a hash lookup
	// plus an array dereference for every ball on every frame in the seeking loops —
	// a typed array turns both into a direct offset read.
	const ballFinalPositions = new Float32Array(numBalls * 2);
	for (let i = 0; i < numBalls; i++) {
		const src = Math.floor(i / numBallsPerDrawnPixel) * 2;
		ballFinalPositions[i * 2] = sampledFinalPositions[src];
		ballFinalPositions[i * 2 + 1] = sampledFinalPositions[src + 1];
	}

	// Per-ball state, all typed and index-parallel. Every one of these is touched
	// for every ball on every frame in updateAnimationState's loops, so they get the
	// same treatment as `positions`. The two flags are Uint8Array (0/1) rather than
	// arrays of booleans; truthiness tests work unchanged.
	const ballTimeouts = new Float32Array(numBalls);
	const ballSeekingStartTime = new Float32Array(numBalls);
	const ballStuck = new Uint8Array(numBalls);
	const ballErased = new Uint8Array(numBalls);

	for (let i = 0; i < numBalls; i++) {
		ballTimeouts[i] = 30 + Math.random() * 90; // 30-120 seconds
		ballSeekingStartTime[i] = -1; // -1 means not seeking yet
	}

	// Collision grid geometry. Cell == the collision diameter: the smallest size for
	// which a ball's only possible partners still live in its own cell or the 8
	// around it. Sizing cells by AVERAGE density instead (~1 ball per cell) profiled
	// terribly — balls converge into the drawing's shape, so local density runs ~10x
	// the average and each query ended up scanning hundreds of candidates exactly
	// when the sim was busiest. At one diameter per cell, centres can't be closer
	// than a cell apart, so occupancy is bounded no matter how the balls clump.
	const gridCellSize = dotSize;
	const gridCols = Math.max(1, Math.ceil(gl.canvas.width / gridCellSize));
	const gridRows = Math.max(1, Math.ceil(gl.canvas.height / gridCellSize));
	const gridCellCount = gridCols * gridRows;

	// Create state object using pre-generated initialPositions.
	// positions is a Float32Array (fixed length = numBalls*2) so the per-frame GPU
	// upload can pass it straight to bufferSubData with no `new Float32Array(...)`
	// allocation each frame — less garbage, fewer GC pauses (and thus fewer stutters).
	// All the per-frame math uses index access (positions[i*2]), which works on a
	// typed array unchanged.
	const state = {
		positions: new Float32Array(initialPositions),
		finalPositions: ballFinalPositions,
		velocities: generateRandomVelocities(numBalls),
		continueAnimation: true,
		edgeSize,
		dotSize,
		finalDistanceThresholdSquared,
		ballTimeouts,
		ballSeekingStartTime,
		ballStuck,
		ballErased,
		elapsedTime: 0,
		shouldShakeItUp: false, // Flag to trigger shake-up from animation loop
		shouldRefillBalls: false, // Flag to trigger refill from animation loop
		// --- Collision broad-phase: a UNIFORM SPATIAL GRID, all typed arrays, reused.
		// Replaces a per-frame RBush rebuild. Profiling showed RBush's bulk-load
		// comparators (compareMinX/compareMinY), search(), and the GC from its node +
		// result-array allocations dominating the frame (Major GC was the single
		// largest self-time entry). A grid buckets balls in O(n) with a counting sort
		// and answers "who is near me?" by walking the 3x3 neighbouring cells —
		// no sorting, no tree nodes, and zero allocation per frame or per query.
		// Cell size == the collision diameter, so any true collision partner is in
		// the 3x3 block around a ball's cell.
		active: new Uint8Array(numBalls), // 1 = moving (participates in collisions)
		collided: new Uint8Array(numBalls), // 1 = already paired this frame
		gridCellSize,
		gridCols,
		gridRows,
		// Cells are intrusive singly-linked lists over the ball indices: gridHead[c]
		// is the first ball in cell c (-1 = empty) and gridNext[i] is the next ball in
		// i's cell. Rebuilding is a memset of gridHead plus an O(1) push per ball —
		// no prefix sum, which is what makes one-diameter cells affordable.
		gridHead: new Int32Array(gridCellCount),
		gridNext: new Int32Array(numBalls),
		gridCellOf: new Int32Array(numBalls), // cached cell index per ball
	};

	// Functions to trigger shake-up / refill on the next animation frame
	const shakeItUp = () => {
		state.shouldShakeItUp = true;
	};
	const refillBalls = () => {
		state.shouldRefillBalls = true;
	};

	// Bind the per-frame arguments once in a closure rather than handing them to
	// createAnimation to spread on every frame (see animate.js).
	createAnimation((deltaTime, now) =>
		updateAnimationState(
			deltaTime,
			now,
			gl,
			programInfo,
			buffers,
			clearColor,
			numBalls,
			state
		)
	);

	// Return the control functions so they can be called from outside
	return { shakeItUp, refillBalls };
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

// Float32Array, not a plain Array: this is read and written for every ball on
// every frame alongside `positions` (which is already typed). A plain Array of
// doubles costs more memory traffic per element and denies the JIT the fixed
// element type it can generate straight-line float loads for.
function generateRandomVelocities(n) {
	const velocities = new Float32Array(n * 2);
	for (let i = 0; i < n * 2; i++) {
		velocities[i] =
			Math.max(Math.random(), 0.4) *
			VELOCITY_SCALE *
			(Math.random() < 0.5 ? -1.0 : 1.0);
	}
	return velocities;
}

// Re-scatter non-stuck balls to fresh random positions/velocities/timeouts, avoiding
// collisions with balls that must stay put. Shared by SHAKE IT UP and REFILL BALLS.
//   reviveErased=false (shake): leave erased balls dead; reserve their spots too.
//   reviveErased=true  (refill): revive erased balls (they re-enter play), so only
//     stuck balls are reserved. Stuck balls are NEVER touched either way.
function rescatterBalls(state, gl, n, { reviveErased }) {
	const dotRadius = state.dotSize / 2;
	const tree = new RBush(16);

	// Reserve the positions of balls we must not overlap.
	for (let i = 0; i < n; i++) {
		if (state.ballStuck[i] || (state.ballErased[i] && !reviveErased)) {
			const x = state.positions[i * 2];
			const y = state.positions[i * 2 + 1];
			tree.insert({
				minX: x - dotRadius,
				minY: y - dotRadius,
				maxX: x + dotRadius,
				maxY: y + dotRadius,
			});
		}
	}

	let failedAttempts = 0;
	const maxFailedAttempts = 1000;
	let count = 0;

	for (let i = 0; i < n; i++) {
		if (state.ballStuck[i]) continue; // stuck balls stay frozen
		if (state.ballErased[i] && !reviveErased) continue; // leave dead unless reviving
		if (reviveErased) state.ballErased[i] = 0; // bring the ball back into play

		// Reset timing so the ball bounces, then seeks again after a fresh timeout.
		state.ballSeekingStartTime[i] = -1;
		state.ballTimeouts[i] = state.elapsedTime + (30 + Math.random() * 90);

		let placed = false;
		while (!placed && failedAttempts < maxFailedAttempts) {
			const x =
				Math.random() * (gl.canvas.width - state.dotSize) + dotRadius;
			const y =
				Math.random() * (gl.canvas.height - state.dotSize) + dotRadius;
			const bbox = {
				minX: x - dotRadius,
				minY: y - dotRadius,
				maxX: x + dotRadius,
				maxY: y + dotRadius,
			};
			if (!tree.collides(bbox)) {
				state.positions[i * 2] = x;
				state.positions[i * 2 + 1] = y;
				tree.insert(bbox);
				placed = true;
				count++;
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
	return { count, failedAttempts };
}

// Bucket the active (moving) balls into the uniform grid. Every array is
// preallocated on state and reused — zero allocation per frame. Clearing is a
// single typed-array fill (a memset) and each insert is an O(1) push onto the
// front of its cell's list, so the whole rebuild is O(cells + balls) with the
// cell term being raw memory bandwidth rather than a serial dependent add chain.
function buildCollisionGrid(state, n) {
	const {
		gridCols,
		gridRows,
		gridCellSize,
		gridHead,
		gridNext,
		gridCellOf,
		positions,
		active,
	} = state;

	gridHead.fill(-1);

	for (let i = 0; i < n; i++) {
		if (!active[i]) continue;
		let cx = (positions[i * 2] / gridCellSize) | 0;
		let cy = (positions[i * 2 + 1] / gridCellSize) | 0;
		if (cx < 0) cx = 0;
		else if (cx >= gridCols) cx = gridCols - 1;
		if (cy < 0) cy = 0;
		else if (cy >= gridRows) cy = gridRows - 1;
		const cell = cy * gridCols + cx;
		gridCellOf[i] = cell;
		gridNext[i] = gridHead[cell];
		gridHead[cell] = i;
	}
}

// Index of one ball colliding with ball i, or -1. Only scans the 3x3 cells around
// i, so cost tracks local density rather than total ball count — and it allocates
// nothing (the RBush search() this replaces returned a fresh array per ball).
function findCollidingNeighbor(state, i, dotSizeSquared) {
	const { gridCols, gridRows, gridHead, gridNext, gridCellOf, positions, collided } =
		state;
	const cell = gridCellOf[i];
	const cx = cell % gridCols;
	const cy = (cell / gridCols) | 0;
	const x = positions[i * 2];
	const y = positions[i * 2 + 1];

	for (let oy = -1; oy <= 1; oy++) {
		const ny = cy + oy;
		if (ny < 0 || ny >= gridRows) continue;
		for (let ox = -1; ox <= 1; ox++) {
			const nx = cx + ox;
			if (nx < 0 || nx >= gridCols) continue;
			const c = ny * gridCols + nx;
			for (let j = gridHead[c]; j !== -1; j = gridNext[j]) {
				if (j === i || collided[j]) continue;
				const dx = positions[j * 2] - x;
				const dy = positions[j * 2 + 1] - y;
				if (dx * dx + dy * dy <= dotSizeSquared) return j;
			}
		}
	}
	return -1;
}

function drawScene(gl, programInfo, buffers, clearColor, n, state) {
	// Indexed rather than spread: `...clearColor` builds an iterator on every frame.
	// One small allocation per frame is nothing next to what processCollision used to
	// do, but the goal here is a genuinely allocation-free frame, so it goes too.
	gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
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
	// SHAKE IT UP and REFILL BALLS both re-scatter non-stuck balls (see
	// rescatterBalls). REFILL additionally REVIVES erased balls, giving pixels that
	// failed to fill another chance to stick — so fidelity accumulates across refills.
	if (state.shouldShakeItUp) {
		const { count, failedAttempts } = rescatterBalls(state, gl, n, {
			reviveErased: false,
		});
		console.log(
			`Shook up ${count} balls with ${failedAttempts} failed placement attempts`
		);
		state.shouldShakeItUp = false;
	}
	if (state.shouldRefillBalls) {
		const { count, failedAttempts } = rescatterBalls(state, gl, n, {
			reviveErased: true,
		});
		console.log(
			`Refilled ${count} balls with ${failedAttempts} failed placement attempts`
		);
		state.shouldRefillBalls = false;
	}

	// Initialize start time on first frame
	// SIMULATION clock, not wall clock: accumulate the same clamped/smoothed step the
	// physics uses, so it only advances as fast as the sim actually runs.
	//
	// This was `now - startTime` (wall clock), which breaks badly across any pause.
	// Chrome stops calling rAF for an occluded window — switch to another app and
	// come back and the gap is seconds or minutes, with document.visibilityState
	// still reporting "visible". On the resume frame the wall clock had leapt
	// forward, so EVERY ball whose ballTimeouts entry fell inside that window began
	// seeking at once, and every ball whose 30s seek window had expired was erased
	// (teleported to -1000) at once. One frame, one enormous discontinuity — the
	// "big stutter / one frame jump" after a smooth stretch.
	//
	// deltaTime is already clamped to MAX_DELTA_TIME, so a pause of any length now
	// advances the simulation by at most one frame's worth, exactly like the
	// positions it drives.
	state.elapsedTime += deltaTime;

	const dotRadius = state.dotSize / 2;

	// Wall bounce + mark which balls participate in collisions this frame.
	const active = state.active;
	for (let i = 0; i < n; i++) {
		// Skip erased and stuck balls for collision detection
		if (state.ballErased[i] || state.ballStuck[i]) {
			active[i] = 0;
			continue;
		}
		active[i] = 1;

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

	}

	// Bucket the movers into the spatial grid, then pair each with at most one
	// neighbour. Same "one collision per ball per frame" behaviour as before.
	buildCollisionGrid(state, n);

	const collided = state.collided;
	collided.fill(0);
	const dotSizeSquared = state.dotSize ** 2; // same radius -> diameter is the threshold
	for (let i = 0; i < n; i++) {
		if (!active[i] || collided[i]) continue;
		const j = findCollidingNeighbor(state, i, dotSizeSquared);
		if (j < 0) continue;
		collided[j] = 1;
		processCollision(state.positions, state.velocities, i, j);
	}

	// Handle time-based behavior for balls
	for (let i = 0; i < n; i++) {
		// Skip if ball is already stuck or erased
		if (state.ballStuck[i] || state.ballErased[i]) continue;

		const xIndexOffset = i * 2;
		const yIndexOffset = xIndexOffset + 1;

		// Check if timeout has passed and ball should start seeking
		if (
			state.elapsedTime > state.ballTimeouts[i] &&
			state.ballSeekingStartTime[i] === -1
		) {
			// Start seeking - change velocity to point towards final position
			state.ballSeekingStartTime[i] = state.elapsedTime;

			const dx = state.finalPositions[xIndexOffset] - state.positions[xIndexOffset];
			const dy = state.finalPositions[yIndexOffset] - state.positions[yIndexOffset];
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
			state.ballErased[i] = 1;
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
			state.finalPositions[xIndexOffset],
			state.finalPositions[yIndexOffset]
		);

		if (distSquared > state.finalDistanceThresholdSquared) {
			state.positions[xIndexOffset] = nextX;
			state.positions[yIndexOffset] = nextY;
		} else {
			state.positions[xIndexOffset] = state.finalPositions[xIndexOffset];
			state.positions[yIndexOffset] = state.finalPositions[yIndexOffset];
			state.velocities[xIndexOffset] = 0;
			state.velocities[yIndexOffset] = 0;
			state.ballStuck[i] = 1; // Mark as stuck
		}
	}

	gl.bindBuffer(gl.ARRAY_BUFFER, buffers.positions);
	// state.positions is already a Float32Array — upload it directly (no per-frame alloc).
	gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.positions);

	drawScene(gl, programInfo, buffers, clearColor, n, state);

	return state;
}

// Resolve an elastic collision between balls i and j: rotate into the frame of the
// line between them, swap the components along that line, rotate back. Results are
// written straight back into `velocities`.
//
// This used to take 8 scalars and RETURN a fresh [v1x, v1y, v2x, v2y] array, which
// the caller destructured. That allocated one short-lived array per colliding pair
// per frame -- thousands a second. Most died in the young generation, but enough
// got promoted to trigger a major GC every so often, and that pause is the periodic
// one-frame hitch: smooth for ~10s, one big stutter, smooth again. Writing in place
// removes the last per-frame allocation in the simulation.
//
// Also hoists cos(phi)/sin(phi), which were each being recomputed four times.
function processCollision(positions, velocities, i, j) {
	const ix = i * 2;
	const iy = ix + 1;
	const jx = j * 2;
	const jy = jx + 1;

	const v1x = velocities[ix];
	const v1y = velocities[iy];
	const v2x = velocities[jx];
	const v2y = velocities[jy];

	const xlineBetween = positions[ix] - positions[jx];
	const ylineBetween = positions[iy] - positions[jy];

	// Only resolve if the balls are approaching. If they are already separating,
	// leave the velocities alone so they don't get stuck to each other.
	// p1 heads toward p2 if v1 opposes lineBetween; p2 heads toward p1 if v2 follows it.
	const dotProductv1 = v1x * xlineBetween + v1y * ylineBetween;
	const dotProductv2 = v2x * xlineBetween + v2y * ylineBetween;
	if (dotProductv1 > 0 && dotProductv2 < 0) return;

	const phi = Math.atan2(ylineBetween, xlineBetween);
	const cos = Math.cos(phi);
	const sin = Math.sin(phi);

	// Into the rotated frame
	const v1xPrime = v1x * cos + v1y * sin;
	const v1yPrime = -v1x * sin + v1y * cos;
	const v2xPrime = v2x * cos + v2y * sin;
	const v2yPrime = -v2x * sin + v2y * cos;

	// Swap the components parallel to the collision line
	const v1xPrimeSwapped = v2xPrime;
	const v2xPrimeSwapped = v1xPrime;

	// Back to the original frame
	velocities[ix] = v1xPrimeSwapped * cos - v1yPrime * sin;
	velocities[iy] = v1xPrimeSwapped * sin + v1yPrime * cos;
	velocities[jx] = v2xPrimeSwapped * cos - v2yPrime * sin;
	velocities[jy] = v2xPrimeSwapped * sin + v2yPrime * cos;
}
