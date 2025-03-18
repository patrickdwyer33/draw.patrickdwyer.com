import { initPWA } from "./pwa.js";
import { setupDrawingCanvas } from "./drawing.js";

// Initialize PWA
const period = 60 * 1000;
initPWA(period);

// Initialize drawing page
const { state, handlers } = setupDrawingCanvas("drawingCanvas");

// Set up toolbar events
document
	.querySelector(".toolbar")
	.addEventListener("click", handlers.handleToolChange);
document
	.getElementById("colorPicker")
	.addEventListener("input", handlers.handleColorChange);

// Set initial active tool
document.querySelector('[data-tool="pencil"]').classList.add("active");
