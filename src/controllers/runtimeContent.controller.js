import {
  buildRuntimeBookLessonsResponse,
  buildRuntimeBooksResponse,
  buildRuntimeLessonStepsResponse,
} from "../services/runtimeContent.service.js";

function parseUserId(req) {
  const raw = req.query.userId ?? req.params.userId;
  const value = Number(raw);
  return Number.isFinite(value) && value !== 0 ? value : null;
}

export async function getRuntimeBooks(req, res) {
  const userId = parseUserId(req);
  if (userId == null) return res.status(400).json({ ok: false, error: "BAD_USER_ID" });
  const lang = typeof req.query.lang === "string" ? req.query.lang : undefined;
  const includePuzzles = String(req.query.includePuzzles || "false").toLowerCase() === "true";
  try {
    const body = await buildRuntimeBooksResponse(userId, { lang, includePuzzles });
    return res.status(200).json(body);
  } catch (error) {
    console.error("getRuntimeBooks error:", error);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

export async function getRuntimeBookLessons(req, res) {
  const userId = parseUserId(req);
  if (userId == null) return res.status(400).json({ ok: false, error: "BAD_USER_ID" });
  const bookId = typeof req.params.bookId === "string" ? req.params.bookId.trim() : "";
  if (!bookId) return res.status(400).json({ ok: false, error: "BAD_BOOK_ID" });
  const lang = typeof req.query.lang === "string" ? req.query.lang : undefined;

  try {
    const body = await buildRuntimeBookLessonsResponse(userId, bookId, { lang });
    if (body?.error) return res.status(body.error.status).json(body.error.body);
    return res.status(200).json(body);
  } catch (error) {
    console.error("getRuntimeBookLessons error:", error);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

export async function getRuntimeLessonSteps(req, res) {
  const lessonId = typeof req.params.lessonId === "string" ? req.params.lessonId.trim() : "";
  const bookId = typeof req.query.bookId === "string" ? req.query.bookId.trim() : "";
  try {
    const body = await buildRuntimeLessonStepsResponse({
      bookId,
      lessonId,
      lang: req.query.lang,
      offset: req.query.offset,
      limit: req.query.limit,
    });
    if (body?.error) return res.status(body.error.status).json(body.error.body);
    return res.status(200).json(body);
  } catch (error) {
    console.error("getRuntimeLessonSteps error:", error);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}
