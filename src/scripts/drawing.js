import { pipe } from "src/scripts/utils/fp.js";

export const createDrawingCanvasContext = (canvas, devicePixelRatio) => {
	const ctx = canvas.getContext("2d");
	ctx.scale(devicePixelRatio, devicePixelRatio);
	ctx.imageSmoothingEnabled = false;
	ctx.fillStyle = "black";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
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
	ctx.fillRect(0, 0, width, height);
};

// Drawing state management
const createDrawingState = () => ({
	isDrawing: false,
	currentTool: "pencil",
	color: "#ffffff",
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
		console.log(e.target?.id);
		state.ctx.strokeStyle =
			e.target?.id === "eraser-button" ? "#000000" : state.color;
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

	handleSubmit: () => {
		const drawingInfo = getDrawingInfoFromCanvas(state, canvas);
		const url = createDrawingURL(drawingInfo);
		window.location.href = url;
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

	document
		.querySelector("#submit-button")
		.addEventListener("click", handlers.handleSubmit);

	return { state, handlers };
}

function getDrawingInfoFromCanvas(state, canvas) {
	const finalPositions = [];
	const colors = [];

	// Get the canvas's display size (not the internal size)
	const displayWidth = canvas.clientWidth;
	const displayHeight = canvas.clientHeight;

	// Get the image data from the canvas
	const imageData = state.ctx.getImageData(0, 0, displayWidth, displayHeight);
	const data = imageData.data;

	// Process each pixel
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		const a = data[i + 3];

		// Skip black pixels (0, 0, 0) and fully transparent pixels
		// TODO: This is a hack to get rid of the black pixels, there may be some rounding errors
		if (r <= 1 && g <= 1 && b <= 1) continue;
		if (a === 0) continue;

		// Calculate x and y coordinates
		const pixelIndex = i / 4;
		const x = (pixelIndex % displayWidth) / displayWidth;
		const y = Math.floor(pixelIndex / displayWidth) / displayHeight;

		// Add position and color data
		finalPositions.push(x, y);
		colors.push(r / 255, g / 255, b / 255, a / 255);
	}

	return { finalPositions, colors };
}

export function getDrawingInfoFromURL() {
	const url = new URL(window.location.href);
	const drawingInfoParam = url.searchParams.get("drawingInfo");

	// If no drawing info in URL, generate default data
	if (!drawingInfoParam) {
		const n = 5000;
		return getDefaultDrawingData(n);
	}

	return JSON.parse(drawingInfoParam);
}

// Helper function for generating default drawing data
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

export function createDrawingURL(drawingInfo) {
	// Convert the drawing info to a JSON string
	const drawingData = JSON.stringify({
		finalPositions: drawingInfo.finalPositions,
		colors: drawingInfo.colors,
	});

	// Create the base URL
	const baseURL = `${window.location.origin}/simulate`;

	// Create URL object and add the drawing info as a query parameter
	const url = new URL(baseURL);
	url.searchParams.set("drawingInfo", drawingData);

	return url.toString();
}
