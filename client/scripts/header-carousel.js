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

	// Which item is "in the middle" — clamped at the scroll extremes.
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

		const middle = nav.scrollLeft + nav.clientWidth / 2;
		let closest = items[0];
		let closestDistance = Infinity;
		for (const el of items) {
			const distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - middle);
			if (distance < closestDistance) {
				closestDistance = distance;
				closest = el;
			}
		}
		return closest;
	};

	const onScroll = () => {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			setFocused(focusFromScroll());
		});
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
		const left = el.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2;
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
		nav.addEventListener("scroll", onScroll, { passive: true });
		// Open on the selected tool rather than an arbitrary edge. Deferred a frame
		// because drawing.js marks the default tool active after this module runs.
		requestAnimationFrame(() => {
			const active = nav.querySelector(".active");
			if (active) centre(active, false);
			setFocused(active || focusFromScroll());
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

	const sync = () => (overflows() ? enable() : disable());

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
