import { pipe } from "/scripts/utils/fp.js";

export const createDrawingCanvasContext = (
	canvas,
	devicePixelRatio,
	fillColor
) => {
	const ctx = canvas.getContext("2d");
	ctx.scale(devicePixelRatio, devicePixelRatio);
	ctx.imageSmoothingEnabled = false;
	ctx.fillStyle = fillColor;
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
const createDrawingState = (fillColor) => ({
	isDrawing: false,
	currentTool: "pencil",
	color: "#ffffff",
	fillColor,
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

	handleSubmit: async () => {
		const title = "test";
		await postDrawing(title, state.fillColor);
		const url = `${window.location.origin}/simulate?title=${title}`;
		window.location.href = url;
	},
});

// Canvas setup
export default function setupUserDrawing(document, canvasId, clearColor) {
	const canvas = document.getElementById(canvasId);

	// Get the canvas's display size from CSS
	const displayWidth = canvas.clientWidth;
	const displayHeight = canvas.clientHeight;

	// Get the device pixel ratio to handle high DPI displays
	const dpr = window.devicePixelRatio || 1;

	// Set the canvas's internal dimensions to match its display size
	canvas.width = displayWidth * dpr;
	canvas.height = displayHeight * dpr;

	const state = createDrawingState(clearColor);
	state.ctx = pipe(createDrawingCanvasContext, (ctx) =>
		setDrawingStyle(ctx, { color: state.color, lineWidth: state.lineWidth })
	)(canvas, dpr, state.fillColor);

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

const getDrawingData = (canvas, clearColor) => {
	const ctx = canvas.getContext("2d");
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const pixels = imageData.data;

	const positions = [];
	const colors = [];

	// Parse the clear color
	const clearR = parseInt(clearColor.slice(1, 3), 16);
	const clearG = parseInt(clearColor.slice(3, 5), 16);
	const clearB = parseInt(clearColor.slice(5, 7), 16);
	console.log(clearColor);
	console.log(clearR, clearG, clearB);

	const CLEAR_THRESHOLD = 10; // Threshold for considering a pixel as "clear"

	for (let i = 0; i < pixels.length; i += 4) {
		const r = pixels[i];
		const g = pixels[i + 1];
		const b = pixels[i + 2];

		// Skip if pixel is close to clear color
		if (
			Math.abs(r - clearR) < CLEAR_THRESHOLD &&
			Math.abs(g - clearG) < CLEAR_THRESHOLD &&
			Math.abs(b - clearB) < CLEAR_THRESHOLD
		) {
			continue;
		}

		// Calculate x, y position from index
		const pixelIndex = i / 4;
		const x = pixelIndex % canvas.width;
		const y = Math.floor(pixelIndex / canvas.width);

		positions.push(x, y);
		colors.push(r, g, b);
	}
	console.log(positions);

	return {
		positions,
		colors,
	};
};

const postDrawing = async (title, clearColor) => {
	const canvas = document.getElementById("drawing-canvas");
	if (!canvas) {
		throw new Error("Drawing canvas not found");
	}

	const drawingData = getDrawingData(canvas, clearColor);
	console.log(drawingData);

	try {
		const url = `${window.location.origin}/api/drawings/${title}`;
		console.log(url);
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(drawingData),
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		return await response.json();
	} catch (error) {
		console.error("Error posting drawing:", error);
		throw error;
	}
};
