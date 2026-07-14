import { Router } from "express";
import databaseService from "../services/database.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RATE_LIMIT_MINUTES = 5;
const DRAWINGS_DIR =
	process.env.DRAWINGS_DIR || path.join(__dirname, "../../data/drawings");

// SQLite's CURRENT_TIMESTAMP is UTC but carries no timezone marker, which Date
// would otherwise read as local time.
const parseTimestamp = (timestamp) =>
	new Date(`${timestamp.replace(" ", "T")}Z`);

// Cleanup of a no longer referenced file: a missing file is already the goal.
const removeFile = async (filename) => {
	try {
		await fs.unlink(path.join(DRAWINGS_DIR, filename));
	} catch (err) {
		if (err.code !== "ENOENT") {
			console.error("Error removing previous drawing file:", err);
		}
	}
};

router.get("/:title", async (req, res) => {
	try {
		const { title } = req.params;
		const drawing = await databaseService.getDrawingByTitle(title);

		if (!drawing) {
			return res
				.status(404)
				.json({ error: `Drawing "${title}" not found` });
		}

		const drawingData = await fs.readFile(
			path.join(DRAWINGS_DIR, drawing.file_path),
			"utf8"
		);

		res.json({
			title: drawing.title,
			data: JSON.parse(drawingData),
			created_at: drawing.created_at,
			updated_at: drawing.updated_at,
		});
	} catch (err) {
		console.error("Error getting drawing:", err);
		res.status(500).json({ error: "Failed to get drawing" });
	}
});

router.post("/:title", async (req, res) => {
	try {
		const { title } = req.params;
		const data = req.body;

		if (!data) {
			return res.status(400).json({ error: "Drawing data is required" });
		}

		const existingDrawing = await databaseService.getDrawingByTitle(title);
		if (existingDrawing) {
			const lastUpdate = parseTimestamp(existingDrawing.updated_at);
			const now = new Date();
			const minutesSinceLastUpdate = (now - lastUpdate) / (1000 * 60);

			if (minutesSinceLastUpdate < RATE_LIMIT_MINUTES) {
				const minutesToWait = Math.ceil(
					RATE_LIMIT_MINUTES - minutesSinceLastUpdate
				);
				return res.status(429).json({
					error: `Please wait ${minutesToWait} more minute${
						minutesToWait === 1 ? "" : "s"
					} before updating this drawing again`,
				});
			}
		}

		await fs.mkdir(DRAWINGS_DIR, { recursive: true });

		const filename = `${title}-${Date.now()}.json`;
		await fs.writeFile(
			path.join(DRAWINGS_DIR, filename),
			JSON.stringify(data)
		);

		if (existingDrawing) {
			// Point the row at the new file before removing the old one, so a
			// failed cleanup leaves a stray file rather than a lost drawing.
			await databaseService.updateDrawingByTitle(title, title, filename);
			await removeFile(existingDrawing.file_path);
		} else {
			await databaseService.createDrawing(title, filename);
		}

		res.json({
			message: "Drawing saved successfully",
			title,
			file_path: filename,
		});
	} catch (err) {
		console.error("Error saving drawing:", err);
		if (err.message.includes("already exists")) {
			res.status(409).json({ error: err.message });
		} else {
			res.status(500).json({ error: "Failed to save drawing" });
		}
	}
});

export default router;
