import { pipe } from "/scripts/utils/fp.js";
import initEraserSizePicker from "/scripts/eraser-size.js";
import { encodeDrawing } from "/shared/codec.js";
import { objectsBase } from "/scripts/utils/objects-host.js";

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

const createDrawingState = (fillColor) => ({
	isDrawing: false,
	currentTool: "pencil",
	color: "#ffffff",
	fillColor,
	lineWidth: 2,
	eraserWidth: 22, // medium; see ERASER_SIZES in eraser-size.js
	lastX: 0,
	lastY: 0,
	ctx: null,
});

// The one place tool identity becomes canvas state. It used to be inlined in
// handleToolChange, which set strokeStyle but never updated state.currentTool —
// so the eraser guard in handleColorChange never fired and choosing a colour
// mid-erase silently turned the eraser into a pen. Size makes that worse (both
// colour AND width must be re-applied), so it lives in one function now.
const applyTool = (state) => {
	const erasing = state.currentTool === "eraser";
	state.ctx.strokeStyle = erasing ? state.fillColor : state.color;
	state.ctx.lineWidth = erasing ? state.eraserWidth : state.lineWidth;
};

// Loading overlay for actions that end in a navigation.
//
// Deliberately NOT hidden on success: submit and find both finish with
// window.location.href, and the current page stays on screen until the next one
// renders. Hiding it early would leave a dead-looking canvas for the slowest
// part of the wait — the navigation itself.
const showLoading = (doc, message) => {
	const modal = doc.getElementById("loading-modal");
	if (!modal) return;
	doc.getElementById("loading-message").textContent = message;
	modal.classList.add("show");
};

const hideLoading = (doc) => doc.getElementById("loading-modal")?.classList.remove("show");

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
		// Remove active class from all tool buttons
		document.querySelector("#pencil-button")?.classList.remove("active");
		document.querySelector("#eraser-button")?.classList.remove("active");

		// Add active class to clicked button
		e.target?.classList.add("active");

		state.currentTool = e.target?.id === "eraser-button" ? "eraser" : "pencil";
		applyTool(state);
	},

	handleClear: () => {
		clearCanvas(state.ctx, canvas.width, canvas.height);
	},

	handleColorChange: (e) => {
		state.color = e.target.value;
		applyTool(state); // no-op for the pen colour while erasing
	},

	handleEraserSize: (width) => {
		state.eraserWidth = width;
		applyTool(state);
	},

	handleSubmit: () => {
		// Show the modal
		const modal = document.getElementById("title-modal");
		const titleInput = document.getElementById("drawing-title");
		if (modal) {
			modal.classList.add("show");
			// Clear previous input and focus
			titleInput.value = "";
			setTimeout(() => titleInput.focus(), 100);
		}
	},

	handleModalSubmit: async () => {
		const titleInput = document.getElementById("drawing-title");
		const modal = document.getElementById("title-modal");
		const title = titleInput?.value?.trim() || "";

		if (!title) {
			alert("Please enter a title for your drawing");
			return;
		}

		// Hide modal
		modal.classList.remove("show");
		showLoading(document, "Saving your drawing…");

		try {
			await postDrawing(title, state.fillColor);
		} catch (err) {
			hideLoading(document);
			// postDrawing throws the server's message on a non-OK response — most
			// commonly the 429 rate-limit ("Please wait N more minutes..."). Surface
			// it instead of letting the promise reject unhandled (console error).
			alert(err.message || "Failed to save drawing. Please try again.");
			return;
		}
		const url = `${window.location.origin}/simulate?title=${encodeURIComponent(title)}`;
		window.location.href = url;
	},

	handleModalCancel: () => {
		const modal = document.getElementById("title-modal");
		if (modal) {
			modal.classList.remove("show");
		}
	},

	handleFind: () => {
		// Show the find modal
		const modal = document.getElementById("find-modal");
		const titleInput = document.getElementById("find-drawing-title");
		const errorDiv = document.getElementById("find-error");
		if (modal) {
			modal.classList.add("show");
			// Clear previous input, error, and focus
			titleInput.value = "";
			errorDiv.textContent = "";
			setTimeout(() => titleInput.focus(), 100);
		}
	},

	handleFindSubmit: async () => {
		const titleInput = document.getElementById("find-drawing-title");
		const modal = document.getElementById("find-modal");
		const errorDiv = document.getElementById("find-error");
		const title = titleInput?.value?.trim() || "";

		if (!title) {
			errorDiv.textContent = "Please enter a title";
			return;
		}

		// Check if drawing exists
		try {
			const base = objectsBase() || window.location.origin;
			const url = `${base}/draw/public/drawings/${encodeURIComponent(title)}.bin`;
			const response = await fetch(url, { method: "GET" });

			if (response.ok) {
				// Drawing found, navigate to simulate page
				modal.classList.remove("show");
				showLoading(document, "Loading drawing…");
				const url = `${window.location.origin}/simulate?title=${encodeURIComponent(title)}`;
				window.location.href = url;
			} else {
				// Drawing not found
				errorDiv.textContent = `No drawing found with title "${title}"`;
			}
		} catch (error) {
			console.error("Error finding drawing:", error);
			hideLoading(document);
			errorDiv.textContent = "Error searching for drawing. Please try again.";
		}
	},

	handleFindCancel: () => {
		const modal = document.getElementById("find-modal");
		if (modal) {
			modal.classList.remove("show");
		}
	},
});

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

	// Pointer events, not mouse events. A finger never produces a
	// mousedown/mousemove drag sequence — mobile browsers synthesise only a click
	// — so drawing simply did not work on a phone; the swipe was interpreted as a
	// scroll. Pointer events cover mouse, touch and pen with one code path, and
	// offsetX/offsetY read the same. `touch-action: none` on the canvas (main.css)
	// is the other half: it stops the browser claiming the gesture for panning.
	canvas.addEventListener("pointerdown", (e) => {
		// Capture so a stroke keeps tracking if the finger leaves the canvas.
		canvas.setPointerCapture?.(e.pointerId);
		handlers.handleMouseDown(e);
	});
	canvas.addEventListener("pointermove", handlers.handleMouseMove);
	canvas.addEventListener("pointerup", handlers.handleMouseUp);
	canvas.addEventListener("pointercancel", handlers.handleMouseUp);
	canvas.addEventListener("pointerleave", handlers.handleMouseUp);

	// Opens on the click that actually selects the eraser. Under the carousel a
	// first tap only centres the button and is swallowed before it reaches here,
	// so the popover cannot appear for a tool you have not selected yet.
	const eraserSizes = initEraserSizePicker(document, handlers.handleEraserSize);

	document
		.querySelectorAll("#pencil-button,#eraser-button")
		.forEach((ele) =>
			ele.addEventListener("click", (e) => {
				handlers.handleToolChange(e);
				if (state.currentTool === "eraser") eraserSizes.open();
				else eraserSizes.close();
			})
		);
	document
		.querySelector("#clear-button")
		.addEventListener("click", handlers.handleClear);
	const colorPicker = document.querySelector("#color-picker");
	colorPicker.addEventListener("input", handlers.handleColorChange);
	// Set initial color to match state
	colorPicker.value = state.color;

	// Returning via Back restores this page from the bfcache exactly as it was
	// unloaded — mid-navigation, overlay still up. Nothing else would clear it.
	window.addEventListener("pageshow", (e) => e.persisted && hideLoading(document));

	document.querySelector("#pencil-button").classList.add("active");

	document
		.querySelector("#submit-button")
		.addEventListener("click", handlers.handleSubmit);

	document
		.querySelector("#find-button")
		.addEventListener("click", handlers.handleFind);

	// Title modal event listeners
	document
		.querySelector("#modal-submit")
		.addEventListener("click", handlers.handleModalSubmit);
	document
		.querySelector("#modal-cancel")
		.addEventListener("click", handlers.handleModalCancel);

	// Allow Enter key to submit modal
	document
		.querySelector("#drawing-title")
		.addEventListener("keypress", (e) => {
			if (e.key === "Enter") {
				handlers.handleModalSubmit();
			}
		});

	// Close modal when clicking outside
	document
		.querySelector("#title-modal")
		.addEventListener("click", (e) => {
			if (e.target.id === "title-modal") {
				handlers.handleModalCancel();
			}
		});

	// Find modal event listeners
	document
		.querySelector("#find-modal-submit")
		.addEventListener("click", handlers.handleFindSubmit);
	document
		.querySelector("#find-modal-cancel")
		.addEventListener("click", handlers.handleFindCancel);

	// Allow Enter key to submit find modal
	document
		.querySelector("#find-drawing-title")
		.addEventListener("keypress", (e) => {
			if (e.key === "Enter") {
				handlers.handleFindSubmit();
			}
		});

	// Close find modal when clicking outside
	document
		.querySelector("#find-modal")
		.addEventListener("click", (e) => {
			if (e.target.id === "find-modal") {
				handlers.handleFindCancel();
			}
		});

	return { state, handlers };
}

