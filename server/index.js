import express from "express";
import { createServer } from "vite";

// import { fileURLToPath } from "url";
// import { dirname } from "path";
// const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ENV = process.env.NODE_ENV || "development";

// Middleware for parsing JSON and urlencoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.get("/api/health", (_, res) => {
	res.json({ status: "ok" });
});

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
	console.log(`Server running on port ${PORT}`);
});
