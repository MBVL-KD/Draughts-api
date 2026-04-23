import { getDb } from "../config/mongo.js";
import {
  buildEducationPublicFields,
  EDUCATION_PUBLIC_SCHEMA_VERSION,
} from "../services/educationPublic.service.js";
import { buildPuzzleStatsResponse } from "../services/puzzleStats.service.js";

/* =========================================================
   Helpers
========================================================= */

function toSafeNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isValidUserId(userId) {
  return Number.isFinite(userId) && userId !== 0;
}

function normalizeString(value, fallback = null) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

function normalizePlayerName(name, fallback) {
  return typeof name === "string" && name.trim() !== "" ? name : fallback;
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    toSafeNumber(tc?.baseMin) ??
    toSafeNumber(matchDoc?.baseMinutes) ??
    toSafeNumber(matchDoc?.minutes) ??
    toSafeNumber(matchDoc?.initialMinutes) ??
    toSafeNumber(matchDoc?.baseMin) ??
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

function buildTimeControlLabel(matchDoc) {
  const tc = normalizeTimeControl(matchDoc);

  if (typeof matchDoc?.timeControlLabel === "string" && matchDoc.timeControlLabel.trim() !== "") {
    return matchDoc.timeControlLabel.trim();
  }

  if (tc.baseMinutes > 0 || tc.incrementSeconds > 0) {
    return `${tc.baseMinutes}+${tc.incrementSeconds}`;
  }

  return null;
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

function mapMatchForUser(matchDoc, userId) {
  const whiteUserId = toSafeNumber(matchDoc?.whiteUserId);
  const blackUserId = toSafeNumber(matchDoc?.blackUserId);

  const isWhite = whiteUserId === userId;
  const isBlack = blackUserId === userId;

  const whitePlayerName = normalizePlayerName(
    matchDoc?.whiteDisplayName || matchDoc?.whitePlayerName,
    "White"
  );

  const blackPlayerName = normalizePlayerName(
    matchDoc?.blackDisplayName || matchDoc?.blackPlayerName,
    "Black"
  );

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
    scenario: matchDoc?.scenario || null,
    rated: matchDoc?.rated === true,

    result: matchDoc?.result || null,

    endReason: matchDoc?.classifiedEndReason || matchDoc?.endReason || null,
    rawEndReason: matchDoc?.endReason || null,
    classifiedEndReason: matchDoc?.classifiedEndReason || null,

    bucket: matchDoc?.ratingBucket || matchDoc?.bucket || null,
    ratingBucket: matchDoc?.ratingBucket || matchDoc?.bucket || null,

    startedAtUnix:
      toSafeNumber(matchDoc?.startedAtUnix) ??
      toSafeNumber(matchDoc?.startedAt) ??
      toSafeNumber(matchDoc?.createdAtUnix) ??
      toSafeNumber(matchDoc?.createdAt) ??
      null,

    endedAtUnix: toSafeNumber(matchDoc?.endedAtUnix) ?? null,
    durationSec: toSafeNumber(matchDoc?.durationSec, 0),

    moveCount,
    plyCount: toSafeNumber(matchDoc?.plyCount),

    timeControl,
    baseMinutes: timeControl.baseMinutes,
    incrementSeconds: timeControl.incrementSeconds,
    timeControlLabel: buildTimeControlLabel(matchDoc),

    gladiatorWhite: matchDoc?.gladiatorWhite === true,
    gladiatorBlack: matchDoc?.gladiatorBlack === true,

    canReplay: canReplayMatch(matchDoc),
  };
}

function mapMatchDetails(matchDoc) {
  const whitePlayerName = normalizePlayerName(
    matchDoc?.whiteDisplayName || matchDoc?.whitePlayerName,
    "White"
  );

  const blackPlayerName = normalizePlayerName(
    matchDoc?.blackDisplayName || matchDoc?.blackPlayerName,
    "Black"
  );

  const timeControl = normalizeTimeControl(matchDoc);

  return {
    matchId: matchDoc?.matchId || null,
    arenaId: matchDoc?.arenaId || null,
    tournamentId: matchDoc?.tournamentId || null,
    roundId: matchDoc?.roundId || null,
    tournamentSessionId: matchDoc?.tournamentSessionId || null,
    lessonId: matchDoc?.lessonId || null,

    whiteUserId: toSafeNumber(matchDoc?.whiteUserId),
    blackUserId: toSafeNumber(matchDoc?.blackUserId),
    whitePlayerName,
    blackPlayerName,

    variant: matchDoc?.variant || null,
    ruleset: matchDoc?.ruleset || null,
    scenario: matchDoc?.scenario || null,
    rated: matchDoc?.rated === true,
    mode: matchDoc?.mode || null,
    matchKind: matchDoc?.matchKind || null,

    result: matchDoc?.result || null,
    outcome: matchDoc?.outcome || null,
    winnerSide: matchDoc?.winnerSide || null,
    winnerUserId: toSafeNumber(matchDoc?.winnerUserId),

    endReason: matchDoc?.classifiedEndReason || matchDoc?.endReason || null,
    rawEndReason: matchDoc?.endReason || null,
    classifiedEndReason: matchDoc?.classifiedEndReason || null,

    bucket: matchDoc?.ratingBucket || matchDoc?.bucket || null,
    ratingBucket: matchDoc?.ratingBucket || matchDoc?.bucket || null,

    startedAtUnix:
      toSafeNumber(matchDoc?.startedAtUnix) ??
      toSafeNumber(matchDoc?.startedAt) ??
      toSafeNumber(matchDoc?.createdAtUnix) ??
      toSafeNumber(matchDoc?.createdAt) ??
      null,

    endedAtUnix: toSafeNumber(matchDoc?.endedAtUnix) ?? null,
    durationSec: toSafeNumber(matchDoc?.durationSec, 0),

    moveCount: getMoveCount(matchDoc),
    plyCount: toSafeNumber(matchDoc?.plyCount),

    moveList: Array.isArray(matchDoc?.moveList) ? matchDoc.moveList : [],
    fenHistory: Array.isArray(matchDoc?.fenHistory) ? matchDoc.fenHistory : [],

    startFen: matchDoc?.startFen || matchDoc?.initialFen || null,
    initialFen: matchDoc?.initialFen || matchDoc?.startFen || null,
    finalFen: matchDoc?.finalFen || null,

    captures:
      matchDoc && typeof matchDoc.captures === "object" && matchDoc.captures
        ? {
            W: toSafeNumber(matchDoc.captures.W, 0),
            B: toSafeNumber(matchDoc.captures.B, 0),
          }
        : { W: 0, B: 0 },

    timeControl,
    baseMinutes: timeControl.baseMinutes,
    incrementSeconds: timeControl.incrementSeconds,
    timeControlLabel: buildTimeControlLabel(matchDoc),

    gladiatorWhite: matchDoc?.gladiatorWhite === true,
    gladiatorBlack: matchDoc?.gladiatorBlack === true,

    countsForRatings: matchDoc?.countsForRatings === true,
    countsForStandings: matchDoc?.countsForStandings === true,
    countsForProfileStats: matchDoc?.countsForProfileStats !== false,
    countsForTournamentScore: matchDoc?.countsForTournamentScore === true,

    whiteRatingBefore: toSafeNumber(matchDoc?.whiteRatingBefore),
    whiteRdBefore: toSafeNumber(matchDoc?.whiteRdBefore),
    whiteVolatilityBefore: toSafeNumber(matchDoc?.whiteVolatilityBefore),
    whiteProvisionalBefore: matchDoc?.whiteProvisionalBefore === true,

    blackRatingBefore: toSafeNumber(matchDoc?.blackRatingBefore),
    blackRdBefore: toSafeNumber(matchDoc?.blackRdBefore),
    blackVolatilityBefore: toSafeNumber(matchDoc?.blackVolatilityBefore),
    blackProvisionalBefore: matchDoc?.blackProvisionalBefore === true,

    flags:
      matchDoc && typeof matchDoc.flags === "object" && matchDoc.flags
        ? matchDoc.flags
        : {},

    meta:
      matchDoc && typeof matchDoc.meta === "object" && matchDoc.meta
        ? matchDoc.meta
        : {},

    canReplay: canReplayMatch(matchDoc),
    gameDef:
      matchDoc && typeof matchDoc.gameDef === "object" && matchDoc.gameDef
        ? matchDoc.gameDef
        : null,
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

function buildRecentGamesQuery(userId, query = {}) {
  const mongoQuery = {
    $or: [{ whiteUserId: userId }, { blackUserId: userId }],
  };

  const before = toSafeNumber(query.before);
  if (before !== null) {
    mongoQuery.endedAtUnix = { $lt: before };
  }

  const variant = normalizeString(query.variant, "");
  if (variant) {
    mongoQuery.variant = {
      $regex: new RegExp(`^${escapeRegex(variant)}$`, "i"),
    };
  }

  const bucket = normalizeString(query.bucket, "");
  if (bucket) {
    mongoQuery.$and = mongoQuery.$and || [];
    mongoQuery.$and.push({
      $or: [
        { ratingBucket: { $regex: new RegExp(`^${escapeRegex(bucket)}$`, "i") } },
        { bucket: { $regex: new RegExp(`^${escapeRegex(bucket)}$`, "i") } },
      ],
    });
  }

  if (query.rated === "true") {
    mongoQuery.rated = true;
  } else if (query.rated === "false") {
    mongoQuery.rated = false;
  }

  return mongoQuery;
}

function buildRecentTournamentsQuery(userId, query = {}) {
  const mongoQuery = {
    recordType: "tournament_snapshot",
    status: "ended",
    "standings.userId": userId,
  };

  const before = toSafeNumber(query.before);
  if (before !== null) {
    mongoQuery.endAt = { $lt: before };
  }

  const variant = normalizeString(query.variant, "");
  if (variant) {
    mongoQuery.variantId = {
      $regex: new RegExp(`^${escapeRegex(variant)}$`, "i"),
    };
  }

  const rated = normalizeString(query.rated, "");
  if (rated === "true") {
    mongoQuery.rated = true;
  } else if (rated === "false") {
    mongoQuery.rated = false;
  }

  return mongoQuery;
}

function mapTournamentSnapshotForUser(tournamentDoc, userId) {
  const standings = Array.isArray(tournamentDoc?.standings) ? tournamentDoc.standings : [];
  const standing = standings.find((s) => toSafeNumber(s?.userId) === userId) || null;

  return {
    tournamentId: normalizeString(tournamentDoc?.id, null),
    id: normalizeString(tournamentDoc?.id, null),

    title: normalizeString(tournamentDoc?.name, "Tournament"),
    name: normalizeString(tournamentDoc?.name, "Tournament"),

    variantId: normalizeString(tournamentDoc?.variantId, "International"),
    variant: normalizeString(tournamentDoc?.variantId, "International"),
    timeClass: normalizeString(tournamentDoc?.timeClass, "Blitz"),

    place:
      toSafeNumber(standing?.rank) ??
      toSafeNumber(standing?.place) ??
      toSafeNumber(standing?.finalRank),

    rank:
      toSafeNumber(standing?.rank) ??
      toSafeNumber(standing?.place) ??
      toSafeNumber(standing?.finalRank),

    finalRank:
      toSafeNumber(standing?.finalRank) ??
      toSafeNumber(standing?.rank) ??
      toSafeNumber(standing?.place),

    points: toSafeNumber(standing?.points, 0),
    games: toSafeNumber(standing?.games, 0),
    wins: toSafeNumber(standing?.wins, 0),
    draws: toSafeNumber(standing?.draws, 0),
    losses: toSafeNumber(standing?.losses, 0),

    endedAtUnix:
      toSafeNumber(tournamentDoc?.endAt) ??
      toSafeNumber(tournamentDoc?.updatedAt) ??
      toSafeNumber(tournamentDoc?.finalizedAt) ??
      null,

    startAtUnix: toSafeNumber(tournamentDoc?.startAt) ?? null,

    status: normalizeString(tournamentDoc?.status, null),
    templateId: normalizeString(tournamentDoc?.templateId, null),
    templateKey: normalizeString(tournamentDoc?.templateKey, null),
    rulesetId: normalizeString(tournamentDoc?.rulesetId, null),
    scenarioId: normalizeString(tournamentDoc?.scenarioId, null),
    rated: tournamentDoc?.rated === true,

    playerName: normalizePlayerName(
      standing?.displayName || standing?.playerName,
      "Player"
    ),
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

  const limitRaw = toSafeNumber(req.query.limit, 20);
  const limit = Math.max(1, Math.min(50, limitRaw || 20));

  const mongoQuery = buildRecentGamesQuery(userId, req.query);

  const matches = await db
    .collection("matches")
    .find(mongoQuery)
    .sort({ endedAtUnix: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();

  const hasMore = matches.length > limit;
  const pageMatches = hasMore ? matches.slice(0, limit) : matches;

  const games = pageMatches.map((matchDoc) => mapMatchForUser(matchDoc, userId));

  const lastMatch = pageMatches.length > 0 ? pageMatches[pageMatches.length - 1] : null;
  const nextCursor = hasMore ? toSafeNumber(lastMatch?.endedAtUnix) : null;

  return res.json({
    ok: true,
    games,
    nextCursor,
    hasMore,
    paging: {
      limit,
      hasMore,
      nextCursor,
    },
    filters: {
      variant: normalizeString(req.query.variant, null),
      rated:
        req.query.rated === "true"
          ? true
          : req.query.rated === "false"
            ? false
            : null,
      bucket: normalizeString(req.query.bucket, null),
      before: toSafeNumber(req.query.before),
    },
  });
}

export async function getRecentTournaments(req, res) {
  const db = getDb();
  const userId = Number(req.params.userId);

  if (!isValidUserId(userId)) {
    return res.status(400).json({
      ok: false,
      error: "BAD_USER_ID",
    });
  }

  const limitRaw = toSafeNumber(req.query.limit, 12);
  const limit = Math.max(1, Math.min(50, limitRaw || 12));

  const mongoQuery = buildRecentTournamentsQuery(userId, req.query);

  const docs = await db
    .collection("tournaments")
    .find(mongoQuery)
    .sort({ endAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();

  const hasMore = docs.length > limit;
  const pageDocs = hasMore ? docs.slice(0, limit) : docs;

  const tournaments = pageDocs.map((doc) => mapTournamentSnapshotForUser(doc, userId));

  const lastDoc = pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null;
  const nextCursor = hasMore ? toSafeNumber(lastDoc?.endAt) : null;

  return res.json({
    ok: true,
    tournaments,
    nextCursor,
    hasMore,
    paging: {
      limit,
      hasMore,
      nextCursor,
    },
    filters: {
      variant: normalizeString(req.query.variant, null),
      rated:
        req.query.rated === "true"
          ? true
          : req.query.rated === "false"
            ? false
            : null,
      before: toSafeNumber(req.query.before),
    },
  });
}

export async function getMatchDetails(req, res) {
  const db = getDb();
  const matchId = normalizeString(req.params.matchId, "");

  if (!matchId) {
    return res.status(400).json({
      ok: false,
      error: "MISSING_MATCH_ID",
    });
  }

  const matchDoc = await db.collection("matches").findOne({ matchId });

  if (!matchDoc) {
    return res.status(404).json({
      ok: false,
      error: "MATCH_NOT_FOUND",
    });
  }

  return res.json({
    ok: true,
    match: mapMatchDetails(matchDoc),
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

  const [profileRaw, ratings, recentMatchesRaw, statsAgg, recentTournamentsRaw, puzzleStatsResult] =
    await Promise.all([
      db.collection("player_profiles").findOne({ userId }),
      db.collection("player_ratings").find({ userId }).sort({ bucket: 1 }).toArray(),
      db
        .collection("matches")
        .find({ $or: [{ whiteUserId: userId }, { blackUserId: userId }] })
        .sort({ endedAtUnix: -1, _id: -1 })
        .limit(20)
        .toArray(),
      db
        .collection("matches")
        .aggregate([
          {
            $match: {
              $or: [{ whiteUserId: userId }, { blackUserId: userId }],
              countsForProfileStats: { $ne: false },
            },
          },
          {
            $group: {
              _id: null,
              wins: {
                $sum: {
                  $cond: [
                    {
                      $or: [
                        { $and: [{ $eq: ["$result", "1-0"] }, { $eq: ["$whiteUserId", userId] }] },
                        { $and: [{ $eq: ["$result", "0-1"] }, { $eq: ["$blackUserId", userId] }] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              losses: {
                $sum: {
                  $cond: [
                    {
                      $or: [
                        { $and: [{ $eq: ["$result", "0-1"] }, { $eq: ["$whiteUserId", userId] }] },
                        { $and: [{ $eq: ["$result", "1-0"] }, { $eq: ["$blackUserId", userId] }] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              draws: { $sum: { $cond: [{ $eq: ["$result", "1/2-1/2"] }, 1, 0] } },
            },
          },
        ])
        .toArray(),
      db
        .collection("tournaments")
        .find({ recordType: "tournament_snapshot", status: "ended", "standings.userId": userId })
        .sort({ endAt: -1, _id: -1 })
        .limit(10)
        .toArray(),
      buildPuzzleStatsResponse(userId).catch((err) => {
        console.error("getProfileSnapshot puzzleStats:", err);
        return null;
      }),
    ]);

  const profile = profileRaw ?? {
    userId,
    coins: 0,
    level: 1,
    xp: 0,
    firstSeenAtUnix: null,
    lastSeenAtUnix: null,
    badges: [],
    stats: { gamesTotal: 0, wins: 0, losses: 0, draws: 0 },
  };

  const statsRow = statsAgg[0] ?? { wins: 0, losses: 0, draws: 0 };
  const stats = {
    wins: statsRow.wins,
    losses: statsRow.losses,
    draws: statsRow.draws,
    gamesTotal: statsRow.wins + statsRow.losses + statsRow.draws,
  };

  const recentMatches = recentMatchesRaw.map((matchDoc) =>
    mapMatchForUser(matchDoc, userId)
  );

  const recentTournaments = recentTournamentsRaw.map((doc) =>
    mapTournamentSnapshotForUser(doc, userId)
  );

  const puzzleStats = puzzleStatsResult;

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

  const educationPublic = {
    schemaVersion: EDUCATION_PUBLIC_SCHEMA_VERSION,
    ...buildEducationPublicFields(mergedProfile, userId),
  };

  return res.json({
    ok: true,
    profile: mergedProfile,
    ratings,
    recentMatches,
    recentTournaments,
    educationPublic,
    ...(puzzleStats ? { puzzleStats } : {}),
  });
}

export async function getPuzzleStats(req, res) {
  const userId = Number(req.params.userId);

  if (!isValidUserId(userId)) {
    return res.status(400).json({
      ok: false,
      error: "BAD_USER_ID",
    });
  }

  try {
    const body = await buildPuzzleStatsResponse(userId);
    return res.json(body);
  } catch (err) {
    console.error("getPuzzleStats error:", err);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
}
