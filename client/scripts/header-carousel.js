// Header button row → scroll carousel, but ONLY when the buttons genuinely do
// not fit. Keying off actual overflow rather than a device breakpoint means a
// narrow desktop window gets the same treatment a phone does, and a phone in
// landscape that has room does not pay for a carousel it does not need.
//
// Interaction is two-tap: a tap on an off-centre item CENTRES it, and a second
// tap on the now-centred item performs the action. Scrolling alone never
// activates anything — with a row you must scroll through, "centre selects"
// would mean travelling from Draw to Submit silently leaves you holding the
// eraser.

export default function initHeaderCarousel(doc = document) {
	const nav = doc.querySelector("header nav");
	if (!nav) return;

	const items = Array.from(nav.children).filter((el) => el.nodeType === 1);
	if (items.length === 0) return;

	let enabled = false;
	let focused = null;
	let frame = 0;

	const render = () => {
		for (const el of items) el.classList.toggle("is-centered", el === focused);
	};

	const setFocused = (el) => {
		if (el === focused) return;
		focused = el;
		render();
	};

	// The focus slot: the x within the row where the selected button sits.
	//
	// NOT the middle of the row — it sits just right of the title, so the active
	// button reads as attached to it. Sized from the widest item so even the
	// longest label clears the leading edge; narrower ones sit slightly further
	// in, since items are centred on the slot.
	const FOCUS_INSET = 6;
	const focusX = () => {
		let widest = 0;
		for (const el of items) widest = Math.max(widest, el.offsetWidth);
		return widest / 2 + FOCUS_INSET;
	};

	// Which item occupies the focus slot — clamped at the scroll extremes.
	//
	// There are no spacers beside the row (they were a half-row of dead space and
	// showed up as a gap between the title and the first button), so the first and
	// last items physically CANNOT reach the centre. Without the clamp the ends
	// would never be focusable and a third of the buttons would be unusable. At
	// either extreme the end item takes focus even though it sits off-centre.
	const focusFromScroll = () => {
		const maxScroll = nav.scrollWidth - nav.clientWidth;
		if (nav.scrollLeft <= 1) return items[0];
		if (nav.scrollLeft >= maxScroll - 1) return items[items.length - 1];

		const slot = nav.scrollLeft + focusX();
		let closest = items[0];
		let closestDistance = Infinity;
		for (const el of items) {
			const distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - slot);
			if (distance < closestDistance) {
				closestDistance = distance;
				closest = el;
			}
		}
		return closest;
	};

	let settleTimer = 0;
	let pointerDown = false;
	let lastMoveAt = 0;
	let suppressSettleUntil = 0;

	// scrollLeft that puts `el` on the focus slot. Shared so settle can ask
	// "already parked?" using the same arithmetic centre() would apply.
	const scrollLeftFor = (el) => el.offsetLeft - (focusX() - el.offsetWidth / 2);
	// How long a gesture may sit motionless before settle stops waiting for a
	// release it may never get. Long enough not to fire mid-drag, short enough
	// that a dropped touchend costs one beat rather than the session.
	const STALE_GESTURE_MS = 500;

	const settle = () => {
		// Defer while the finger is still working the row: the timer keys off the
		// scroll stopping, and a slow drag that pauses stops scrolling without
		// ending the gesture, so settling there re-centres under the user.
		//
		// The staleness check is what makes this safe. An earlier version deferred
		// on pointerDown alone, so a release event that never arrived left settle
		// rescheduling itself every 140ms — the carousel silently stopped settling
		// for the rest of the session.
		if (pointerDown && performance.now() - lastMoveAt < STALE_GESTURE_MS) {
			settleTimer = setTimeout(settle, 140);
			return;
		}
		// Don't interrupt a programmatic glide — settling mid-animation would snap
		// to whatever item happened to be passing the slot at that instant.
		if (performance.now() < suppressSettleUntil) return;

		// Snap to whatever is AT the slot, which is exactly what the highlight has
		// been showing throughout the scroll.
		//
		// This used to cap the landing at how far the finger travelled, to stop
		// momentum overshooting. That cap fought the user rather than helping: the
		// row highlights the item at the slot live, so capping moved you somewhere
		// other than the button you just watched light up — worst on a fast flick,
		// where momentum and finger distance diverge most. The cap existed to stop
		// CSS scroll-snap skipping buttons, and CSS snapping is long gone.
		const target = focusFromScroll();
		setFocused(target);
		if (Math.abs(nav.scrollLeft - scrollLeftFor(target)) > 1) centre(target);
	};

	const onScroll = () => {
		clearTimeout(settleTimer);
		// Fires once the scroll has actually stopped, momentum included.
		settleTimer = setTimeout(settle, 140);
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			setFocused(focusFromScroll());
		});
	};

	// Edge padding sized so the FIRST and LAST items can be scrolled to the middle.
	// Without it their snap points land outside the scroll range (centring the
	// second item needed a negative scrollLeft), and scroll-snap-stop:always then
	// skips them — the "it's skipping Find and Draw" bug. Set as custom properties
	// so the padding applies only while `.is-carousel` is on, which keeps the
	// overflow measurement below from seeing padding it created itself.
	const sizeEdgePadding = () => {
		const first = items[0];
		const last = items[items.length - 1];
		// Enough space on each side for the end items to reach the focus slot.
		// The leading pad is now small (the slot is near the left), which also
		// removes most of the gap the centred version left beside the swatch.
		const start = Math.max(0, focusX() - first.offsetWidth / 2);
		const end = Math.max(0, nav.clientWidth - focusX() - last.offsetWidth / 2);
		nav.style.setProperty("--carousel-pad-start", `${Math.round(start)}px`);
		nav.style.setProperty("--carousel-pad-end", `${Math.round(end)}px`);
	};

	const centre = (el, smooth = true) => {
		if (!el) return;
		// Computed rather than scrollIntoView, which can also scroll the document
		// when the target is nested. The browser clamps to the valid range, so end
		// items land as close to the middle as they can get.
		//
		// Smoothness is requested PER CALL. Putting `scroll-behavior: smooth` on
		// the element applies it to the user's finger too, so touch momentum ends
		// up fighting the animation for the same scrollLeft — the erratic drag.
		const left = scrollLeftFor(el);
		if (smooth) suppressSettleUntil = performance.now() + 400;
		nav.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
	};

	// A drag that happens to end over a button still fires a click. Without this
	// the capture handler cannot tell a tap from the end of a swipe, so flicking
	// the row would "centre" whatever the finger lifted over.
	let pressX = 0;
	let pressY = 0;
	let dragged = false;
	const DRAG_SLOP = 8; // px of movement before a press stops counting as a tap

	// Gesture tracking runs on TOUCH events, not pointer events.
	//
	// The nav is natively scrolled (touch-action: pan-x), so the moment a finger
	// moves horizontally the browser claims the gesture and fires pointercancel —
	// after which no pointermove arrives at all — so a swipe looked like a
	// motionless press and was mistaken for a tap. touchmove keeps firing
	// throughout a native scroll, so tap-vs-drag is decided from it.
	const beginGesture = (x, y) => {
		lastMoveAt = performance.now();
		pressX = x;
		pressY = y;
		dragged = false;
		pointerDown = true;
	};

	const moveGesture = (x, y) => {
		const dx = Math.abs(x - pressX);
		lastMoveAt = performance.now();
		if (dx > DRAG_SLOP || Math.abs(y - pressY) > DRAG_SLOP) dragged = true;
	};

	nav.addEventListener(
		"touchstart",
		(event) => {
			const t = event.changedTouches[0];
			if (t) beginGesture(t.clientX, t.clientY);
		},
		{ passive: true }
	);

	nav.addEventListener(
		"touchmove",
		(event) => {
			const t = event.changedTouches[0];
			if (t) moveGesture(t.clientX, t.clientY);
		},
		{ passive: true }
	);

	// Mouse and pen only. A touch pointer duplicates the handlers above and its
	// stream is cut short by the scroll takeover, so letting it through would
	// overwrite a good touch measurement with a truncated one.
	const isTouch = (event) => event.pointerType === "touch";

	nav.addEventListener(
		"pointerdown",
		(event) => {
			if (isTouch(event)) return;
			beginGesture(event.clientX, event.clientY);
		},
		{ passive: true }
	);

	nav.addEventListener(
		"pointermove",
		(event) => {
			if (isTouch(event)) return;
			moveGesture(event.clientX, event.clientY);
		},
		{ passive: true }
	);

	const endPress = () => {
		if (!pointerDown) return;
		pointerDown = false;
		clearTimeout(settleTimer);
		settleTimer = setTimeout(settle, 140);
	};

	// On window, not nav: a fling often ends with the finger outside the row, and
	// a release missed there would strand the gesture.
	//
	// touchend — NOT pointercancel. The browser fires pointercancel the instant it
	// takes over the pan, long before the finger lifts, so treating it as a
	// release would end the gesture while it is still being made.
	window.addEventListener("touchend", endPress, { passive: true });
	window.addEventListener("touchcancel", endPress, { passive: true });
	window.addEventListener("pointerup", (event) => !isTouch(event) && endPress(), {
		passive: true,
	});

	// First tap centres, second tap acts. Capture phase so the app's own click
	// handlers (tool select, Clear, Submit…) never see the centring tap.
	const onClickCapture = (event) => {
		if (!enabled) return;
		if (dragged) {
			// Swallow the click that terminates a swipe: it was a scroll, not a tap.
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		const item = items.find((el) => el.contains(event.target));
		if (!item || item === focused) return; // already centred → let it through
		event.preventDefault();
		event.stopPropagation();
		// A tap is an explicit destination; nothing pending should redirect it.
		clearTimeout(settleTimer);
		setFocused(item); // set explicitly: an end item cannot be derived from scroll
		centre(item);
	};

	const enable = () => {
		if (enabled) return;
		enabled = true;
		nav.classList.add("is-carousel");
		sizeEdgePadding();
		nav.addEventListener("scroll", onScroll, { passive: true });
		// Open on the colour swatch when there is one, otherwise the selected tool.
		//
		// The swatch is the only control whose STATE you need to see rather than
		// just reach — it shows the colour you are about to draw with. Parked
		// anywhere but the focus slot it is scrolled out of sight on load, so the
		// page opens with no indication of the current colour. The selected tool
		// needs no such help: `.active` keeps it a filled dark pill wherever it
		// scrolls to.
		//
		// Deferred a frame because drawing.js marks the default tool active after
		// this module runs.
		requestAnimationFrame(() => {
			const start = nav.querySelector(".color-picker") || nav.querySelector(".active");
			if (start) centre(start, false);
			setFocused(start || focusFromScroll());
		});
	};

	const disable = () => {
		if (!enabled) return;
		enabled = false;
		nav.removeEventListener("scroll", onScroll);
		nav.classList.remove("is-carousel");
		focused = null;
		render();
		nav.scrollLeft = 0;
	};

	// Measure without the carousel's own styles interfering: `.is-carousel` adds
	// padding and scales the items, so measuring with it applied would skew the
	// decision to keep itself on.
	const overflows = () => {
		const wasCarousel = nav.classList.contains("is-carousel");
		if (wasCarousel) nav.classList.remove("is-carousel");
		const doesOverflow = nav.scrollWidth > nav.clientWidth + 1;
		if (wasCarousel) nav.classList.add("is-carousel");
		return doesOverflow;
	};

	const sync = () => {
		if (!overflows()) {
			disable();
			return;
		}
		if (enabled) sizeEdgePadding(); // width changed: re-measure the edges
		enable();
	};

	nav.addEventListener("click", onClickCapture, true);

	// Re-evaluate when available width changes: rotation, window resize, or the
	// title text changing length (simulate.html sets it from the drawing name).
	if (typeof ResizeObserver !== "undefined") {
		new ResizeObserver(sync).observe(nav.parentElement || nav);
	} else {
		window.addEventListener("resize", sync);
	}

	sync();
}
