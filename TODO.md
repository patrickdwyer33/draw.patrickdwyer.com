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

- [x] **1. Prod cutover for `draw.patrickdwyer.com`** — DONE 2026-07-21. Live and
      verified end-to-end: health/index/simulate 200, TLS issued, origin lock 403
      on direct S3, prod Transform Rule confirmed (200 MISS→HIT with correct cache
      headers), and a real user drawing (`first.bin`) round-tripped. Two things bit
      us: `apps/draw-prod.yaml` had been committed inadvertently 21h earlier
      (pinned to `PLACEHOLDER_SHA` → ImagePullBackOff + a stuck ACME solver), and
      CoreDNS had cached the pre-DNS NXDOMAIN so cert-manager's HTTP-01 self-check
      failed until CoreDNS was restarted. `deploy` gained a `--prod` flag.
- [x] **3. `platform-gitops/deploy` masks AWS errors as "tag not found"** — DONE
      2026-07-22 (`ca91671`). Preflight `sts get-caller-identity` up front, and the
      existence check now classifies describe-images stderr (ImageNotFound → "tag
      not found"; anything else printed verbatim, labelled NOT a missing tag).
      `classify_ecr_error` factored out pure + unit-tested. Verified live: an
      expired session now says so instead of blaming a missing tag.
- [x] **4. CI builds are not reproducible** — DONE 2026-07-22 (`25398d3`). Committed
      the lockfile (un-git/dockerignored), added cross-platform optionalDependencies
      for the native rollup/esbuild binaries (musl for the alpine image), and
      switched both Dockerfile stages to `npm ci`. Verified: two --no-cache
      linux/amd64 builds of identical source now produce byte-identical bundle
      hashes, and CI is green. Maintenance tail: a vite bump must update the pinned
      rollup/esbuild versions in optionalDependencies or `npm ci` fails the lock
      sync check (intentional — cannot drift silently).

### Small / cosmetic

- [x] **2. `vpc-cni` addon drift** — DONE 2026-07-21. Applied `substrate/` locally,
      targeted to the addon only: `v1.22.3-eksbuild.1` → `v1.22.4-eksbuild.3`,
      in-place, `aws-node` DaemonSet rolled clean, both nodes stayed Ready, prod
      kept serving. The "drift" is structural, not a fault: the config pins no
      addon versions (a `data.aws_eks_addon_version` most-recent lookup), so every
      plan shows the installed build trailing the newest AWS publishes.

      **Follow-ups, both DONE 2026-07-23:**
      - `kube-proxy` `eksbuild.13` → `.17` — applied in-place, ACTIVE, no issues.
      - node group `release_version` `1.62.1` → `1.63.0` (Bottlerocket AMI) — rolled;
        both nodes now Bottlerocket 1.63.0 / kubelet v1.33.12, apps stayed 1/1, dev
        + prod kept serving 200. Left a note: a full substrate `terraform plan` now
        shows two stale OUTPUTS (`draw_objects_role_arn`, `cf_origin_secret`) wanting
        to go null — they were moved to the app-infra layer in an earlier refactor
        and linger in substrate state. Harmless (touches no infra), not applied.

### Explicitly NOT doing

- **Further simulation optimization.** The frame costs ~1 ms of an 8.3 ms budget
  with zero dropped frames in 13,500. The previously-listed ideas (typed arrays for
  `velocities`/`ballTimeouts`/flags, merging the four per-ball loops) would optimize
  a loop that is already ~6% of budget. Left here as rejected, not pending.
- **The `?debug` instrumentation.** Opt-in, costs nothing when off, and earned its
  keep repeatedly. Keep it.
- **2-replica + PodDisruptionBudget for `draw`.** Considered 2026-07-23 for
  zero-downtime node rolls; declined 2026-07-25. The app is stateless (S3-backed)
  so it would be safe, but a rare few-second blip on prod during infrequent node
  rolls / spot interruptions is acceptable for a personal site, and it isn't worth
  a permanently-doubled pod footprint. Revisit only if maintenance blips become a
  real annoyance.

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
