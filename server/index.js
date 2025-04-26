import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const ENV = process.env.NODE_ENV || "development";

// Middleware for parsing JSON and urlencoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Development mode with Vite middleware
if (ENV !== "production") {
	const vite = await createServer({
		server: { middlewareMode: true },
		appType: "mpa",
		base: "/",
		root: join(__dirname, ".."),
	});
	app.use(vite.middlewares);
}

// API Routes
app.get("/api/health", (_, res) => {
	res.json({ status: "ok" });
});

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
