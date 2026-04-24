import {
  preRegisterPlayer,
  getPlayerByChildRef,
  batchGetProfiles,
  getAdminPlayerProfile,
  getAdminGames,
  getAdminLessonSummary,
  getAdminPuzzleSummary,
  getAdminTournaments,
} from "../services/adminPlayers.service.js";

function toPositiveInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

export async function registerPlayer(req, res) {
  const robloxUserId = toPositiveInt(req.body.robloxUserId);
  const childRef = typeof req.body.childRef === "string" ? req.body.childRef.trim() : "";

  if (!robloxUserId) {
    return res.status(400).json({ ok: false, error: "MISSING_ROBLOX_USER_ID" });
  }
  if (!childRef) {
    return res.status(400).json({ ok: false, error: "MISSING_CHILD_REF" });
  }

  try {
    const result = await preRegisterPlayer(robloxUserId, childRef);
    return res.status(result.created ? 201 : 200).json({ ok: true, ...result });
  } catch (err) {
    console.error("[admin] registerPlayer error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

export async function getByChildRef(req, res) {
  const childRef = typeof req.params.childRef === "string" ? req.params.childRef.trim() : "";
  if (!childRef) {
    return res.status(400).json({ ok: false, error: "MISSING_CHILD_REF" });
  }

  try {
    const player = await getPlayerByChildRef(childRef);
    if (!player) {
      return res.json({ ok: true, found: false, player: null });
    }
    return res.json({ ok: true, found: true, player });
  } catch (err) {
    console.error("[admin] getByChildRef error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

export async function batchProfiles(req, res) {
  const raw = req.body.robloxUserIds;
  if (!Array.isArray(raw) || raw.length === 0) {
    return res.status(400).json({ ok: false, error: "MISSING_ROBLOX_USER_IDS" });
  }
  if (raw.length > 200) {
    return res.status(400).json({ ok: false, error: "TOO_MANY_IDS", max: 200 });
  }

  const userIds = raw.map(toPositiveInt).filter(Boolean);
  if (userIds.length === 0) {
    return res.status(400).json({ ok: false, error: "NO_VALID_IDS" });
  }

  try {
    const players = await batchGetProfiles(userIds);
    return res.json({ ok: true, players });
  } catch (err) {
    console.error("[admin] batchProfiles error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

export async function getProfile(req, res) {
  const userId = toPositiveInt(req.params.userId);
  if (!userId) return res.status(400).json({ ok: false, error: "BAD_USER_ID" });

  try {
    const player = await getAdminPlayerProfile(userId);
    if (!player) return res.status(404).json({ ok: false, error: "PLAYER_NOT_FOUND" });
    return res.json({ ok: true, player });
  } catch (err) {
    console.error("[admin] getProfile error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

export async function getGames(req, res) {
  const userId = toPositiveInt(req.params.userId);
  if (!userId) return res.status(400).json({ ok: false, error: "BAD_USER_ID" });

  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  try {
    const games = await getAdminGames(userId, limit);
    return res.json({ ok: true, games });
  } catch (err) {
    console.error("[admin] getGames error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

export async function getLessonSummary(req, res) {
  const userId = toPositiveInt(req.params.userId);
  if (!userId) return res.status(400).json({ ok: false, error: "BAD_USER_ID" });

  try {
    const summary = await getAdminLessonSummary(userId);
    return res.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[admin] getLessonSummary error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

export async function getPuzzleSummary(req, res) {
  const userId = toPositiveInt(req.params.userId);
  if (!userId) return res.status(400).json({ ok: false, error: "BAD_USER_ID" });

  try {
    const summary = await getAdminPuzzleSummary(userId);
    return res.json(summary);
  } catch (err) {
    console.error("[admin] getPuzzleSummary error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

export async function getTournaments(req, res) {
  const userId = toPositiveInt(req.params.userId);
  if (!userId) return res.status(400).json({ ok: false, error: "BAD_USER_ID" });

  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  try {
    const tournaments = await getAdminTournaments(userId, limit);
    return res.json({ ok: true, tournaments });
  } catch (err) {
    console.error("[admin] getTournaments error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

export async function getBadges(req, res) {
  const userId = toPositiveInt(req.params.userId);
  if (!userId) return res.status(400).json({ ok: false, error: "BAD_USER_ID" });

  try {
    const player = await getAdminPlayerProfile(userId);
    if (!player) return res.status(404).json({ ok: false, error: "PLAYER_NOT_FOUND" });
    return res.json({ ok: true, badges: player.badges });
  } catch (err) {
    console.error("[admin] getBadges error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}
