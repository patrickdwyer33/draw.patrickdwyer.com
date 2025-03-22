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
