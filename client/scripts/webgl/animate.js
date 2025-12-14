export default function createAnimation(fn, ...args) {
	let then = 0.0;
	let deltaTime = 0.0;

	const render = (now) => {
		now *= 0.001; // Converts to seconds
		deltaTime = now - then;
		then = now;

		let state = fn(deltaTime, now, ...args);
		if (!state.continueAnimation) return;

		requestAnimationFrame(render);
	};

	requestAnimationFrame(render);
}
