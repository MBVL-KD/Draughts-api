import { getDb } from "../config/mongo.js";

export async function getPlayerProfile(req, res) {
  const db = getDb();
  const userId = Number(req.params.userId);

  const profile = await db.collection("player_profiles").findOne({ userId });
  res.json({ ok: true, profile });
}

export async function getRecentGames(req, res) {
  const db = getDb();
  const userId = Number(req.params.userId);

  const games = await db.collection("matches")
    .find({
      $or: [{ whiteUserId: userId }, { blackUserId: userId }],
    })
    .sort({ endedAtUnix: -1 })
    .limit(20)
    .toArray();

  res.json({ ok: true, games });
}

export async function getPlayerRatings(req, res) {
  const db = getDb();
  const userId = Number(req.params.userId);

  const ratings = await db.collection("player_ratings")
    .find({ userId })
    .sort({ bucket: 1 })
    .toArray();

  res.json({ ok: true, ratings });
}

export async function getPlayerRatingSnapshot(req, res) {
  const db = getDb();

  const userId = Number(req.params.userId);
  const bucket = String(req.query.bucket || "");

  if (!Number.isFinite(userId)) {
    return res.status(400).json({
      ok: false,
      error: "BAD_USER_ID",
    });
  }

  if (!bucket) {
    return res.status(400).json({
      ok: false,
      error: "MISSING_BUCKET",
    });
  }

  const rating = await db.collection("player_ratings").findOne({
    userId,
    bucket,
  });

  if (!rating) {
    return res.json({
      ok: true,
      found: false,
      snapshot: {
        bucket,
        rating: 1500,
        rd: 700,
        volatility: 0.06,
        provisional: true,
        source: "default",
      },
    });
  }

  return res.json({
    ok: true,
    found: true,
    snapshot: {
      bucket,
      rating: rating.rating,
      rd: rating.rd,
      volatility: rating.volatility,
      provisional: rating.provisional,
      ratedGames: rating.ratedGames || 0,
      source: "player_ratings",
      updatedAtUnix: rating.updatedAtUnix || null,
    },
  });
}
