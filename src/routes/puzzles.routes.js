import { Router } from "express";
import { postNextPuzzle, postPuzzleResult } from "../controllers/puzzles.controller.js";
import { requireApiKey } from "../middleware/require-api-key.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.use(requireApiKey);
router.post("/next", postNextPuzzle);
router.post("/result", postPuzzleResult);

export default router;
