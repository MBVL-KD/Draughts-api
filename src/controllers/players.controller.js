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

  const matches = await db.collection("matches")
    .find({
      $or: [
        { whiteUserId: userId },
        { blackUserId: userId }
      ]
    })
    .sort({ endedAtUnix: -1 })
    .limit(20)
    .toArray();

  const games = matches.map(m => {

    const isWhite = m.whiteUserId === userId;

    return {
      matchId: m.matchId,

      opponentUserId: isWhite ? m.blackUserId : m.whiteUserId,
      opponentName: isWhite ? m.blackPlayerName : m.whitePlayerName,

      variant: m.variant,
      rated: m.rated,

      result: m.result,
      endReason: m.endReason,

      bucket: m.ratingBucket,
      endedAtUnix: m.endedAtUnix,

      canReplay: true
    };
  });

  res.json({
    ok: true,
    games
  });
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

export async function getProfileSnapshot(req, res) {

  const db = getDb();
  const userId = Number(req.params.userId);

  let profile = await db.collection("player_profiles")
    .findOne({ userId });

  if (!profile) {
    profile = {
      userId,
      coins: 0,
      level: 1,
      stats: {
        wins: 0,
        losses: 0,
        draws: 0
      }
    };
  }

  const ratings = await db.collection("player_ratings")
    .find({ userId })
    .toArray();

  const recentMatches = await db.collection("matches")
    .find({
      $or: [
        { whiteUserId: userId },
        { blackUserId: userId }
      ]
    })
    .sort({ endedAtUnix: -1 })
    .limit(5)
    .toArray();

  res.json({
    ok: true,
    profile,
    ratings,
    recentMatches
  });
}
