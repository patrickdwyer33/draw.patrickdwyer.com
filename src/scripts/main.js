import { initPWA } from "./pwa.js";
import { setupDrawingCanvas } from "./drawing.js";
import Optional from "../utils/optional.js";
import Either from "../utils/either.js";

// Initialize PWA
const period = 60 * 1000;
initPWA(period);

const routes = {
	"/": () => {
		console.log("Main route");
		setupUserDrawing(window, document);
	},
	"/simulation": () => {
		console.log("Simulation route");
		// Add your about route logic here
	},
};

const currentRoute = window.location.pathname;
const routeHandler = Optional.of(routes[currentRoute]) // Returns None or Some(handler)
	.map((handler) => Either.tryCatch(() => handler())) // Does nothing to None, converts Some(handler) to Either(handler()) which returns left or right
	.getOrElse(() =>
		Either.left(new Error(`Route not found: ${currentRoute}`))
	); // gets the left or right or handles None, returning a left with an error that fold can then access

// evaluates routeHandler
routeHandler.fold(
	(error) => console.error(error),
	(_) => console.log("Route handled successfully")
);

// // Initialize drawing page
// const { state, handlers } = setupDrawingCanvas("drawingCanvas");

// // Set up toolbar events
// document
// 	.querySelector(".toolbar")
// 	.addEventListener("click", handlers.handleToolChange);
// document
// 	.getElementById("colorPicker")
// 	.addEventListener("input", handlers.handleColorChange);

// // Set initial active tool
// document.querySelector('[data-tool="pencil"]').classList.add("active");
