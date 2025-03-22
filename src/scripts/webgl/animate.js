export default function createAnimation(fn, ...args) {
	let then = 0.0;
	let deltaTime = 0.0;

	const render = (now) => {
		now *= 0.001; // convert to seconds
		deltaTime = now - then;
		then = now;

		let state = fn(deltaTime, ...args);
		if (!state.continueAnimation) return;

		requestAnimationFrame(render);
	};

	requestAnimationFrame(render);
}
