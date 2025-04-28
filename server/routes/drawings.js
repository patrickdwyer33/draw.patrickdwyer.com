import { Router } from "express";
import databaseService from "../services/database.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rate limit in minutes
const RATE_LIMIT_MINUTES = 5;

// Get drawing by title
router.get("/:title", async (req, res) => {
	try {
		const { title } = req.params;
		const drawing = await databaseService.getDrawingByTitle(title);

		if (!drawing) {
			return res
				.status(404)
				.json({ error: `Drawing "${title}" not found` });
		}

		// Read the drawing data from file
		const drawingData = await fs.readFile(drawing.file_path, "utf8");

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

// Create or update drawing by title
router.post("/:title", async (req, res) => {
	try {
		const { title } = req.params;
		const { data } = req.body;

		if (!data) {
			return res.status(400).json({ error: "Drawing data is required" });
		}

		// Check if drawing exists and check rate limit
		const existingDrawing = await databaseService.getDrawingByTitle(title);
		if (existingDrawing) {
			const lastUpdate = new Date(existingDrawing.updated_at);
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

		// Create the drawings directory if it doesn't exist
		const drawingsDir = path.join(__dirname, "../../data/drawings");
		await fs.mkdir(drawingsDir, { recursive: true });

		// Generate a unique filename
		const filename = `${title}-${Date.now()}.json`;
		const filePath = path.join(drawingsDir, filename);

		// Save the drawing data to file
		await fs.writeFile(filePath, JSON.stringify(data));

		if (existingDrawing) {
			// Delete the old file
			await fs.unlink(existingDrawing.file_path);
			// Update the database entry
			await databaseService.updateDrawingByTitle(title, title, filePath);
		} else {
			// Create new database entry
			await databaseService.createDrawing(title, filePath);
		}

		res.json({
			message: "Drawing saved successfully",
			title,
			file_path: filePath,
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