const get2DArrayFloatCoordsFromIndex = (index, width, height) => {
	const x = (index % width) / width;
	const y = Math.floor(index / width) / height;
	return { x, y };
};

const getDrawingData = (canvas, clearColor) => {
	const ctx = canvas.getContext("2d");
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const pixels = imageData.data;

	const positions = [];
	const colors = [];

	const clearR = parseInt(clearColor.slice(1, 3), 16);
	const clearG = parseInt(clearColor.slice(3, 5), 16);
	const clearB = parseInt(clearColor.slice(5, 7), 16);

	const CLEAR_THRESHOLD = 10;

	for (let i = 0; i < pixels.length; i += 4) {
		const r = pixels[i];
		const g = pixels[i + 1];
		const b = pixels[i + 2];

		if (
			Math.abs(r - clearR) < CLEAR_THRESHOLD &&
			Math.abs(g - clearG) < CLEAR_THRESHOLD &&
			Math.abs(b - clearB) < CLEAR_THRESHOLD
		)
			continue;

		const pixelIndex = i / 4;
		const { x, y } = get2DArrayFloatCoordsFromIndex(
			pixelIndex,
			canvas.width,
			canvas.height
		);

		positions.push(x, y);
		colors.push(r, g, b);
	}

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
	const body = encodeDrawing(drawingData);

	const url = `${window.location.origin}/api/drawings/${encodeURIComponent(title)}`;
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/octet-stream" },
		body,
	});
	if (!response.ok) {
		const msg = await response.json().catch(() => ({}));
		throw new Error(msg.error || `HTTP error! status: ${response.status}`);
	}
	return await response.json();
};
