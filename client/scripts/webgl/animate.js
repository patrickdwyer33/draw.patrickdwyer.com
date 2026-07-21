// Cap the physics step so a single slow frame (GC pause, background tab, a hiccup)
// advances the sim a BOUNDED amount instead of making every ball jump by
// velocity * (a huge deltaTime) — that jump is the visible "stutter". Also tames
// the first frame, where `then` is still 0.
const MAX_DELTA_TIME = 1 / 30;

// Weight of the newest frame time in the smoothed step (EMA). Lower = smoother but
// slower to adapt if the real frame rate changes.
const DT_SMOOTHING = 0.1;

// Opt-in frame diagnostics: add ?debug to the URL (e.g. /simulate?title=face&debug).
//
// EVERYTHING here accumulates silently and is reported ONCE per SUMMARY_FRAMES.
// Per-event console logging destroyed an earlier measurement run: a frame over the
// threshold logged, console.warn with DevTools open captures an async stack trace
// (expensive, and it allocates), that pushed the next frame over the threshold too,
// and it latched at a steady 33ms/frame — turning a 120Hz session into a 30Hz one
// and manufacturing a GC every few frames out of the log strings themselves. The
// probe has to be cheaper than the thing it is probing.
const DEBUG =
	typeof location !== "undefined" &&
	new URLSearchParams(location.search).has("debug");
const LONG_FRAME_MS = 30;
const SUMMARY_FRAMES = 300;

// A timer independent of rendering. During a stall it answers the question no other
// field can: was the MAIN THREAD alive?
//   ticks arriving normally -> the thread was fine, only RENDERING stopped
//     (compositor / GPU / vsync, or an occluded window).
//   ticks missing too -> the thread itself was blocked or starved.
const TIMER_MS = 100;
let timerTicks = 0;
if (DEBUG) {
	setInterval(() => {
		timerTicks++;
	}, TIMER_MS);
}

// performance.memory is Chrome-only and non-standard, but it gives both the
// allocation rate (steady climb) and every collection (sharp drop) — and lets us
// correlate a collection with that frame's interval. A GC landing on a normal 8.3ms
// frame did not cause a visible hitch, however much it freed.
const HEAP = typeof performance !== "undefined" && performance.memory;
const GC_DROP_BYTES = 200 * 1024;

const gapSamples = new Float32Array(SUMMARY_FRAMES);
const gapSorted = new Float32Array(SUMMARY_FRAMES);

export default function createAnimation(step) {
	let then = 0.0;
	let smoothedDt = 0.0;
	let frameCount = 0;
	let sampleIdx = 0;

	// Accumulators, all reset each summary. No allocation, no logging.
	let lastHeap = 0;
	let heapAtSummaryStart = 0;
	let gcCount = 0;
	let gcOnLongFrame = 0;
	let longFrames = 0;
	let worstGap = 0;
	let worstGapAt = 0;
	let worstStep = 0;
	let worstTicksGot = 0;
	let worstTicksWant = 0;
	let lastTicks = 0;
	let lastStepMs = 0;

	const summarise = (now) => {
		gapSorted.set(gapSamples);
		gapSorted.sort();
		const median = gapSorted[SUMMARY_FRAMES >> 1];
		let dropped = 0;
		for (let i = 0; i < SUMMARY_FRAMES; i++) {
			if (gapSamples[i] > median * 1.5) dropped++;
		}

		let heapPart = "";
		if (HEAP) {
			const h = performance.memory.usedJSHeapSize;
			heapPart =
				` | heap=${(h / 1048576).toFixed(2)}MB ` +
				`delta=${((h - heapAtSummaryStart) / 1024).toFixed(0)}KB ` +
				`GCs=${gcCount}(${gcOnLongFrame} on long frames)`;
			heapAtSummaryStart = h;
		}

		// The worst frame in the window, described in full. One line instead of the
		// hundreds the per-event logging produced.
		const worstPart =
			worstGap > LONG_FRAME_MS
				? ` || WORST t=${worstGapAt.toFixed(1)}s gap=${worstGap.toFixed(0)}ms ` +
					`step=${worstStep.toFixed(1)}ms ticks=${worstTicksGot}/${worstTicksWant}`
				: "";

		console.log(
			`[frames] t=${now.toFixed(0)}s median=${median.toFixed(1)}ms ` +
				`(~${Math.round(1000 / median)}Hz) max=${gapSorted[
					SUMMARY_FRAMES - 1
				].toFixed(1)}ms dropped=${dropped} long=${longFrames}` +
				heapPart +
				worstPart
		);

		gcCount = 0;
		gcOnLongFrame = 0;
		longFrames = 0;
		worstGap = 0;
		worstStep = 0;
		worstTicksGot = 0;
		worstTicksWant = 0;
	};

	const render = (now) => {
		now *= 0.001; // Converts to seconds
		const gapMs = (now - then) * 1000; // UNCLAMPED — this is what the eye sees
		frameCount++;
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
			const t0 = performance.now();
			state = step(smoothedDt, now);
			const stepMs = performance.now() - t0;

			if (frameCount > 1) {
				const ticksGot = timerTicks - lastTicks;
				const ticksWant = Math.round(gapMs / TIMER_MS);
				const isLong = gapMs > LONG_FRAME_MS;
				if (isLong) longFrames++;

				// Keep only the worst frame of the window. The step time that could
				// have caused this gap is the PREVIOUS frame's, not this one's.
				if (gapMs > worstGap) {
					worstGap = gapMs;
					worstGapAt = now;
					worstStep = lastStepMs;
					worstTicksGot = ticksGot;
					worstTicksWant = ticksWant;
				}

				if (HEAP) {
					const h = performance.memory.usedJSHeapSize;
					if (lastHeap && h < lastHeap - GC_DROP_BYTES) {
						gcCount++;
						if (isLong) gcOnLongFrame++;
					}
					lastHeap = h;
					if (heapAtSummaryStart === 0) heapAtSummaryStart = h;
				}

				// Exclude multi-second occlusion gaps; they would swamp median/max.
				if (gapMs < 1000) {
					gapSamples[sampleIdx++] = gapMs;
					if (sampleIdx === SUMMARY_FRAMES) {
						summarise(now);
						sampleIdx = 0;
					}
				}
				lastTicks = timerTicks;
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
