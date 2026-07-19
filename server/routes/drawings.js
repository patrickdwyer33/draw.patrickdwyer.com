import { Router } from "express";
import express from "express";
import { validateTitle } from "../../shared/title.js";
import { decodeDrawing } from "../../shared/codec.js";
import { headObject, putObject } from "../services/objects.js";

const router = Router();
const RATE_LIMIT_MINUTES = 5;

// Binary body: cap at 32MB (largest observed ~14MB) and parse as a raw Buffer.
const rawBinary = express.raw({ type: "application/octet-stream", limit: "32mb" });

// Reads are served by the CDN directly from S3 — Express is intentionally NOT in
// the read path. Only writes are proxied (validate before durable; enforce rate
// limit, which a presigned PUT could not).
router.post("/:title", rawBinary, async (req, res) => {
	try {
		const { title } = req.params;
		try {
			validateTitle(title);
			if (!Buffer.isBuffer(req.body)) {
				return res.status(400).json({ error: "Drawing data is required (send application/octet-stream)" });
			}
			decodeDrawing(req.body.buffer.slice(req.body.byteOffset, req.body.byteOffset + req.body.byteLength));
		} catch (e) {
			return res.status(400).json({ error: e.message });
		}

		const existing = await headObject(title);
		if (existing) {
			const mins = (Date.now() - existing.lastModified.getTime()) / 60000;
			if (mins < RATE_LIMIT_MINUTES) {
				const wait = Math.ceil(RATE_LIMIT_MINUTES - mins);
				return res.status(429).json({
					error: `Please wait ${wait} more minute${wait === 1 ? "" : "s"} before updating this drawing again`,
				});
			}
		}

		await putObject(title, req.body);
		res.json({ message: "Drawing saved successfully", title });
	} catch (err) {
		console.error("Error saving drawing:", err);
		// Distinguish credential/config failures from transient S3 errors — they
		// fail identically but mean opposite things (see substrate lessons).
		if (err.name === "CredentialsProviderError" || err.name === "AccessDenied") {
			return res.status(503).json({ error: "Storage unavailable (credentials)" });
		}
		res.status(503).json({ error: "Failed to save drawing" });
	}
});

export default router;
