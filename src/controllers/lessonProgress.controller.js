import {
  findLessonProgressDoc,
  mapDocToGetResponse,
  upsertLessonProgress,
} from "../services/lessonProgress.service.js";

function isValidUserId(userId) {
  return Number.isFinite(userId) && userId !== 0;
}

function trimString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    return { error: { status: 400, body: { ok: false, error: `BAD_${name}` } } };
  }
  return { value: value.trim() };
}

export async function getLessonProgress(req, res) {
  const userId = Number(req.params.userId);
  if (!isValidUserId(userId)) {
    return res.status(400).json({ ok: false, error: "BAD_USER_ID" });
  }

  const b = trimString(req.query.bookId, "BOOK_ID");
  if (b.error) return res.status(400).json(b.error.body);
  const l = trimString(req.query.lessonId, "LESSON_ID");
  if (l.error) return res.status(400).json(l.error.body);

  const playerId = String(userId);
  try {
    const doc = await findLessonProgressDoc(playerId, b.value, l.value);
    return res.json(mapDocToGetResponse(doc, b.value, l.value));
  } catch (err) {
    console.error("getLessonProgress:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

export async function patchLessonProgress(req, res) {
  const userId = Number(req.params.userId);
  if (!isValidUserId(userId)) {
    return res.status(400).json({ ok: false, error: "BAD_USER_ID" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const b = trimString(body.bookId, "BOOK_ID");
  if (b.error) return res.status(400).json(b.error.body);
  const l = trimString(body.lessonId, "LESSON_ID");
  if (l.error) return res.status(400).json(l.error.body);
  const s = trimString(body.stepId, "STEP_ID");
  if (s.error) return res.status(400).json(s.error.body);

  if (!Number.isFinite(Number(body.stepIndex)) || Number(body.stepIndex) < 0) {
    return res.status(400).json({ ok: false, error: "BAD_STEP_INDEX" });
  }

  try {
    const result = await upsertLessonProgress({
      playerId: String(userId),
      bookId: b.value,
      lessonId: l.value,
      stepId: s.value,
      stepIndex: body.stepIndex,
      totalSteps: body.totalSteps,
      bookRevision: body.bookRevision,
      source: body.source,
    });
    if (result.error) {
      return res.status(result.error.status).json(result.error.body);
    }
    return res.json(result);
  } catch (err) {
    console.error("patchLessonProgress:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}
