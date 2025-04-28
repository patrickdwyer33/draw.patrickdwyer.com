import { Router } from "express";
import drawingRoutes from "./routes/drawings.js";

export const appRoutes = Router();

appRoutes.get("/health", (_, res) => {
	res.json({ status: "ok" });
});

// Mount drawing routes
appRoutes.use("/drawings", drawingRoutes);
