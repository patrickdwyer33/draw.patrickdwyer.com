# REFILL BALLS + header title centering — Design

Two changes to the simulate page (`/simulate`).

## 1. Title vertical centering (CSS)

The header is `display: flex` with no `align-items`, so children stretch to header
height and the `<h1 id="drawing-title">` text sits at the top while the buttons look
centered. **Fix:** add `align-items: center` to the `header` rule in
`client/styles/main.css`. Layout is otherwise unchanged (title on the left, `<nav>`
buttons to its right). This is a one-line change.

## 2. REFILL BALLS button + behavior

### The simulation, briefly
Each ball starts at a random position with a random velocity and bounces. After a
random 30–120s timeout it **seeks** its target pixel (`finalPositionsMap`). If it
reaches the target it **sticks** (`ballStuck[i] = true`, frozen). If it seeks for
>30s without arriving it is **erased** (`ballErased[i] = true`, moved off-screen).
The finished drawing is the stuck balls; the gaps are the erased ones.

`SHAKE IT UP` re-scatters non-stuck, **non-erased** balls (fresh random
position/velocity/timeout) — erased balls stay dead, and are added to the
collision-avoidance tree so re-scattered balls don't land on them.

### REFILL BALLS
Same as SHAKE IT UP **plus reviving the erased balls**: every non-stuck ball
(moving *or* erased) gets a fresh random start and another chance to seek and stick.
Stuck balls stay frozen. Over repeated refills, more balls stick → the drawing gets
denser / higher-fidelity.

### Refactor: extract `rescatterBalls`
SHAKE IT UP and REFILL are the same ~40-line re-scatter block differing only in
whether an erased ball is revived. Extract:

```
rescatterBalls(state, gl, n, { reviveErased })
```

- Builds the collision-avoidance `RBush` tree from the balls that must be avoided:
  when `reviveErased` is false → stuck AND erased balls; when true → stuck balls only
  (erased ones are being revived, so they'll move).
- For each eligible ball (`!ballStuck[i]`, and skipping erased unless `reviveErased`):
  when `reviveErased`, set `ballErased[i] = false`; reset `ballSeekingStartTime[i] = -1`;
  set `ballTimeouts[i] = elapsedTime + (30 + Math.random()*90)`; place at a new
  non-colliding random position; assign a new random velocity (same formulas as today).

`SHAKE IT UP` → `rescatterBalls(state, gl, n, { reviveErased: false })`
`REFILL BALLS` → `rescatterBalls(state, gl, n, { reviveErased: true })`

### Wiring
- `simulation.js`: add `state.shouldRefillBalls = false`; a `refillBalls = () => { state.shouldRefillBalls = true; }`; return `{ shakeItUp, refillBalls }`. In
  `updateAnimationState`, handle the `shouldRefillBalls` flag (like `shouldShakeItUp`)
  by calling `rescatterBalls(..., { reviveErased: true })` then clearing the flag.
- `simulate.html`: add `<button id="refill-balls-button" type="button" aria-label="Refill balls">REFILL BALLS</button>` at the end of `<nav>`.
- `main.js` `/simulate` route: `document.getElementById("refill-balls-button")?.addEventListener("click", () => simulation?.refillBalls?.())`.

## Files touched
- `client/styles/main.css` (align-items)
- `client/scripts/webgl/simulation.js` (extract `rescatterBalls`, add refill flag/trigger/handler)
- `client/simulate.html` (button)
- `client/scripts/main.js` (wire button)

## Testing
No unit-test framework covers the WebGL sim; verify by deploying and: SHAKE IT UP
still behaves as before (erased balls stay dead), REFILL revives erased balls and
re-scatters all non-stuck balls, stuck balls stay put, title is vertically centered.

## Out of scope
Ball color/antialiasing, the white-thresholding idea, any change to stick/erase
timing.
