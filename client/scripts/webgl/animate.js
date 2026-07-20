// Cap the physics step so a single slow frame (GC pause, background tab, a hiccup)
// advances the sim a BOUNDED amount instead of making every ball jump by
// velocity * (a huge deltaTime) — that jump is the visible "stutter". Also tames
// the first frame, where `then` is still 0.
const MAX_DELTA_TIME = 1 / 30;

// Weight of the newest frame time in the smoothed step (EMA). Lower = smoother but
// slower to adapt if the real frame rate changes.
const DT_SMOOTHING = 0.1;

// Opt-in frame diagnostics: add ?debug to the URL (e.g. /simulate?title=face&debug).
// Reports any frame whose wall-clock gap exceeds LONG_FRAME_MS, alongside how much
// of that gap our own step() actually accounts for. That split is the whole point:
// if the gap is 200ms but our step ran for 3ms, the stall is NOT our code — it is
// GC, the compositor, or the GPU — and no amount of optimizing this loop will help.
const DEBUG =
	typeof location !== "undefined" &&
	new URLSearchParams(location.search).has("debug");
const LONG_FRAME_MS = 50; // ~3 missed frames at 60Hz

// `step` is a closure of (deltaTime, now). It deliberately takes no extra args:
// this used to be createAnimation(fn, ...args) calling fn(deltaTime, now, ...args),
// which spread a 6-element array into a call on EVERY frame — a per-frame
// allocation sitting in the hot loop, in the one file the allocation sweep of
// simulation.js never looked at.
export default function createAnimation(step) {
	let then = 0.0;
	let smoothedDt = 0.0;
	let lastStepMs = 0.0;

	const render = (now) => {
		now *= 0.001; // Converts to seconds
		const gapMs = (now - then) * 1000; // UNCLAMPED — this is what the eye sees
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

		let state;
		if (DEBUG) {
			// The gap measured on THIS frame spans from the previous frame's start,
			// so the work that could have caused it is the PREVIOUS step, not this one.
			const t0 = performance.now();
			state = step(smoothedDt, now);
			const stepMs = performance.now() - t0;
			if (gapMs > LONG_FRAME_MS) {
				console.warn(
					`[hitch] t=${now.toFixed(1)}s gap=${gapMs.toFixed(1)}ms ` +
						`prevStep=${lastStepMs.toFixed(1)}ms ` +
						`unaccounted=${(gapMs - lastStepMs).toFixed(1)}ms`
				);
			}
			lastStepMs = stepMs;
		} else {
			state = step(smoothedDt, now);
		}

		if (!state.continueAnimation) return;

		requestAnimationFrame(render);
	};

	requestAnimationFrame(render);
}
