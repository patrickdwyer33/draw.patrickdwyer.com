import { pipe } from "../utils/fp.js";
import {
	createCanvasContext,
	setDrawingStyle,
	drawLine,
	clearCanvas,
} from "./drawing.js";

// Simulation state management
export const createSimulationState = () => ({
	isSimulating: false,
	isPaused: false,
	currentStep: 0,
	ctx: null,
	steps: [],
});

// Pure functions for simulation
export const loadDrawingSteps = async () => {
	try {
		const response = await fetch("/api/drawing-steps");
		return await response.json();
	} catch (error) {
		console.error("Failed to load drawing steps:", error);
		return [];
	}
};

export const simulateStep = (ctx, step) => {
	if (!step) return;
	drawLine(ctx, step.startX, step.startY, step.endX, step.endY);
};

// Event handlers
export const createSimulationHandlers = (state) => ({
	handleSimulate: async () => {
		if (state.isSimulating) return;

		state.steps = await loadDrawingSteps();
		state.isSimulating = true;
		state.isPaused = false;
		state.currentStep = 0;

		clearCanvas(state.ctx, state.ctx.canvas.width, state.ctx.canvas.height);
	},

	handlePause: () => {
		state.isPaused = !state.isPaused;
	},

	handleReset: () => {
		state.isSimulating = false;
		state.isPaused = false;
		state.currentStep = 0;
		clearCanvas(state.ctx, state.ctx.canvas.width, state.ctx.canvas.height);
	},
});

// Animation loop
export const createAnimationLoop = (state) => {
	let animationFrameId;

	const animate = () => {
		if (!state.isSimulating || state.isPaused) {
			animationFrameId = requestAnimationFrame(animate);
			return;
		}

		if (state.currentStep < state.steps.length) {
			simulateStep(state.ctx, state.steps[state.currentStep]);
			state.currentStep++;
			animationFrameId = requestAnimationFrame(animate);
		} else {
			state.isSimulating = false;
		}
	};

	return {
		start: () => {
			animate();
		},
		stop: () => {
			if (animationFrameId) {
				cancelAnimationFrame(animationFrameId);
			}
		},
	};
};

// Canvas setup
export const setupSimulationCanvas = (canvasId) => {
	const canvas = document.getElementById(canvasId);
	canvas.width = window.innerWidth * 0.8;
	canvas.height = window.innerHeight * 0.6;

	const state = createSimulationState();
	state.ctx = pipe(createCanvasContext, (ctx) =>
		setDrawingStyle(ctx, { color: "#000000", lineWidth: 2 })
	)(canvas);

	const handlers = createSimulationHandlers(state);
	const animationLoop = createAnimationLoop(state);

	// Event listeners
	document
		.querySelector('[data-tool="simulate"]')
		.addEventListener("click", () => {
			handlers.handleSimulate();
			animationLoop.start();
		});

	document
		.querySelector('[data-tool="pause"]')
		.addEventListener("click", handlers.handlePause);
	document
		.querySelector('[data-tool="reset"]')
		.addEventListener("click", handlers.handleReset);

	return { state, handlers, animationLoop };
};
