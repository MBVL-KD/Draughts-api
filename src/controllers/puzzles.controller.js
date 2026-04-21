import { nextPuzzleSchema, puzzleResultCompatSchema } from "../schemas/puzzles.schema.js";
import { getNextPuzzle } from "../services/puzzleSelection.service.js";
import { submitPuzzleResult } from "../services/puzzleResult.service.js";
import { upsertLessonProgress } from "../services/lessonProgress.service.js";

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
    const raw = req.body || {};
    const input = puzzleResultCompatSchema.parse(raw);
    const result = await submitPuzzleResult(input);
    if (result?.error) return res.status(result.error.status).json(result.error.body);

    // Primary source: lessonProgress payload from client.
    // Legacy fallback: top-level fields kept for backward compatibility.
    const lp = input.lessonProgress || {
      bookId: raw.bookId,
      lessonId: raw.lessonId,
      stepId: raw.stepId ?? raw.completedStepId,
      stepIndex: raw.stepIndex,
      totalStepsKnown: raw.totalStepsKnown ?? raw.totalSteps,
      bookRevision: raw.bookRevision,
      markStepCompleted: raw.markStepCompleted,
    };

    if (lp?.bookId && lp?.lessonId && lp?.stepId && Number.isFinite(Number(lp?.stepIndex))) {
      const progressResult = await upsertLessonProgress({
        playerId: String(input.playerId),
        bookId: String(lp.bookId),
        lessonId: String(lp.lessonId),
        stepId: String(lp.stepId),
        stepIndex: Number(lp.stepIndex),
        totalStepsKnown: lp.totalStepsKnown,
        bookRevision: lp.bookRevision,
        markStepCompleted: lp.markStepCompleted,
        source: "puzzle_result",
      });
      if (progressResult?.error?.status === 409) {
        console.warn("[puzzle-result] lesson_progress_409", {
          userId: input.playerId,
          bookId: lp.bookId,
          lessonId: lp.lessonId,
          stepId: lp.stepId,
          stepIndex: lp.stepIndex,
          expectedRevision: progressResult.error.body?.expectedRevision,
          actualRevision: progressResult.error.body?.actualRevision,
        });
      } else if (progressResult?.error) {
        console.warn("[puzzle-result] lesson_progress_write_failed", {
          userId: input.playerId,
          bookId: lp.bookId,
          lessonId: lp.lessonId,
          stepId: lp.stepId,
          stepIndex: lp.stepIndex,
          status: progressResult.error.status,
          error: progressResult.error.body?.error,
        });
      }
    }
    return res.status(200).json(result);
  } catch (error) {
    if (error?.name === "ZodError") {
      return res.status(400).json({ ok: false, error: "BAD_REQUEST", details: error.issues });
    }
    console.error("postPuzzleResult error:", error);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message: error.message });
  }
}
