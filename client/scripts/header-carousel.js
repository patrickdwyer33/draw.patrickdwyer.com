// Header button row → scroll carousel, but ONLY when the buttons genuinely do
// not fit. Keying off actual overflow rather than a device breakpoint means a
// narrow desktop window gets the same treatment a phone does, and a phone in
// landscape that has room does not pay for a carousel it does not need.
//
// Centring only MAGNIFIES and underlines. It never activates anything. With
// snap scrolling you must pass through the buttons between you and your target,
// so "centre selects" would mean scrolling from Draw to Submit silently leaves
// you holding the eraser. Every action stays a deliberate tap.

export default function initHeaderCarousel(doc = document) {
	const nav = doc.querySelector("header nav");
	if (!nav) return;

	const items = Array.from(nav.children).filter((el) => el.nodeType === 1);
	if (items.length === 0) return;

	let enabled = false;
	let frame = 0;

	// Mark whichever item is nearest the middle of the visible row.
	//
	// This replaced an IntersectionObserver watching a narrow band at the centre.
	// That approach needs 50%-wide spacers at both ends so the first and last
	// items can physically reach the middle — and those spacers ARE a half-row of
	// empty space, which is what showed up as a big gap between the title and the
	// colour swatch. Without them nothing can occupy the exact centre at the
	// scroll extremes, so "is it in the centre band?" becomes "which is closest?",
	// which degrades correctly at both ends.
	const markCentred = () => {
		const middle = nav.scrollLeft + nav.clientWidth / 2;
		let closest = null;
		let closestDistance = Infinity;
		for (const el of items) {
			const distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - middle);
			if (distance < closestDistance) {
				closestDistance = distance;
				closest = el;
			}
		}
		for (const el of items) el.classList.toggle("is-centered", el === closest);
	};

	const scheduleMark = () => {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			markCentred();
		});
	};

	const centre = (el) => {
		if (!el) return;
		// Computed directly rather than via scrollIntoView, which can also scroll
		// the document when the target is nested. The browser clamps to the valid
		// scroll range, so end items simply land as close as they can.
		nav.scrollLeft = el.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2;
	};

	const enable = () => {
		if (enabled) return;
		enabled = true;
		nav.classList.add("is-carousel");
		nav.addEventListener("scroll", scheduleMark, { passive: true });
		// Open on the selected tool rather than an arbitrary edge. Deferred a frame
		// because drawing.js marks the default tool active after this module runs.
		requestAnimationFrame(() => {
			centre(nav.querySelector(".active"));
			markCentred();
		});
	};

	const disable = () => {
		if (!enabled) return;
		enabled = false;
		nav.removeEventListener("scroll", scheduleMark);
		nav.classList.remove("is-carousel");
		items.forEach((el) => el.classList.remove("is-centered"));
		nav.scrollLeft = 0;
	};

	// Measure without the carousel's own styles interfering: `.is-carousel` adds
	// horizontal padding and scaling, so measuring with it applied would skew the
	// decision to keep itself on.
	const overflows = () => {
		const wasCarousel = nav.classList.contains("is-carousel");
		if (wasCarousel) nav.classList.remove("is-carousel");
		const doesOverflow = nav.scrollWidth > nav.clientWidth + 1;
		if (wasCarousel) nav.classList.add("is-carousel");
		return doesOverflow;
	};

	const sync = () => (overflows() ? enable() : disable());

	// Tapping centres what you tapped — confirms the tap and keeps the row
	// anchored on whatever you just did.
	nav.addEventListener("click", (event) => {
		if (!enabled) return;
		const item = items.find((el) => el.contains(event.target));
		if (item) centre(item);
	});

	// Re-evaluate when available width changes: rotation, window resize, or the
	// title text changing length (simulate.html sets it from the drawing name).
	if (typeof ResizeObserver !== "undefined") {
		new ResizeObserver(sync).observe(nav.parentElement || nav);
	} else {
		window.addEventListener("resize", sync);
	}

	sync();
}
