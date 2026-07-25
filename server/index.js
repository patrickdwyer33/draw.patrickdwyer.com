import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { appRoutes } from "./routes.js";

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ENV = process.env.NODE_ENV || "development";
const API_ROOT = process.env.API_ROOT || "/api";

app.use(API_ROOT, appRoutes);

if (ENV === "development") {
	const { createServer } = await import("vite");
	const vite = await createServer({
		server: { middlewareMode: true },
		appType: "mpa",
		base: "/client",
		root: "client",
	});
	app.use(vite.middlewares);
} else {
	// Production: serve the static build (dev serves the client via Vite above).
	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	const dist = path.join(__dirname, "../client/dist");
	// Cache policy, split by what the filename guarantees.
	//
	// Vite fingerprints bundles (main-D4VH3bq2.js), so their contents can never
	// change under a given name — cache them for a year, immutable. HTML is the
	// opposite: it is the index naming WHICH bundle to load, so a stale copy pins
	// a visitor to old code indefinitely, hence no-cache/revalidate on HTML.
	// cacheControl:false is REQUIRED. Express's send() writes its own Cache-Control
	// from its maxAge option AFTER setHeaders/headers run, silently clobbering ours
	// (the first attempt at this fix looked correct and still shipped max-age=0).
	// Turning it off leaves the header entirely to us.
	const sendHtml = (res, file) =>
		res.sendFile(path.join(dist, file), {
			cacheControl: false,
			headers: { "Cache-Control": "no-cache" }, // revalidate every time
		});

	app.use(
		express.static(dist, {
			cacheControl: false,
			setHeaders: (res, filePath) => {
				if (filePath.endsWith(".html")) {
					res.setHeader("Cache-Control", "no-cache");
				} else if (/-[A-Za-z0-9_-]{8,}\.[a-z]+$/.test(filePath)) {
					res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
				}
			},
		})
	);
	// This is a MULTI-PAGE app. The client navigates to /simulate (no extension), so
	// map it to the built simulate.html — otherwise it falls through to the drawing
	// page (index.html) and its simulation-canvas is absent (getContext on null).
	// Keep in sync with vite.config.js build.rollupOptions.input.
	app.get("/simulate", (_req, res) => sendHtml(res, "simulate.html"));
	// Anything else → the drawing page.
	app.use((_req, res) => sendHtml(res, "index.html"));
}

app.listen(PORT, HOST, () => console.log(`Server running at ${HOST}:${PORT} (${ENV})`));
