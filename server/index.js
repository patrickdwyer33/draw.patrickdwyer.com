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
	// Production: serve the static build. The bug this fixes: the old code mounted
	// the client ONLY in development, so a prod container served /api and nothing else.
	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	const dist = path.join(__dirname, "../client/dist");
	app.use(express.static(dist));
	app.use((_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, HOST, () => console.log(`Server running at ${HOST}:${PORT} (${ENV})`));
