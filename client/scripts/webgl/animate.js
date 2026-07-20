// Cap the physics step so a single slow frame (GC pause, background tab, a hiccup)
// advances the sim a BOUNDED amount instead of making every ball jump by
// velocity * (a huge deltaTime) — that jump is the visible "stutter". Also tames
// the first frame, where `then` is still 0.
const MAX_DELTA_TIME = 1 / 30;

// Weight of the newest frame time in the smoothed step (EMA). Lower = smoother but
// slower to adapt if the real frame rate changes.
const DT_SMOOTHING = 0.1;

export default function createAnimation(fn, ...args) {
	let then = 0.0;
	let deltaTime = 0.0;
	let smoothedDt = 0.0;

	const render = (now) => {
		now *= 0.001; // Converts to seconds
		const rawDt = Math.min(now - then, MAX_DELTA_TIME);
		then = now;

		// SMOOTH the physics step. requestAnimationFrame timestamps jitter by a
		// millisecond or two even when the browser presents frames on a steady vsync.
		// Feeding that jitter straight into `pos += velocity * dt` makes each
		// evenly-spaced frame advance the balls a slightly different distance, which
		// reads as stutter even at a rock-solid 60fps. An EMA keeps the step
		// near-constant while still tracking the true average frame time, so the sim
		// runs at the right speed on a 60Hz or a 120Hz display.
		smoothedDt =
			smoothedDt === 0
				? rawDt
				: smoothedDt * (1 - DT_SMOOTHING) + rawDt * DT_SMOOTHING;
		deltaTime = smoothedDt;

		let state = fn(deltaTime, now, ...args);
		if (!state.continueAnimation) return;

		requestAnimationFrame(render);
	};

	requestAnimationFrame(render);
}
