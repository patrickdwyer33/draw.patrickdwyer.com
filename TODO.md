# TODO — draw.patrickdwyer.com

Live working file. Updated as work lands; newest findings at the top of each section.

---

## RESOLVED: simulation stutter — it was a clock bug, not a performance problem

**Root cause (round 7, `5bf63ab`):** `elapsedTime` was computed as
`now - startTime` — **wall clock**. It gates two batch behaviours: a ball starts
seeking once `elapsedTime` passes its `ballTimeouts` entry, and a ball is erased
(teleported to `-1000`) after seeking for 30 s.

Chrome stops calling `requestAnimationFrame` for an **occluded** window — switch to
another app and back and there is no frame for seconds or minutes, while
`document.visibilityState` still reports `"visible"` (which is why the visibility
flag never caught it). On the first frame after such a pause the wall clock had
leapt forward, so **every** ball whose timeout fell inside that window started
seeking at once and **every** ball whose seek window had expired was erased at once.
One frame, one enormous discontinuity — precisely the reported "super smooth for a
while, then a big stutter, just one frame jump, then mostly good again."

Fixed by accumulating `deltaTime`, which is already clamped to `MAX_DELTA_TIME`, so
a pause of any length now advances the simulation by at most one frame's worth —
exactly like the positions it drives.

**The five rounds of optimization before it were real but were not the fix.** They
took the frame from GC-thrashing to ~1 ms of a 16.7 ms budget, and that work is
worth keeping. But the symptom survived all of it because the symptom was never
about cost. The lesson: a hitch that recurs on an interval and leaves smooth
stretches between is a *discrete event*, and average frame cost cannot explain it.
Instrumenting the frame gap (`?debug`) answered in one run what four profiles could
not, because a ~10 s-interval event is nearly impossible to catch in a 9 s recording
and averages to nothing across it.

- [x] **Confirmed fixed.** The sim now resumes smoothly from where it was instead of
      lurching. That symptom is gone.

---

## Remaining work

Order agreed 2026-07-21: prod cutover first, then `vpc-cni`, then the rest.

### Worth doing

- [ ] **1. Prod cutover for `draw.patrickdwyer.com`** — the only substantial item.
      DNS for `draw` + `objects`, the prod Cloudflare Transform Rule (Request
      header, *not* Response), and committing `platform-gitops/apps/draw-prod.yaml`
      (deliberately uncommitted). Dev has been stable for days; nothing blocks this
      but the decision to do it.
- [ ] **3. Bring the Playwright touch harness into the repo as a real test.** Needs
      `playwright` as a dev dependency. It caught three defects `npm test`
      structurally cannot see, all in the same class: code that behaves correctly
      with a mouse and wrongly under a finger, because the browser cancels pointer
      events when it takes over a pan. Scripts currently live only in the session
      scratchpad and will be lost.
- [ ] **4. `platform-gitops/deploy` masks AWS errors as "tag not found".** The
      `describe-images` check pipes stderr to `/dev/null`, so expired credentials, a
      wrong region, or a network failure all report `tag '<sha>' not found in ECR
      repo draw`. Hit twice during this work, in exactly the moment a straight
      answer was needed.
- [ ] **5. CI builds are not reproducible.** `package-lock.json` is both gitignored and
      dockerignored, so every Docker build resolves dependencies fresh — the CI
      bundle hash differs from a local build of identical source. Benign so far, but
      a breaking transitive update would land silently.

### Small / cosmetic

- [ ] **2. `vpc-cni` addon drift** reconcile on the cluster

### Explicitly NOT doing

- **Further simulation optimization.** The frame costs ~1 ms of an 8.3 ms budget
  with zero dropped frames in 13,500. The previously-listed ideas (typed arrays for
  `velocities`/`ballTimeouts`/flags, merging the four per-ball loops) would optimize
  a loop that is already ~6% of budget. Left here as rejected, not pending.
