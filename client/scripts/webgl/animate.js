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
const LONG_FRAME_MS = 30; // ~2 frames at 60Hz — catches single dropped frames too

// `step` is a closure of (deltaTime, now). It deliberately takes no extra args:
// this used to be createAnimation(fn, ...args) calling fn(deltaTime, now, ...args),
// which spread a 6-element array into a call on EVERY frame — a per-frame
// allocation sitting in the hot loop, in the one file the allocation sweep of
// simulation.js never looked at.
// A timer that fires independently of rendering. During a hitch it answers the one
// question the other fields cannot: was the MAIN THREAD alive?
//   ticks arriving normally through the gap -> the thread was fine and only
//     RENDERING stopped. That is the compositor / GPU / vsync path, not JS.
//   ticks missing too -> the whole thread was blocked or starved, by something
//     outside this app (another tab in the process, an extension, the OS).
const TIMER_MS = 100;
let timerTicks = 0;
if (DEBUG) {
	setInterval(() => {
		timerTicks++;
	}, TIMER_MS);
}

// Periodic frame-interval DISTRIBUTION. A threshold-based hitch log is blind to the
// display it is running on: on a 120Hz panel a dropped frame is 16.7ms and a double
// drop is 25ms, both well under a 30ms threshold and both plainly visible. The
// median here reveals the actual refresh rate; the drop counts reveal how often the
// browser missed one. Sampled into a preallocated array and summarised every
// SUMMARY_FRAMES so it costs nothing per frame and never allocates.
const SUMMARY_FRAMES = 300;
const gapSamples = new Float32Array(SUMMARY_FRAMES);
const gapSorted = new Float32Array(SUMMARY_FRAMES);
let sampleIdx = 0;

function summariseFrameGaps() {
	gapSorted.set(gapSamples);
	gapSorted.sort();
	const median = gapSorted[SUMMARY_FRAMES >> 1];
	const p95 = gapSorted[Math.floor(SUMMARY_FRAMES * 0.95)];
	// Anything past 1.5x the median missed at least one display interval.
	let dropped = 0;
	let bad = 0;
	for (let i = 0; i < SUMMARY_FRAMES; i++) {
		if (gapSamples[i] > median * 1.5) dropped++;
		if (gapSamples[i] > median * 2.5) bad++;
	}
	console.log(
		`[frames] n=${SUMMARY_FRAMES} median=${median.toFixed(1)}ms ` +
			`(~${Math.round(1000 / median)}Hz) min=${gapSorted[0].toFixed(1)} ` +
			`p95=${p95.toFixed(1)} max=${gapSorted[SUMMARY_FRAMES - 1].toFixed(1)} | ` +
			`dropped>1.5x: ${dropped} (${((dropped / SUMMARY_FRAMES) * 100).toFixed(1)}%) ` +
			`| >2.5x: ${bad}`
	);
}

export default function createAnimation(step) {
	let then = 0.0;
	let smoothedDt = 0.0;
	let lastStepMs = 0.0;
	let lastWall = 0.0;
	let lastTicks = 0;
	let frameCount = 0;

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
			// The gap measured on THIS frame spans from the previous frame's start,
			// so the work that could have caused it is the PREVIOUS step, not this one.
			const t0 = performance.now();
			state = step(smoothedDt, now);
			const stepMs = performance.now() - t0;
			if (gapMs > LONG_FRAME_MS) {
				// Multi-second gaps with a ~1ms step mean rAF simply was not called,
				// which nothing inside this app can cause. These three tell us why:
				//   visibility=hidden  -> the tab was backgrounded; rAF is throttled to
				//                         a stop by design, and the freeze is expected.
				//   focus=false        -> the window was behind another; Chrome can
				//                         treat it as occluded and stop painting.
				//   drift              -> (wall clock elapsed) - (rAF timestamp gap).
				//                         Near zero means the browser was awake and
				//                         genuinely withheld the frame (compositor/GPU
				//                         stall or CPU starvation). A large value means
				//                         rAF itself was being throttled.
				const wallMs = performance.now() - lastWall;
				console.warn(
					`[hitch] t=${now.toFixed(1)}s gap=${gapMs.toFixed(1)}ms ` +
						`prevStep=${lastStepMs.toFixed(1)}ms ` +
						`unaccounted=${(gapMs - lastStepMs).toFixed(1)}ms ` +
						`visibility=${document.visibilityState} ` +
						`focus=${document.hasFocus()} ` +
						`drift=${(wallMs - gapMs).toFixed(1)}ms ` +
						`timerTicks=${timerTicks - lastTicks}/${Math.round(
							gapMs / TIMER_MS
						)}`
				);
			}
			// Skip the first frame (measured against then===0, so meaningless) and
			// the multi-second occlusion gaps, which would swamp max/p95.
			if (frameCount > 1 && gapMs < 1000) {
				gapSamples[sampleIdx++] = gapMs;
				if (sampleIdx === SUMMARY_FRAMES) {
					summariseFrameGaps();
					sampleIdx = 0;
				}
			}
			lastTicks = timerTicks;
			lastWall = performance.now();
			lastStepMs = stepMs;
		} else {
			state = step(smoothedDt, now);
		}

		if (!state.continueAnimation) return;

		requestAnimationFrame(render);
	};

	requestAnimationFrame(render);
}
