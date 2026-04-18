import {
  findLessonProgressDoc,
  listLessonProgressForPlayer,
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

function parseLessonListPagination(req) {
  const limitRaw = parseInt(String(req.query.limit ?? "25"), 10);
  const offsetRaw = parseInt(String(req.query.offset ?? "0"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 25;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;
  return { limit, offset };
}

export async function getLessonProgress(req, res) {
  const userId = Number(req.params.userId);
  if (!isValidUserId(userId)) {
    return res.status(400).json({ ok: false, error: "BAD_USER_ID" });
  }

  const rawBook = req.query.bookId;
  const rawLesson = req.query.lessonId;
  const hasBook = typeof rawBook === "string" && rawBook.trim() !== "";
  const hasLesson = typeof rawLesson === "string" && rawLesson.trim() !== "";

  const playerId = String(userId);
  try {
    if (!hasBook && !hasLesson) {
      const { limit, offset } = parseLessonListPagination(req);
      const list = await listLessonProgressForPlayer(playerId, { limit, offset });
      return res.json(list);
    }

    if (hasBook && hasLesson) {
      const b = trimString(rawBook, "BOOK_ID");
      if (b.error) return res.status(400).json(b.error.body);
      const l = trimString(rawLesson, "LESSON_ID");
      if (l.error) return res.status(400).json(l.error.body);
      const doc = await findLessonProgressDoc(playerId, b.value, l.value);
      return res.json(mapDocToGetResponse(doc, b.value, l.value));
    }

    return res.status(400).json({
      ok: false,
      error: "LESSON_PROGRESS_QUERY_PAIR",
      message: "Use both bookId and lessonId for one lesson, or omit both for the full list",
    });
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
  const stepIdRaw = body.stepId ?? body.completedStepId;
  const s = trimString(stepIdRaw, "STEP_ID");
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
      totalStepsKnown: body.totalStepsKnown,
      bookRevision: body.bookRevision,
      source: body.source,
      markStepCompleted: body.markStepCompleted,
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
