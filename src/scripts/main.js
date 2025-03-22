import Optional from "../utils/optional.js";
import Either from "../utils/either.js";

import { initPWA } from "./pwa.js";
import { setupUserDrawing } from "./drawing.js";
// import { setupSimulationCanvas } from "./webgl/simulation.js";

// Initialize PWA
const period = 60 * 1000;
initPWA(period);

const routes = {
	"/": () => {
		console.log("Main route");
		const canvasId = "drawing-canvas";
		setupUserDrawing(window, document, canvasId);
	},
	"/simulation": () => {
		console.log("Simulation route");
		const canvasId = "simulation-canvas";
		setupSimulationCanvas(canvasId);
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
