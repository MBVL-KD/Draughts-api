import { buildPlayerBooksResponse } from "../services/playerBooks.service.js";

function isValidUserId(userId) {
  return Number.isFinite(userId) && userId !== 0;
}

export async function getPlayerBooks(req, res) {
  const userId = Number(req.params.userId);
  if (!isValidUserId(userId)) {
    return res.status(400).json({ ok: false, error: "BAD_USER_ID" });
  }

  const lang = typeof req.query.lang === "string" ? req.query.lang : undefined;
  try {
    const body = await buildPlayerBooksResponse(userId, { lang });
    return res.json(body);
  } catch (err) {
    console.error("getPlayerBooks:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}
