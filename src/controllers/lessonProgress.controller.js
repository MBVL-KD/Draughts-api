import {
  findLessonProgressDoc,
  listLessonProgressForPlayer,
  mapDocToGetResponse,
  upsertLessonProgress,
} from "../services/lessonProgress.service.js";
import { getDb } from "../config/mongo.js";

function isValidUserId(userId) {
  return Number.isFinite(userId) && userId !== 0;
}

function trimString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    return { error: { status: 400, body: { ok: false, error: `BAD_${name}` } } };
  }
  return { value: value.trim() };
}

function issue(path, code, message) {
  return { path, code, message };
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
      const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
      const list = await listLessonProgressForPlayer(playerId, { limit, offset, cursor });
      if (list?.error) return res.status(list.error.status).json(list.error.body);
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
  const issues = [];
  const b = trimString(body.bookId, "BOOK_ID");
  if (b.error) issues.push(issue("bookId", "book_id.invalid", "bookId is required"));
  const l = trimString(body.lessonId, "LESSON_ID");
  if (l.error) issues.push(issue("lessonId", "lesson_id.invalid", "lessonId is required"));
  const stepIdRaw = body.stepId ?? body.completedStepId;
  const s = trimString(stepIdRaw, "STEP_ID");
  if (s.error) issues.push(issue("stepId", "step_id.invalid", "stepId (or completedStepId) is required"));
  if (!Number.isFinite(Number(body.stepIndex)) || Number(body.stepIndex) < 0) {
    issues.push(issue("stepIndex", "step_index.invalid", "stepIndex must be a non-negative number"));
  }
  if (issues.length) {
    return res.status(400).json({ ok: false, error: "BAD_REQUEST", issues });
  }

  try {
    const db = getDb();
    const book = await db.collection("books").findOne({
      isDeleted: { $ne: true },
      $or: [{ bookId: b.value }, { id: b.value }],
    });
    const lesson = Array.isArray(book?.lessons)
      ? book.lessons.find((row) => (row?.lessonId || row?.id) === l.value)
      : null;
    const isExam = lesson?.isExam === true;

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
      isExam,
      canRetake: isExam ? false : true,
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
