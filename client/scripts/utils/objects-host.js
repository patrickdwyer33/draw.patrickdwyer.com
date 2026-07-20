// The CDN host that serves drawings, derived from where the app is running.
//   dev.draw.patrickdwyer.com -> https://objects-dev.patrickdwyer.com
//   draw.patrickdwyer.com     -> https://objects.patrickdwyer.com
//   localhost (dev)           -> "" (same-origin; local dev has no CDN)
//
// Objects hosts are SINGLE-LEVEL subdomains on purpose: they're Cloudflare-proxied,
// so TLS is served by Cloudflare's edge cert. Free Universal SSL covers the apex and
// *.patrickdwyer.com (one level) but NOT *.dev.patrickdwyer.com — so a two-level name
// like objects.dev.patrickdwyer.com fails the TLS handshake. objects-dev is covered.
export function objectsBase() {
	const h = window.location.hostname;
	if (h === "dev.draw.patrickdwyer.com") return "https://objects-dev.patrickdwyer.com";
	if (h === "draw.patrickdwyer.com") return "https://objects.patrickdwyer.com";
	return ""; // local dev: reads fall back to same origin (see B6 note)
}
