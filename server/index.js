import express from "express";
import { createServer } from "vite";
import { appRoutes } from "./routes.js";

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ENV = process.env.NODE_ENV || "development";
const API_ROOT = process.env.API_ROOT || "/api";
const MAX_PAYLOAD_SIZE = process.env.MAX_PAYLOAD_SIZE || "200mb";

// Middleware for parsing JSON and urlencoded data
app.use(express.json({ limit: MAX_PAYLOAD_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_PAYLOAD_SIZE }));

// API routes
app.use(API_ROOT, appRoutes);

// Development mode with Vite middleware
if (ENV === "development") {
	const vite = await createServer({
		server: { middlewareMode: true },
		appType: "mpa",
		base: "/client",
		root: "client",
	});
	app.use(vite.middlewares);
}

app.listen(PORT, HOST, () => {
	console.log(`Server running at: \n\n${HOST}:${PORT}`);
});
