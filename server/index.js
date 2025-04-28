import express from "express";
import { createServer } from "vite";
import { appRoutes } from "./routes.js";

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ENV = process.env.NODE_ENV || "development";
const API_ROOT = process.env.API_ROOT || "/api";

// Middleware for parsing JSON and urlencoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
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
