# TODO — draw.patrickdwyer.com

Live working file. Updated as work lands; newest findings at the top of each section.

---

## Active: simulation stutter

**Symptom:** the `/simulate` animation stutters visibly. FPS reads a solid 60 and
the Frames track is green, so this is frame-*pacing* / cost-*spike* behaviour, not
a sustained framerate drop.

**Method:** each round has been driven by a DevTools Performance recording
(Bottom-up tab), and minified frame names are resolved by downloading the deployed
bundle and reading the exact `line:column` the profiler points at. No guessing.

### Profile history

| Round | Deployed | Top self-time entries | Outcome |
|---|---|---|---|
| 1 | — | `Major GC` 18.4%, RBush `compareMinY` 8.3% / `compareMinX` 7.8% / `search` 6.4% / `_all` 6.1% | RBush rebuild + its garbage dominated |
| 2 | `a369e82` | `findCollidingNeighbor` 38.8%, `updateAnimationState` 34.0%, `buildCollisionGrid` 6.3% | GC and **all** RBush entries gone; grid query became the new bottleneck |
| 3 | `0b308d3` | `updateAnimationState` 34.0%, *(extension 14.5%)*, `findCollidingNeighbor` 11.8%, `buildCollisionGrid` 5.8% | Query cost cut ~3.3x; `updateAnimationState` now #1 |

### Done

- [x] Clamp `deltaTime` (`MAX_DELTA_TIME = 1/30`) so one slow frame can't teleport balls
- [x] EMA-smooth the physics step (`DT_SMOOTHING = 0.1`) — rAF timestamps jitter even at a steady vsync
- [x] `MAX_BALLS` 5000 → 4000
- [x] `positions` as a reused `Float32Array` — kills the per-frame `bufferSubData` allocation
- [x] Reuse collision structures instead of reallocating per frame
- [x] **Replace the per-frame RBush rebuild with a uniform spatial grid** (`a369e82`) — removed Major GC and all RBush cost
- [x] **One-diameter cells + intrusive linked-list bucketing** (`0b308d3`) — bounds query cost under clustering
- [x] `finalPositionsMap` (`Map<number,[x,y]>`) → flat `Float32Array` — was 2 hash lookups + 2 derefs per ball per frame

### Round 4 — the actual periodic hitch (2026-07-20)

**Reported symptom, which reframed everything:** *"super smooth for a while on
startup and then like 10 seconds in it does a big stutter, but just one frame jump,
and then it's mostly good again."* Also reproduces **in incognito with extensions
disabled**, so the Claude-in-Chrome wrapper is not the cause (it is still real
overhead on the frame path, just not this).

An isolated hitch every ~10s with smooth stretches between is not a throughput
problem — average frame cost cannot produce it. It is the signature of a **major GC
pause**, which meant something was still allocating steadily.

**Found it:** `processCollision` returned a fresh `[v1x, v1y, v2x, v2y]` array that
the caller destructured — **one allocation per colliding pair per frame**, thousands
per second. Most died young, but steady promotion out of the young generation is
exactly what schedules a periodic major GC. Fixed by writing results directly into
`velocities`. Also hoisted `cos(phi)`/`sin(phi)`, which were each recomputed 4x.

Swept the whole per-frame path afterwards; the only other allocation was
`gl.clearColor(...clearColor)` (spread builds an iterator each frame), also removed.
`updateAnimationState`, `buildCollisionGrid`, `findCollidingNeighbor`,
`distanceToLineSegment` and `processCollision` now all scan clean — **the frame
should be allocation-free**.

- [x] `processCollision` writes in place instead of returning an array
- [x] Hoist repeated `Math.cos`/`Math.sin` in `processCollision`
- [x] Remove the `clearColor` spread
- [x] **Verified — and it was NOT enough.** Recording with Memory on showed the JS
      heap *still* climbing steadily and dropping vertically (a live sawtooth,
      4.1 → 5.1 MB across the window). So something was still allocating.

### Round 5 — the sweep missed a file (2026-07-20)

The round-4 allocation sweep only scanned `simulation.js`. The remaining per-frame
allocation was in **`animate.js`**: `createAnimation(fn, ...args)` calling
`fn(deltaTime, now, ...args)` spread a 6-element array into a call **on every
frame**. Fixed by taking a closure bound once at the call site.

Re-swept *every* module on the frame path (`animate`, `buffers`, `init`, `shaders`).
All remaining hits are one-time init or debug-only. The frame path is now genuinely
allocation-free.

