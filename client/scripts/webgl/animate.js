// Cap the physics step so a single slow frame (GC pause, background tab, a hiccup)
// advances the sim a BOUNDED amount instead of making every ball jump by
// velocity * (a huge deltaTime) — that jump is the visible "stutter". Also tames
// the first frame, where `then` is still 0.
const MAX_DELTA_TIME = 1 / 30;

export default function createAnimation(fn, ...args) {
	let then = 0.0;
	let deltaTime = 0.0;

	const render = (now) => {
		now *= 0.001; // Converts to seconds
		deltaTime = Math.min(now - then, MAX_DELTA_TIME);
		then = now;

		let state = fn(deltaTime, now, ...args);
		if (!state.continueAnimation) return;

		requestAnimationFrame(render);
	};

	requestAnimationFrame(render);
}
