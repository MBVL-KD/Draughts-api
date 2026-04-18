import {
  buildEducationPublicResponse,
  loadPlayerProfileForEducation,
} from "../services/educationPublic.service.js";

function isValidUserId(userId) {
  return Number.isFinite(userId) && userId !== 0;
}

export async function getLessonProgressPublic(req, res) {
  const userId = Number(req.params.userId);
  if (!isValidUserId(userId)) {
    return res.status(400).json({ ok: false, error: "BAD_USER_ID" });
  }

  try {
    const profile = await loadPlayerProfileForEducation(userId);
    const body = buildEducationPublicResponse(profile || { userId }, userId);
    return res.json(body);
  } catch (err) {
    console.error("getLessonProgressPublic:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}
