import { Router } from "express";
import databaseService from "../services/database.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RATE_LIMIT_MINUTES = 5;

router.get("/:title", async (req, res) => {
	try {
		const { title } = req.params;
		const drawing = await databaseService.getDrawingByTitle(title);

		if (!drawing) {
			return res
				.status(404)
				.json({ error: `Drawing "${title}" not found` });
		}

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

router.post("/:title", async (req, res) => {
	try {
		const { title } = req.params;
		const data = req.body;

		if (!data) {
			return res.status(400).json({ error: "Drawing data is required" });
		}

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

		const drawingsDir = path.join(__dirname, "../../data/drawings");
		await fs.mkdir(drawingsDir, { recursive: true });

		const filename = `${title}-${Date.now()}.json`;
		const filePath = path.join(drawingsDir, filename);

		await fs.writeFile(filePath, JSON.stringify(data));

		if (existingDrawing) {
			await fs.unlink(existingDrawing.file_path);
			await databaseService.updateDrawingByTitle(title, title, filePath);
		} else {
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
