// Eraser size picker: a small popover of three circles, shown when the eraser
// is selected.
//
// Rendered as a FIXED-position element outside the nav, not a child of it. The
// header nav becomes a horizontal scroller on narrow screens (overflow-x:auto),
// and an absolutely positioned child of a scroll container is clipped by it —
// the popover would be sliced off or scroll away with the row. Positioning it
// against the button's viewport rect sidesteps the containing block entirely.

export const ERASER_SIZES = [
	{ name: "small", width: 8, dot: 10 },
	{ name: "medium", width: 22, dot: 18 },
	{ name: "large", width: 48, dot: 26 },
];

/**
 * @param doc {Document}
 * @param onSelect {(width: number) => void} called with the chosen stroke width
 * @returns {{ open: () => void, close: () => void, isOpen: () => boolean }}
 */
export default function initEraserSizePicker(doc, onSelect) {
	const button = doc.querySelector("#eraser-button");
	if (!button) return { open: () => {}, close: () => {}, isOpen: () => false };

	const popover = doc.createElement("div");
	popover.className = "eraser-sizes";
	popover.hidden = true;
	popover.setAttribute("role", "group");
	popover.setAttribute("aria-label", "Eraser size");

	let selected = ERASER_SIZES[1]; // medium

	const buttons = ERASER_SIZES.map((size) => {
		const el = doc.createElement("button");
		el.type = "button";
		el.className = "eraser-size";
		el.dataset.size = size.name;
		el.setAttribute("aria-label", `${size.name} eraser`);
		// The circle is the only label — a dot sized in proportion to the stroke.
		const dot = doc.createElement("span");
		dot.className = "eraser-dot";
		dot.style.width = `${size.dot}px`;
		dot.style.height = `${size.dot}px`;
		el.append(dot);
		el.addEventListener("click", (event) => {
			// The carousel's capture handler treats a tap on an off-slot item as a
			// centring tap. This popover is outside the nav, so it is not an item —
			// stop the event before anything else reinterprets it.
			event.stopPropagation();
			selected = size;
			onSelect(size.width);
			render();
			close();
		});
		popover.append(el);
		return el;
	});

	const render = () => {
		for (let i = 0; i < buttons.length; i++) {
			buttons[i].classList.toggle("is-selected", ERASER_SIZES[i] === selected);
		}
	};

	// Anchored to the button's viewport rect, then pulled back inside the window
	// if it would hang off an edge — on a phone the eraser can sit near either
	// end of the scrolled row.
	const position = () => {
		const rect = button.getBoundingClientRect();
		popover.style.visibility = "hidden";
		popover.hidden = false;
		const width = popover.offsetWidth;
		const margin = 6;
		let left = rect.left + rect.width / 2 - width / 2;
		left = Math.max(margin, Math.min(left, doc.documentElement.clientWidth - width - margin));
		popover.style.left = `${Math.round(left)}px`;
		popover.style.top = `${Math.round(rect.bottom + margin)}px`;
		popover.style.visibility = "";
	};

	const isOpen = () => !popover.hidden;

	const close = () => {
		popover.hidden = true;
	};

	const open = () => {
		render();
		position();
	};

	// Any interaction elsewhere dismisses it. Pointerdown rather than click so it
	// closes on the press that starts a stroke, not after it finishes.
	doc.addEventListener(
		"pointerdown",
		(event) => {
			if (!isOpen()) return;
			if (popover.contains(event.target) || button.contains(event.target)) return;
			close();
		},
		true
	);

	window.addEventListener("resize", () => isOpen() && position());
	// The row can be scrolled while the popover is open, taking the button with it.
	doc.querySelector("header nav")?.addEventListener("scroll", () => isOpen() && position(), {
		passive: true,
	});

	doc.body.append(popover);
	render();

	return { open, close, isOpen };
}
