import { nextPuzzleSchema, puzzleResultCompatSchema } from "../schemas/puzzles.schema.js";
import { getNextPuzzle } from "../services/puzzleSelection.service.js";
import { submitPuzzleResult } from "../services/puzzleResult.service.js";

export async function postNextPuzzle(req, res) {
  try {
    const input = nextPuzzleSchema.parse(req.body || {});
    const result = await getNextPuzzle(input);
    if (result?.error) return res.status(result.error.status).json(result.error.body);
    return res.status(200).json(result);
  } catch (error) {
    if (error?.name === "ZodError") {
      return res.status(400).json({ ok: false, error: "BAD_REQUEST", details: error.issues });
    }
    console.error("postNextPuzzle error:", error);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message: error.message });
  }
}

export async function postPuzzleResult(req, res) {
  try {
    const input = puzzleResultCompatSchema.parse(req.body || {});
    const result = await submitPuzzleResult(input);
    if (result?.error) return res.status(result.error.status).json(result.error.body);
    return res.status(200).json(result);
  } catch (error) {
    if (error?.name === "ZodError") {
      return res.status(400).json({ ok: false, error: "BAD_REQUEST", details: error.issues });
    }
    console.error("postPuzzleResult error:", error);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message: error.message });
  }
}
