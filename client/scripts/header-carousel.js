// Header button row → scroll-snap carousel, but ONLY when the buttons genuinely
// do not fit. Keying off actual overflow rather than a device breakpoint means a
// narrow desktop window gets the same treatment a phone does, and a phone in
// landscape that has room does not pay for a carousel it does not need.
//
// Centring only MAGNIFIES. It never activates anything. With snap scrolling you
// must pass through the buttons between you and your target, so "centre selects"
// would mean scrolling from Draw to Submit silently leaves you holding the
// eraser. Every action stays a deliberate tap.

// A narrow band at the middle of the row. A button overlapping it is "centred".
// Buttons are far wider than 4% of the row, so at most one ever matches.
const CENTRE_BAND = "0px -48% 0px -48%";

export default function initHeaderCarousel(doc = document) {
	const nav = doc.querySelector("header nav");
	if (!nav) return;

	const items = Array.from(nav.children).filter((el) => el.nodeType === 1);
	if (items.length === 0) return;

	let observer = null;

	const centre = (el) => {
		if (!el) return;
		// Compute the scroll position directly rather than using scrollIntoView,
		// which can also scroll the page/document when the target is nested.
		nav.scrollLeft = el.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2;
	};

	const enable = () => {
		if (observer) return;
		nav.classList.add("is-carousel");
		observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					entry.target.classList.toggle("is-centered", entry.isIntersecting);
				}
			},
			{ root: nav, rootMargin: CENTRE_BAND, threshold: 0 }
		);
		items.forEach((el) => observer.observe(el));
		// Open on the selected tool rather than an arbitrary edge, so the row
		// starts by showing what you are currently holding.
		requestAnimationFrame(() => centre(nav.querySelector(".active") || items[0]));
	};

	const disable = () => {
		if (!observer) return;
		observer.disconnect();
		observer = null;
		nav.classList.remove("is-carousel");
		items.forEach((el) => el.classList.remove("is-centered"));
		nav.scrollLeft = 0;
	};

	// Measure without the carousel's own styles interfering: `.is-carousel` adds
	// 50% spacers on both sides, so once enabled the row ALWAYS overflows and the
	// check would never turn itself back off. Drop the class, measure, restore.
	const overflows = () => {
		const wasCarousel = nav.classList.contains("is-carousel");
		if (wasCarousel) nav.classList.remove("is-carousel");
		const doesOverflow = nav.scrollWidth > nav.clientWidth + 1;
		if (wasCarousel) nav.classList.add("is-carousel");
		return doesOverflow;
	};

	const sync = () => (overflows() ? enable() : disable());

	// Tapping a button centres it — confirms the tap and keeps the row anchored
	// on whatever you just did.
	nav.addEventListener("click", (event) => {
		const item = items.find((el) => el.contains(event.target));
		if (item && nav.classList.contains("is-carousel")) centre(item);
	});

	// Re-evaluate when the available width changes: rotation, window resize, or
	// the title text changing length (the simulate page sets it from the drawing).
	if (typeof ResizeObserver !== "undefined") {
		new ResizeObserver(sync).observe(nav.parentElement || nav);
	} else {
		window.addEventListener("resize", sync);
	}

	sync();
}
