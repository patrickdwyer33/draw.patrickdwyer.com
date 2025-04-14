import runSimulation from "src/scripts/webgl/run-simulation.js";
import initGLCanvas from "src/scripts/webgl/init.js";


export function getDrawingInfoFromURL(canvas, clearColor) {
	const url = new URL(window.location.href);
	const drawingInfoParam = url.searchParams.get("drawingInfo");

	// If no drawing info in URL, generate default data
	if (!drawingInfoParam) {
		return getDefaultDrawingData(canvas, clearColor);
	}

	return JSON.parse(drawingInfoParam);
}

// Helper function for generating default drawing data
function getDefaultDrawingData(canvas, clearColor) {
	const colors = [];
	const displayWidth = canvas.clientWidth;
	const displayHeight = canvas.clientHeight;

	for (let i = 0; i < displayWidth * displayHeight; i++) {
		const r = i === 0 ? 1.0 : 0.5;
		const g = i === 0 ? 1.0 : 0.0;
		const b = i === 0 ? 0.0 : 0.5;
		const a = 1.0;
		colors.push(r, g, b, a);
	}

	return {
		colors,
		clearColor,
	};
}

function createSimulationHandlers(canvas) {
	return {
		handleNewDrawing: () => {
			window.location.href = "/";
		},
	};
}

export default function setupAndRunSimulation(canvasId, clearColor) {
	const gl = initGLCanvas(canvasId, clearColor);
	const drawingInfo = getDrawingInfoFromURL(gl.canvas, clearColor);

    const handlers = createSimulationHandlers();

    document
		.querySelector("#new-drawing-button")
		.addEventListener("click", handlers.handleNewDrawing);

	runSimulation(gl, drawingInfo);
}
