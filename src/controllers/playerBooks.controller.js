import { buildBookLessonsResponse, buildPlayerBooksResponse } from "../services/playerBooks.service.js";

function isValidUserId(userId) {
  return Number.isFinite(userId) && userId !== 0;
}

export async function getPlayerBooks(req, res) {
  const userId = Number(req.params.userId);
  if (!isValidUserId(userId)) {
    return res.status(400).json({ ok: false, error: "BAD_USER_ID" });
  }

  const lang = typeof req.query.lang === "string" ? req.query.lang : undefined;
  const includePuzzles = String(req.query.includePuzzles || "false").toLowerCase() === "true";
  try {
    const body = await buildPlayerBooksResponse(userId, { lang, includePuzzles });
    return res.json(body);
  } catch (err) {
    console.error("getPlayerBooks:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

export async function getPlayerBookLessons(req, res) {
  const userId = Number(req.params.userId);
  if (!isValidUserId(userId)) {
    return res.status(400).json({ ok: false, error: "BAD_USER_ID" });
  }
  const bookId = typeof req.params.bookId === "string" ? req.params.bookId.trim() : "";
  if (!bookId) {
    return res.status(400).json({ ok: false, error: "BAD_BOOK_ID" });
  }

  const lang = typeof req.query.lang === "string" ? req.query.lang : undefined;
  try {
    const body = await buildBookLessonsResponse(userId, bookId, { lang });
    if (body?.error) return res.status(body.error.status).json(body.error.body);
    return res.json(body);
  } catch (err) {
    console.error("getPlayerBookLessons:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}
