import { pipe } from "src/scripts/utils/fp.js";

export const createDrawingCanvasContext = (canvas, devicePixelRatio) => {
	const ctx = canvas.getContext("2d");
	ctx.scale(devicePixelRatio, devicePixelRatio);
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	return ctx;
};

export const setDrawingStyle = (ctx, { color, lineWidth }) => {
	ctx.strokeStyle = color;
	ctx.lineWidth = lineWidth;
	return ctx;
};

const drawLine = (ctx, startX, startY, endX, endY) => {
	ctx.beginPath();
	ctx.moveTo(startX, startY);
	ctx.lineTo(endX, endY);
	ctx.stroke();
};

const clearCanvas = (ctx, width, height) => {
	ctx.clearRect(0, 0, width, height);
};

// Drawing state management
const createDrawingState = () => ({
	isDrawing: false,
	currentTool: "pencil",
	color: "#000000",
	lineWidth: 2,
	lastX: 0,
	lastY: 0,
	ctx: null,
});

// Event handlers
const createDrawingHandlers = (state, canvas) => ({
	handleMouseDown: (e) => {
		state.isDrawing = true;
		[state.lastX, state.lastY] = [e.offsetX, e.offsetY];
	},

	handleMouseMove: (e) => {
		if (!state.isDrawing) return;
		drawLine(state.ctx, state.lastX, state.lastY, e.offsetX, e.offsetY);
		[state.lastX, state.lastY] = [e.offsetX, e.offsetY];
	},

	handleMouseUp: () => {
		state.isDrawing = false;
	},

	handleToolChange: (e) => {
		state.ctx.strokeStyle =
			e.target?.id === "eraser" ? "#ffffff" : state.color;
	},

	handleClear: () => {
		clearCanvas(state.ctx, canvas.width, canvas.height);
	},

	handleColorChange: (e) => {
		state.color = e.target.value;
		if (state.currentTool !== "eraser") {
			state.ctx.strokeStyle = state.color;
		}
	},
});

// Canvas setup
export default function setupUserDrawing(document, canvasId) {
	const canvas = document.getElementById(canvasId);

	// Get the canvas's display size from CSS
	const displayWidth = canvas.clientWidth;
	const displayHeight = canvas.clientHeight;

	// Get the device pixel ratio to handle high DPI displays
	const dpr = window.devicePixelRatio || 1;

	// Set the canvas's internal dimensions to match its display size
	canvas.width = displayWidth * dpr;
	canvas.height = displayHeight * dpr;

	// Scale the context to handle high DPI displays
	const ctx = canvas.getContext("2d");

	const state = createDrawingState(canvas);
	state.ctx = pipe(createDrawingCanvasContext, (ctx) =>
		setDrawingStyle(ctx, { color: state.color, lineWidth: state.lineWidth })
	)(canvas, dpr);

	const handlers = createDrawingHandlers(state, canvas);

	// Event listeners
	canvas.addEventListener("mousedown", handlers.handleMouseDown);
	canvas.addEventListener("mousemove", handlers.handleMouseMove);
	canvas.addEventListener("mouseup", handlers.handleMouseUp);
	canvas.addEventListener("mouseout", handlers.handleMouseUp);

	// Set up toolbar events
	document
		.querySelectorAll("#pencil-button,#eraser-button")
		.forEach((ele) =>
			ele.addEventListener("click", handlers.handleToolChange)
		);
	document
		.querySelector("#clear-button")
		.addEventListener("click", handlers.handleClear);
	document
		.querySelector("#color-picker")
		.addEventListener("input", handlers.handleColorChange);

	// Set initial active tool
	document.querySelector("#pencil-button").classList.add("active");

	return { state, handlers };
}

export function getDrawingInfoFromURL() {
	const url = new URL(window.location.href);
	const drawingInfoParam = url.searchParams.get("drawingInfo");

	// If no drawing info in URL, generate random data
	if (!drawingInfoParam) {
		const n = 5000;
		return getDefaultDrawingData(n);
	}

	// Decode base64 data
	const binaryData = atob(drawingInfoParam);
	const buffer = new Uint8Array(binaryData.length);

	// Convert binary string to Uint8Array
	for (let i = 0; i < binaryData.length; i++) {
		buffer[i] = binaryData.charCodeAt(i);
	}

	// Read data from buffer
	// First 4 bytes: number of points (n)
	const dataView = new DataView(buffer.buffer);
	const n = dataView.getUint32(0, true); // true = little endian

	// Prepare arrays
	const finalPositions = new Float32Array(n * 2);
	const colors = new Float32Array(n * 4);

	// Extract position data (n*2 float32 values)
	const posOffset = 4; // Start after the n value
	for (let i = 0; i < n * 2; i++) {
		finalPositions[i] = dataView.getFloat32(posOffset + i * 4, true);
	}

	// Extract color data (n*4 float32 values)
	const colorOffset = posOffset + n * 2 * 4;
	for (let i = 0; i < n * 4; i++) {
		colors[i] = dataView.getFloat32(colorOffset + i * 4, true);
	}

	// Validate data length
	if (finalPositions.length !== n * 2 || colors.length !== n * 4) {
		throw new Error(
			"Invalid array lengths: finalPositions must be n*2 and colors must be n*4"
		);
	}

	return {
		finalPositions: Array.from(finalPositions),
		colors: Array.from(colors),
	};
}

// Helper function for generating random drawing data
function getDefaultDrawingData(n) {
	const finalPositions = [];
	const colors = [];

	for (let i = 0; i < n; i++) {
		finalPositions.push(-1.0, -1.0);
		const r = i === 0 ? 1.0 : 0.5;
		const g = i === 0 ? 1.0 : 0.0;
		const b = i === 0 ? 0.0 : 0.5;
		const a = 1.0;
		colors.push(r, g, b, a);
	}

	return { finalPositions, colors };
}

// Helper function to encode drawing data for URL
function encodeDrawingDataForURL(n, finalPositions, colors) {
	// Validate input arrays
	if (finalPositions.length !== n * 2 || colors.length !== n * 4) {
		throw new Error(
			"Invalid array lengths: finalPositions must be n*2 and colors must be n*4"
		);
	}

	// Create buffer with enough space
	const bufferSize = 4 + n * 2 * 4 + n * 4 * 4; // 4 bytes for n + float32 for positions and colors
	const buffer = new ArrayBuffer(bufferSize);
	const dataView = new DataView(buffer);

	// Write number of points
	dataView.setUint32(0, n, true);

	// Write position data
	const posOffset = 4;
	for (let i = 0; i < n * 2; i++) {
		dataView.setFloat32(posOffset + i * 4, finalPositions[i], true);
	}

	// Write color data
	const colorOffset = posOffset + n * 2 * 4;
	for (let i = 0; i < n * 4; i++) {
		dataView.setFloat32(colorOffset + i * 4, colors[i], true);
	}

	// Convert to base64 (URL safe)
	const bytes = new Uint8Array(buffer);

	// Encoding the bytes to Base64
	let base64;
	const chunkSize = 0xffff;
	let binary = "";
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
		binary += String.fromCharCode.apply(null, slice);
	}
	base64 = window.btoa(binary);

	// Make URL safe
	return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
