import { ingestFinalizedMatch } from "../services/matchIngest.service.js";

export async function postFinalizedMatch(req, res) {
  try {
    const result = await ingestFinalizedMatch(req.body);
    res.status(200).json(result);
  } catch (err) {
    console.error("postFinalizedMatch error:", err);
    res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: err.message,
    });
  }
}