- **The `?debug` instrumentation.** Opt-in, costs nothing when off, and earned its
  keep repeatedly. Keep it.

---

## RESOLVED: the second stutter was Chrome, not the app

Distinct from the clock bug: it stuttered while watching continuously, never
switching away. Closed by a single observation — **Safari is completely smooth on
the same machine with the same drawing.** Same JS, same GPU, same canvas; the only
variable is the browser. Nothing in this repo is implicated.

That is consistent with everything measured: ~13,500 frames at a median 8.3 ms
(120 Hz ProMotion), **zero dropped**, max interval 9.4 ms, `prevStep ≈ 1 ms`. No
main-thread event existed that could produce a visible stutter — a JS hitch would
have had to appear as an interval above 9.4 ms, and across 110 s none did.
Everything left was downstream of handing off the frame: compositor, GPU, or
display, where JS instrumentation is structurally blind.

The "shake it up is running" hypothesis (a focused button re-firing on Space) was
also cleared: `[spike]` logging never fired, and `rescatterBalls` logs on every
invocation and stayed silent.

**Method note worth keeping.** Five rounds of profiling chased average frame cost
and never explained a symptom that was never about cost. What settled it in one run
was instrumenting the frame *gap* (`?debug`) rather than the frame *contents* — a
~10 s-interval event is nearly impossible to catch in a 9 s recording and averages
to nothing across it. Cross-browser comparison then cost one minute and answered
what four profiles could not.

---

## RESOLVED: mobile (2026-07-21)

The header and touch input were both broken on a phone, in ways that were invisible
on desktop.

- [x] **Drawing never worked on touch at all.** `drawing.js` bound mouse events
      only, and a finger produces no `mousedown`/`mousemove` drag — the swipe fell
      through to the browser and scrolled the page. Pointer events + `touch-action:
      none` + a viewport-locked `html, body`.
- [x] **Header carousel** for overflowing buttons, keyed off measured overflow
      rather than a breakpoint, so a narrow desktop window behaves like a phone and
      the simulate page gets it too. Two-tap semantics: an off-slot tap centres, a
      second tap acts. Focus slot sits beside the title; opens on the colour swatch,
      the one control whose *state* you must see rather than merely reach.
- [x] **Snap-back, three rounds.** Final cause: settle applied a one-step cap that
      discarded the live highlight. It now snaps to whatever `focusFromScroll()`
      reports — the same function driving the highlight — so the resting position is
      correct *by construction* rather than by two code paths agreeing. The cap
      itself was vestigial, left over from CSS scroll-snap that had already been
      deleted.
- [x] **Safari crash + cache bug** — 0x0 canvas before layout; desktop-sized
      `MAX_BALLS`; and HTML being served `max-age=0` because Express `send()`
      rewrites `Cache-Control` after `setHeaders` runs unless `cacheControl: false`.
- [x] **Eraser size picker** — three pink circles, fixed-position outside the nav so
      the scroll container cannot clip it. Surfaced a latent bug: `state.currentTool`
      was never assigned, so choosing a colour mid-erase turned the eraser into a pen.
- [x] **Loading overlay** on submit and find, held through the navigation and
      cleared on `pageshow`/persisted so a bfcache restore cannot strand it.

**Lesson.** Two "fixes" shipped that could not possibly have worked, because I was
verifying with a mouse. The bug class — the browser firing `pointercancel` and
cutting the event stream the moment it claims a pan — is invisible on desktop by
construction. Touch emulation found both in minutes.

---

## Deferred (agreed, not urgent)

- [ ] **Prod cutover for `draw.patrickdwyer.com`**: DNS for `draw` + `objects`,
      the prod Cloudflare Transform Rule (Request header, *not* Response), and
      committing `platform-gitops/apps/draw-prod.yaml` (deliberately uncommitted today).
- [ ] `vpc-cni` addon drift reconcile on the cluster
