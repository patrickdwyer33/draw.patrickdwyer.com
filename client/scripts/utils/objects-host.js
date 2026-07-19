// The CDN host that serves drawings, derived from where the app is running.
//   dev.draw.patrickdwyer.com -> https://objects.dev.patrickdwyer.com
//   draw.patrickdwyer.com     -> https://objects.patrickdwyer.com
//   localhost (dev)           -> "" (same-origin; local dev has no CDN)
export function objectsBase() {
	const h = window.location.hostname;
	if (h === "dev.draw.patrickdwyer.com") return "https://objects.dev.patrickdwyer.com";
	if (h === "draw.patrickdwyer.com") return "https://objects.patrickdwyer.com";
	return ""; // local dev: reads fall back to same origin (see B6 note)
}