- [x] `createAnimation` takes a closure; no per-frame spread
- [x] Swept all frame-path modules, not just `simulation.js`

**But note the profile Summary: Scripting 1,039 ms out of 20,453 ms — the main
thread is ~95% idle.** A "big stutter" is therefore unlikely to be our JS at all.

### Round 5 instrumentation — stop guessing

Added opt-in frame diagnostics behind `?debug`:

    https://dev.draw.patrickdwyer.com/simulate?title=face&debug

Any frame whose wall-clock gap exceeds 50 ms logs:

    [hitch] t=12.3s gap=210.4ms prevStep=3.1ms unaccounted=207.3ms

**`unaccounted` is the decisive number.** It is the frame gap minus the time our own
`step()` actually ran (measured on the previous frame, which is the one that could
have caused the gap).

- **`unaccounted` large, `prevStep` small** → the stall is NOT our code. GC, the
  compositor, or the GPU. Optimizing the sim loop further is wasted effort; look at
  canvas backing size / `devicePixelRatio`, or accept GC and reduce heap churn
  elsewhere.
- **`prevStep` large** → it *is* our code, and we know which frame to zoom into.

- [ ] **Run with `&debug` through at least one hitch and report the console lines.**

### Next up

- [ ] **Typed arrays for the remaining per-ball state.** `positions` is a `Float32Array`
      but `velocities` is a plain JS `Array`, as are `ballTimeouts`,
      `ballSeekingStartTime`, `ballStuck`, `ballErased`. Every hot loop in
      `updateAnimationState` touches them. → `Float32Array` for velocities/timeouts,
      `Uint8Array` for the two boolean flags.
- [ ] **Merge the four per-ball loops** in `updateAnimationState` (wall bounce,
      collision pairing, seek/timeout, integrate). Four passes over the same arrays
      means four traversals of the same memory; one pass is better for cache locality.
      Care needed: collision pairing must still see all positions from *before*
      integration, so the merge is not unconditional — verify ordering semantics.

### Open questions / confounds

- [ ] **HIGHEST VALUE NEXT TEST — a browser extension is on the frame critical path.**
      Sorting the round-3 profile by Total time exposes the call chain:

      ```
      Animation frame fired            491.5 ms total,  15.2 ms self
        └─ agent-visual-indicator.js   484.0 ms total,  91.0 ms self   <- Claude in Chrome
             └─ s (our rAF callback)   354.1 ms total,  14.8 ms self
                  └─ updateAnimationState  326.9 ms total, 212.5 ms self
      ```

      Our animation callback is *nested inside* the extension's function call, which
      means the extension patches `requestAnimationFrame`. It burns **91 ms of self
      time (14.5%)** per selection, between vsync and our physics, and it is the
      second-largest self-time entry in the profile. Per-frame variance there lands
      directly as frame-pacing jitter.

      **Test: re-record in incognito / a clean profile with extensions disabled.**
      Until that is done, every percentage above is distorted and it is unknown how
      much of the remaining stutter is ours at all.
- [ ] **Is the remaining stutter even CPU-bound?** The GPU track runs solid green for
      the whole recording. Worth checking canvas backing size (`devicePixelRatio` on a
      retina display can make a "full screen" canvas 4x the pixels) before assuming
      more JS optimization will help.
- [ ] Consider whether EMA dt smoothing is still the right call, or whether a fixed
      timestep with an accumulator would pace more evenly.

---

## Deferred (agreed, not urgent)

- [ ] **Prod cutover for `draw.patrickdwyer.com`**: DNS for `draw` + `objects`,
      the prod Cloudflare Transform Rule (Request header, *not* Response), and
      committing `platform-gitops/apps/draw-prod.yaml` (deliberately uncommitted today).
- [ ] White-thresholding of antialiased grey balls
- [ ] `vpc-cni` addon drift reconcile on the cluster

## Papercuts worth fixing

- [ ] **`platform-gitops/deploy` masks AWS errors as "tag not found".** The
      `describe-images` check pipes stderr to `/dev/null`, so expired credentials,
      a wrong region, or a network failure all report `tag '<sha>' not found in ECR
      repo draw`. Misleading in exactly the moment you need a straight answer.
- [ ] **CI builds are not reproducible.** `package-lock.json` is both gitignored and
      dockerignored, so every Docker build resolves dependencies fresh — the CI bundle
      hash differs from a local build of identical source. Benign so far, but it means
      a breaking transitive update could land silently.
