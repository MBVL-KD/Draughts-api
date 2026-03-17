import { getDb } from "../config/mongo.js";

/* =========================================================
   Helpers
========================================================= */

function toSafeNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isValidUserId(userId) {
  return Number.isFinite(userId) && userId > 0;
}

function normalizeTimeControl(matchDoc) {
  const tc =
    matchDoc && typeof matchDoc.timeControl === "object" && matchDoc.timeControl
      ? matchDoc.timeControl
      : null;

  const baseMinutes =
    toSafeNumber(tc?.baseMinutes) ??
    toSafeNumber(tc?.minutes) ??
    toSafeNumber(tc?.initialMinutes) ??
    toSafeNumber(matchDoc?.baseMinutes) ??
    toSafeNumber(matchDoc?.minutes) ??
    toSafeNumber(matchDoc?.initialMinutes) ??
    0;

  const incrementSeconds =
    toSafeNumber(tc?.incrementSeconds) ??
    toSafeNumber(tc?.increment) ??
    toSafeNumber(tc?.inc) ??
    toSafeNumber(matchDoc?.incrementSeconds) ??
    toSafeNumber(matchDoc?.increment) ??
    toSafeNumber(matchDoc?.inc) ??
    0;

  return {
    baseMinutes,
    incrementSeconds,
  };
}

function getMoveCount(matchDoc) {
  const moveCount = toSafeNumber(matchDoc?.moveCount);
  if (moveCount !== null) {
    return Math.max(0, Math.floor(moveCount));
  }

  const plyCount = toSafeNumber(matchDoc?.plyCount);
  if (plyCount !== null) {
    return Math.max(0, Math.ceil(plyCount / 2));
  }

  if (Array.isArray(matchDoc?.moveList)) {
    return matchDoc.moveList.length;
  }

  return 0;
}

function canReplayMatch(matchDoc) {
  const moveCount = getMoveCount(matchDoc);

  return (
    moveCount > 0 ||
    (Array.isArray(matchDoc?.moveList) && matchDoc.moveList.length > 0) ||
    (Array.isArray(matchDoc?.fenHistory) && matchDoc.fenHistory.length > 0)
  );
}

function normalizePlayerName(name, fallback) {
  return typeof name === "string" && name.trim() !== "" ? name : fallback;
}

function mapMatchForUser(matchDoc, userId) {
  const whiteUserId = toSafeNumber(matchDoc?.whiteUserId);
  const blackUserId = toSafeNumber(matchDoc?.blackUserId);

  const isWhite = whiteUserId === userId;
  const isBlack = blackUserId === userId;

  const whitePlayerName = normalizePlayerName(matchDoc?.whitePlayerName, "White");
  const blackPlayerName = normalizePlayerName(matchDoc?.blackPlayerName, "Black");

  const opponentUserId = isWhite
    ? blackUserId
    : isBlack
      ? whiteUserId
      : null;

  const opponentName = isWhite
    ? blackPlayerName
    : isBlack
      ? whitePlayerName
      : normalizePlayerName(matchDoc?.opponentName, "Opponent");

  const moveCount = getMoveCount(matchDoc);
  const timeControl = normalizeTimeControl(matchDoc);

  return {
    matchId: matchDoc?.matchId || null,

    whiteUserId,
    blackUserId,
    whitePlayerName,
    blackPlayerName,

    opponentUserId,
    opponentName,

    variant: matchDoc?.variant || null,
    ruleset: matchDoc?.ruleset || null,
    rated: matchDoc?.rated === true,

    result: matchDoc?.result || null,
    endReason: matchDoc?.endReason || null,

    bucket: matchDoc?.ratingBucket || matchDoc?.bucket || null,
    ratingBucket: matchDoc?.ratingBucket || matchDoc?.bucket || null,

    startedAtUnix:
      toSafeNumber(matchDoc?.startedAtUnix) ??
      toSafeNumber(matchDoc?.createdAtUnix) ??
      null,

    endedAtUnix: toSafeNumber(matchDoc?.endedAtUnix) ?? null,
    durationSec: toSafeNumber(matchDoc?.durationSec, 0),

    moveCount,
    plyCount: toSafeNumber(matchDoc?.plyCount),

    timeControl,
    baseMinutes: timeControl.baseMinutes,
    incrementSeconds: timeControl.incrementSeconds,

    gladiatorWhite: matchDoc?.gladiatorWhite === true,
    gladiatorBlack: matchDoc?.gladiatorBlack === true,

    canReplay: canReplayMatch(matchDoc),
  };
}

