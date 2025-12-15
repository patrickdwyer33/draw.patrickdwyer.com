import Optional from "/scripts/utils/optional.js";
import Either from "/scripts/utils/either.js";

import initPWA from "/scripts/pwa.js";
import setupUserDrawing from "/scripts/drawing.js";
import runSimulation from "/scripts/webgl/simulation.js";

const period = 60 * 1000;
initPWA(period);

const routes = {
	"/": () => {
		console.log("Main route");
		const canvasId = "drawing-canvas";
		const clearColorString = "#000000";
		setupUserDrawing(document, canvasId, clearColorString);
	},
	"/simulate": async () => {
		console.log("Simulation route");
		const canvasId = "simulation-canvas";
		const clearColor = [0.0, 0.0, 0.0, 1.0];
		const simulation = await runSimulation(canvasId, clearColor);

		// Set up event handler for shake it up button
		const shakeButton = document.getElementById("shake-it-up-button");
		if (shakeButton && simulation && simulation.shakeItUp) {
			shakeButton.addEventListener("click", () => {
				simulation.shakeItUp();
			});
		}
	},
};

const currentRoute = window.location.pathname;
const routeHandler = Optional.of(routes[currentRoute]) // Returns None or Some(handler)
	.map((handler) => Either.tryCatch(() => handler())) // Does nothing to None, converts Some(handler) to Either(handler()) which returns left or right
	.getOrElse(() =>
		Either.left(new Error(`Route not found: ${currentRoute}`))
	); // Gets the left or right or handles None, returning a left with an error that fold can then access

// Evaluates routeHandler
routeHandler.fold(
	(error) => console.error(error),
	(_) => console.log("Route handled successfully")
);
