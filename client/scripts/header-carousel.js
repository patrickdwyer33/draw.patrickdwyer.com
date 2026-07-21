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

	// One swipe = one button, enforced rather than requested.
	//
	// CSS snapping alone cannot guarantee this when the buttons are different
	// widths: the browser picks a fling distance from velocity, so the same swipe
	// that advances one button past a wide "Submit" carries two past a narrow
	// "Find". That is why specific buttons were consistently skipped — the ones
	// with short labels sitting next to long ones.
	//
	// So: remember which button we started on, and once the scroll settles, if it
	// travelled more than one step, walk it back to exactly one. Deterministic
	// regardless of widths, momentum, or browser snapping quirks.
	let pressIndex = -1;
	let settleTimer = 0;

	const settle = () => {
		if (pressIndex < 0) return;
		let landed = items.indexOf(focusFromScroll());
		const delta = landed - pressIndex;
		// Cap the gesture at one step, then always park on the slot: with CSS
		// snapping removed this pass is what makes the scroll come to rest
		// somewhere deliberate rather than wherever momentum ran out.
		if (Math.abs(delta) > 1) landed = pressIndex + Math.sign(delta);
		const target = items[landed];
		setFocused(target);
		centre(target);
		pressIndex = -1;
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
		const left = el.offsetLeft - (focusX() - el.offsetWidth / 2);
		nav.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
	};

	// A drag that happens to end over a button still fires a click. Without this
	// the capture handler cannot tell a tap from the end of a swipe, so flicking
	// the row would "centre" whatever the finger lifted over.
	let pressX = 0;
	let pressY = 0;
	let dragged = false;
	const DRAG_SLOP = 8; // px of movement before a press stops counting as a tap

	nav.addEventListener(
		"pointerdown",
		(event) => {
			pressX = event.clientX;
			pressY = event.clientY;
			dragged = false;
			// Where this gesture began, so settle() can cap it at one step.
			pressIndex = items.indexOf(focused);
		},
		{ passive: true }
	);

	nav.addEventListener(
		"pointermove",
		(event) => {
			if (
				Math.abs(event.clientX - pressX) > DRAG_SLOP ||
				Math.abs(event.clientY - pressY) > DRAG_SLOP
			) {
				dragged = true;
			}
		},
		{ passive: true }
	);

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