function calculateStatsForUser(matches, userId) {
  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const m of matches) {
    const isWhite = m.whiteUserId === userId;
    const isBlack = m.blackUserId === userId;
    const result = m.result;

    if (result === "1-0") {
      if (isWhite) wins += 1;
      else if (isBlack) losses += 1;
    } else if (result === "0-1") {
      if (isBlack) wins += 1;
      else if (isWhite) losses += 1;
    } else if (result === "1/2-1/2") {
      draws += 1;
    }
  }

  return {
    gamesTotal: wins + losses + draws,
    wins,
    losses,
    draws,
  };
}

/* =========================================================
   Controllers
========================================================= */

export async function getPlayerProfile(req, res) {
  const db = getDb();
  const userId = Number(req.params.userId);

  if (!isValidUserId(userId)) {
    return res.status(400).json({
      ok: false,
      error: "BAD_USER_ID",
    });
  }

  const profile = await db.collection("player_profiles").findOne({ userId });

  return res.json({
    ok: true,
    profile: profile || null,
  });
}

export async function getRecentGames(req, res) {
  const db = getDb();
  const userId = Number(req.params.userId);

  if (!isValidUserId(userId)) {
    return res.status(400).json({
      ok: false,
      error: "BAD_USER_ID",
    });
  }

  const matches = await db
    .collection("matches")
    .find({
      $or: [{ whiteUserId: userId }, { blackUserId: userId }],
    })
    .sort({ endedAtUnix: -1 })
    .limit(20)
    .toArray();

  const games = matches.map((matchDoc) => mapMatchForUser(matchDoc, userId));

  return res.json({
    ok: true,
    games,
  });
}

export async function getPlayerRatings(req, res) {
  const db = getDb();
  const userId = Number(req.params.userId);

  if (!isValidUserId(userId)) {
    return res.status(400).json({
      ok: false,
      error: "BAD_USER_ID",
    });
  }

  const ratings = await db
    .collection("player_ratings")
    .find({ userId })
    .sort({ bucket: 1 })
    .toArray();

  return res.json({
    ok: true,
    ratings,
  });
}

export async function getPlayerRatingSnapshot(req, res) {
  const db = getDb();
  const userId = Number(req.params.userId);
  const bucket = String(req.query.bucket || "").trim();

  if (!isValidUserId(userId)) {
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
        ratedGames: 0,
        source: "default",
        updatedAtUnix: null,
      },
    });
  }

  return res.json({
    ok: true,
    found: true,
    snapshot: {
      bucket,
      rating: toSafeNumber(rating.rating, 1500),
      rd: toSafeNumber(rating.rd, 700),
      volatility: toSafeNumber(rating.volatility, 0.06),
      provisional: rating.provisional === true,
      ratedGames: toSafeNumber(rating.ratedGames, 0),
      source: "player_ratings",
      updatedAtUnix: toSafeNumber(rating.updatedAtUnix),
    },
  });
}

export async function getProfileSnapshot(req, res) {
  const db = getDb();
  const userId = Number(req.params.userId);

  if (!isValidUserId(userId)) {
    return res.status(400).json({
      ok: false,
      error: "BAD_USER_ID",
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
        draws: 0,
      },
    };
  }

  const ratings = await db
    .collection("player_ratings")
    .find({ userId })
    .sort({ bucket: 1 })
    .toArray();

  const recentMatchesRaw = await db
    .collection("matches")
    .find({
      $or: [{ whiteUserId: userId }, { blackUserId: userId }],
    })
    .sort({ endedAtUnix: -1 })
    .limit(20)
    .toArray();

  const countedMatches = await db
    .collection("matches")
    .find({
      $or: [{ whiteUserId: userId }, { blackUserId: userId }],
      countsForProfileStats: { $ne: false },
    })
    .toArray();

  const stats = calculateStatsForUser(countedMatches, userId);

  const recentMatches = recentMatchesRaw.map((matchDoc) =>
    mapMatchForUser(matchDoc, userId)
  );

  const mergedProfile = {
    ...profile,
    userId,
    coins: toSafeNumber(profile.coins, 0),
    level: toSafeNumber(profile.level, 1),
    xp: toSafeNumber(profile.xp, 0),
    firstSeenAtUnix: toSafeNumber(profile.firstSeenAtUnix),
    lastSeenAtUnix: toSafeNumber(profile.lastSeenAtUnix),
    badges: Array.isArray(profile.badges) ? profile.badges : [],
    stats: {
      ...(profile.stats || {}),
      gamesTotal: stats.gamesTotal,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
    },
  };

  return res.json({
    ok: true,
    profile: mergedProfile,
    ratings,
    recentMatches,
  });
}
