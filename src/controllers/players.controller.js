import { getDb } from "../config/mongo.js";

export async function getPlayerProfile(req, res) {
  const db = getDb();
  const userId = Number(req.params.userId);

  if (!Number.isFinite(userId)) {
    return res.status(400).json({
      ok: false,
      error: "BAD_USER_ID"
    });
  }

  const profile = await db.collection("player_profiles").findOne({ userId });
  res.json({ ok: true, profile });
}

export async function getRecentGames(req, res) {
  const db = getDb();
  const userId = Number(req.params.userId);

  if (!Number.isFinite(userId)) {
    return res.status(400).json({
      ok: false,
      error: "BAD_USER_ID"
    });
  }

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

  const games = matches.map((m) => {
    const isWhite = m.whiteUserId === userId;

    const moveCount =
      Number.isFinite(Number(m.moveCount))
        ? Number(m.moveCount)
        : Number.isFinite(Number(m.plyCount))
          ? Math.ceil(Number(m.plyCount) / 2)
          : Array.isArray(m.moveList)
            ? m.moveList.length
            : 0;

    const canReplay =
      moveCount > 0 ||
      (Array.isArray(m.moveList) && m.moveList.length > 0) ||
      (Array.isArray(m.fenHistory) && m.fenHistory.length > 0);

    return {
      matchId: m.matchId,

      whiteUserId: m.whiteUserId,
      blackUserId: m.blackUserId,
      whitePlayerName: m.whitePlayerName,
      blackPlayerName: m.blackPlayerName,

      opponentUserId: isWhite ? m.blackUserId : m.whiteUserId,
      opponentName: isWhite ? m.blackPlayerName : m.whitePlayerName,

      variant: m.variant,
      ruleset: m.ruleset || null,
      rated: m.rated === true,

      result: m.result,
      endReason: m.endReason,

      bucket: m.ratingBucket || m.bucket || null,
      ratingBucket: m.ratingBucket || m.bucket || null,

      startedAtUnix: m.startedAtUnix || m.createdAtUnix || null,
      endedAtUnix: m.endedAtUnix || null,
      durationSec: m.durationSec || 0,

      moveCount,
      plyCount: m.plyCount || null,

      timeControl: m.timeControl || null,

      gladiatorWhite: m.gladiatorWhite === true,
      gladiatorBlack: m.gladiatorBlack === true,

      canReplay
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

  if (!Number.isFinite(userId)) {
    return res.status(400).json({
      ok: false,
      error: "BAD_USER_ID"
    });
  }

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

  if (!Number.isFinite(userId)) {
    return res.status(400).json({
      ok: false,
      error: "BAD_USER_ID"
    });
  }

  let profile = await db.collection("player_profiles").findOne({ userId });

  if (!profile) {
    profile = {
      userId,
      coins: 0,
      level: 1,
      xp: 0,
      firstSeenAtUnix: null,
      lastSeenAtUnix: null,
      badges: [],
      stats: {
        gamesTotal: 0,
        wins: 0,
        losses: 0,
        draws: 0
      }
    };
  }

  const ratings = await db.collection("player_ratings")
    .find({ userId })
    .sort({ bucket: 1 })
    .toArray();

  const recentMatchesRaw = await db.collection("matches")
    .find({
      $or: [
        { whiteUserId: userId },
        { blackUserId: userId }
      ]
    })
    .sort({ endedAtUnix: -1 })
    .limit(5)
    .toArray();

  const countedMatches = await db.collection("matches")
    .find({
      $or: [
        { whiteUserId: userId },
        { blackUserId: userId }
      ],
      countsForProfileStats: { $ne: false }
    })
    .toArray();

  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const m of countedMatches) {
    const isWhite = m.whiteUserId === userId;
    const isBlack = m.blackUserId === userId;

    if (m.result === "1-0") {
      if (isWhite) wins += 1;
      else if (isBlack) losses += 1;
    } else if (m.result === "0-1") {
      if (isBlack) wins += 1;
      else if (isWhite) losses += 1;
    } else if (m.result === "1/2-1/2") {
      draws += 1;
    }
  }

  const recentMatches = recentMatchesRaw.map((m) => {
    const moveCount =
      Number.isFinite(Number(m.moveCount))
        ? Number(m.moveCount)
        : Number.isFinite(Number(m.plyCount))
          ? Math.ceil(Number(m.plyCount) / 2)
          : Array.isArray(m.moveList)
            ? m.moveList.length
            : 0;

    const canReplay =
      moveCount > 0 ||
      (Array.isArray(m.moveList) && m.moveList.length > 0) ||
      (Array.isArray(m.fenHistory) && m.fenHistory.length > 0);

    return {
      matchId: m.matchId,

      whiteUserId: m.whiteUserId,
      blackUserId: m.blackUserId,
      whitePlayerName: m.whitePlayerName,
      blackPlayerName: m.blackPlayerName,

      variant: m.variant,
      ruleset: m.ruleset || null,
      rated: m.rated === true,

      result: m.result,
      endReason: m.endReason,

      bucket: m.ratingBucket || m.bucket || null,
      ratingBucket: m.ratingBucket || m.bucket || null,

      startedAtUnix: m.startedAtUnix || m.createdAtUnix || null,
      endedAtUnix: m.endedAtUnix || null,
      durationSec: m.durationSec || 0,

      moveCount,
      plyCount: m.plyCount || null,

      timeControl: m.timeControl || null,

      gladiatorWhite: m.gladiatorWhite === true,
      gladiatorBlack: m.gladiatorBlack === true,

      canReplay
    };
  });

  const mergedProfile = {
    ...profile,
    xp: profile.xp || 0,
    badges: Array.isArray(profile.badges) ? profile.badges : [],
    stats: {
      ...(profile.stats || {}),
      gamesTotal: wins + losses + draws,
      wins,
      losses,
      draws
    }
  };

  res.json({
    ok: true,
    profile: mergedProfile,
    ratings,
    recentMatches
  });
}
