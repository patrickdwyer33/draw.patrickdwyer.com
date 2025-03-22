export default function createAnimation(fn, ...args) {
	let then = 0;

	const render = (now) => {
		now *= 0.001; // convert to seconds
		deltaTime = now - then;
		then = now;

		let continueAnimation = fn(gl, deltaTime, ...args);
		if (!continueAnimation) return;

		requestAnimationFrame(render);
	};

	requestAnimationFrame(render);
}
