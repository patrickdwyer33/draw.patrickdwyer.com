import { pipe } from "../utils/fp.js";

// Pure functions for drawing operations
export const createCanvasContext = (canvas) => {
	const ctx = canvas.getContext("2d");
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	return ctx;
};

export const setDrawingStyle = (ctx, { color, lineWidth }) => {
	ctx.strokeStyle = color;
	ctx.lineWidth = lineWidth;
	return ctx;
};

export const drawLine = (ctx, startX, startY, endX, endY) => {
	ctx.beginPath();
	ctx.moveTo(startX, startY);
	ctx.lineTo(endX, endY);
	ctx.stroke();
};

export const clearCanvas = (ctx, width, height) => {
	ctx.clearRect(0, 0, width, height);
};

// Drawing state management
export const createDrawingState = () => ({
	isDrawing: false,
	currentTool: "pencil",
	color: "#000000",
	lineWidth: 2,
	lastX: 0,
	lastY: 0,
	ctx: null,
});

// Event handlers
export const createDrawingHandlers = (state) => ({
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
		const tool = e.target.closest(".tool-button")?.dataset.tool;
		if (!tool) return;

		state.currentTool = tool;
		if (tool === "eraser") {
			state.ctx.strokeStyle = "#ffffff";
		} else {
			state.ctx.strokeStyle = state.color;
		}
	},

	handleColorChange: (e) => {
		state.color = e.target.value;
		if (state.currentTool !== "eraser") {
			state.ctx.strokeStyle = state.color;
		}
	},
});

// Canvas setup
export const setupUserDrawing = (window, document, canvasId) => {
	const canvas = document.getElementById(canvasId);
	canvas.width = window.innerWidth * 0.8;
	canvas.height = window.innerHeight * 0.6;

	const state = createDrawingState();
	state.ctx = pipe(createCanvasContext, (ctx) =>
		setDrawingStyle(ctx, { color: state.color, lineWidth: state.lineWidth })
	)(canvas);

	const handlers = createDrawingHandlers(state);

	// Event listeners
	canvas.addEventListener("mousedown", handlers.handleMouseDown);
	canvas.addEventListener("mousemove", handlers.handleMouseMove);
	canvas.addEventListener("mouseup", handlers.handleMouseUp);
	canvas.addEventListener("mouseout", handlers.handleMouseUp);

	return { state, handlers };
};
