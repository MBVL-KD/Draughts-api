import { createHash } from "crypto";
import { getDb } from "../config/mongo.js";

const PLAYER_K = 20;
const PUZZLE_K = 6;
const PUZZLE_RATING_MIN_PLAYS = 20;
const PROFILE_RECENT_CAP = 50;
const PLAYER_DEFAULT_RATING = 800;

function normalizePlayerId(playerId) {
  return String(playerId);
}

function normalizeVariantId(variantId) {
  return String(variantId || "").trim().toLowerCase();
}

function expectedScore(playerRating, puzzleRating) {
  return 1 / (1 + Math.pow(10, (puzzleRating - playerRating) / 400));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeActualScore(result) {
  if (!result.solved) {
    const failFloor = 0.1;
    const failPenalty = clamp(result.mistakes * 0.02 + result.hintsUsed * 0.03, 0, 0.08);
    return clamp(failFloor - failPenalty, 0, 0.2);
  }

  const timePenalty = clamp(result.timeMs / (1000 * 180), 0, 0.25);
  const hintPenalty = clamp(result.hintsUsed * 0.08, 0, 0.35);
  const mistakePenalty = clamp(result.mistakes * 0.05, 0, 0.25);
  return clamp(1 - timePenalty - hintPenalty - mistakePenalty, 0.5, 1);
}

function updateRollingAverage(currentAvg, currentCount, nextValue) {
  if (currentCount <= 0) return nextValue;
  return (currentAvg * currentCount + nextValue) / (currentCount + 1);
}

function buildSafetyHash({ playerId, puzzleId, sessionId, attemptId }) {
  return createHash("sha256").update(`${playerId}|${puzzleId}|${sessionId}|${attemptId}`).digest("hex");
}

export async function submitPuzzleResult(input) {
  if (input.mode === "ranked") {
    return { error: { status: 409, body: { ok: false, error: "RANKED_DISABLED" } } };
  }

  const db = getDb();
  const playerId = normalizePlayerId(input.playerId);
  const normalizedVariantId = normalizeVariantId(input.variantId);
  const attempts = db.collection("puzzle_attempts");

  const existingAttempt = await attempts.findOne({ attemptId: input.attemptId });
  if (existingAttempt) {
    return {
      ok: true,
      idempotentReplay: true,
      attemptId: existingAttempt.attemptId,
      playerRating: existingAttempt.playerRating,
      puzzleRating: existingAttempt.puzzleRating,
    };
  }

  const puzzle = await db.collection("puzzle_catalog").findOne({ puzzleId: input.puzzleId, active: true });
  if (!puzzle) {
    return { error: { status: 404, body: { ok: false, error: "PUZZLE_NOT_FOUND" } } };
  }
  if (normalizeVariantId(puzzle?.meta?.variantId) !== normalizedVariantId) {
    return { error: { status: 400, body: { ok: false, error: "VARIANT_MISMATCH" } } };
  }

  const profiles = db.collection("player_puzzle_profiles");
  const nowUnix = Math.floor(Date.now() / 1000);
  await profiles.updateOne(
    { playerId, variantId: normalizedVariantId },
    {
      $setOnInsert: {
        playerId,
        variantId: normalizedVariantId,
        globalRating: PLAYER_DEFAULT_RATING,
        provisional: true,
        recentPuzzleIds: [],
        stats: { attempts: 0, solved: 0, failed: 0, avgTimeMs: 0, hintRate: 0 },
        createdAtUnix: nowUnix,
      },
    },
    { upsert: true }
  );
  const profile = await profiles.findOne({ playerId, variantId: normalizedVariantId });

  const playerRatingBefore = Number(profile?.globalRating || PLAYER_DEFAULT_RATING);
  const puzzleRatingBefore = Number(puzzle?.rating?.value || PLAYER_DEFAULT_RATING);
  const expected = expectedScore(playerRatingBefore, puzzleRatingBefore);
  const actual = computeActualScore(input.result);

  const playerDelta = Math.round(PLAYER_K * (actual - expected));
  const playerRatingAfter = playerRatingBefore + playerDelta;

  const puzzlePlaysBefore = Number(puzzle?.aggregates?.plays || 0);
  const shouldUpdatePuzzleRating = puzzlePlaysBefore + 1 >= PUZZLE_RATING_MIN_PLAYS;
  const puzzleDelta = shouldUpdatePuzzleRating ? Math.round(PUZZLE_K * (expected - actual)) : 0;
  const puzzleRatingAfter = puzzleRatingBefore + puzzleDelta;

  const safetyHash = buildSafetyHash(input);
  const attemptDoc = {
    attemptId: input.attemptId,
    playerId,
    sessionId: input.sessionId,
    puzzleId: input.puzzleId,
    mode: input.mode,
    variantId: normalizedVariantId,
    result: input.result,
    stepVersion: input.stepVersion || null,
    contentVersion: input.contentVersion || null,
    finalFen: input.finalFen || null,
    expectedScore: expected,
    actualScore: actual,
    ratingDeltaPlayer: playerDelta,
    ratingDeltaPuzzle: puzzleDelta,
    playerRating: { before: playerRatingBefore, after: playerRatingAfter, delta: playerDelta },
    puzzleRating: {
      before: puzzleRatingBefore,
      after: puzzleRatingAfter,
      delta: puzzleDelta,
      updated: shouldUpdatePuzzleRating,
    },
    safetyHash,
    playedAtUnix: nowUnix,
    createdAtUnix: nowUnix,
  };

  try {
    await attempts.insertOne(attemptDoc);
  } catch (error) {
    if (error?.code === 11000) {
      const replay = await attempts.findOne({ attemptId: input.attemptId });
      return {
        ok: true,
        idempotentReplay: true,
        attemptId: input.attemptId,
        playerRating: replay?.playerRating,
        puzzleRating: replay?.puzzleRating,
      };
    }
    throw error;
  }

  const previousAttempts = Number(profile?.stats?.attempts || 0);
  const previousHintRate = Number(profile?.stats?.hintRate || 0);
  const previousAvgTime = Number(profile?.stats?.avgTimeMs || 0);
  const nextAttempts = previousAttempts + 1;

  const nextRecent = [input.puzzleId, ...(profile?.recentPuzzleIds || []).filter((id) => id !== input.puzzleId)].slice(
    0,
    PROFILE_RECENT_CAP
  );

  await profiles.updateOne(
    { playerId, variantId: normalizedVariantId },
    {
      $set: {
        globalRating: playerRatingAfter,
        provisional: nextAttempts < 20,
        recentPuzzleIds: nextRecent,
        updatedAtUnix: nowUnix,
        lastSeenAtUnix: nowUnix,
        "stats.attempts": nextAttempts,
        "stats.solved": Number(profile?.stats?.solved || 0) + (input.result.solved ? 1 : 0),
        "stats.failed": Number(profile?.stats?.failed || 0) + (input.result.solved ? 0 : 1),
        "stats.avgTimeMs": updateRollingAverage(previousAvgTime, previousAttempts, input.result.timeMs),
        "stats.hintRate": updateRollingAverage(previousHintRate, previousAttempts, input.result.hintsUsed > 0 ? 1 : 0),
      },
    }
  );

  const puzzlePlaysAfter = puzzlePlaysBefore + 1;
  const puzzleSolvesBefore = Number(puzzle?.aggregates?.solves || 0);
  const puzzleFailsBefore = Number(puzzle?.aggregates?.fails || 0);
  const puzzleAvgTimeBefore = Number(puzzle?.aggregates?.avgTimeMs || 0);
  const puzzleHintRateBefore = Number(puzzle?.aggregates?.hintRate || 0);

  await db.collection("puzzle_catalog").updateOne(
    { puzzleId: input.puzzleId },
    {
      $set: {
        updatedAt: new Date().toISOString(),
        "aggregates.plays": puzzlePlaysAfter,
        "aggregates.solves": puzzleSolvesBefore + (input.result.solved ? 1 : 0),
        "aggregates.fails": puzzleFailsBefore + (input.result.solved ? 0 : 1),
        "aggregates.avgTimeMs": updateRollingAverage(puzzleAvgTimeBefore, puzzlePlaysBefore, input.result.timeMs),
        "aggregates.hintRate": updateRollingAverage(
          puzzleHintRateBefore,
          puzzlePlaysBefore,
          input.result.hintsUsed > 0 ? 1 : 0
        ),
        "rating.plays": Number(puzzle?.rating?.plays || 0) + 1,
      },
      ...(shouldUpdatePuzzleRating ? { $inc: { "rating.value": puzzleDelta } } : {}),
    }
  );

  await db.collection("player_sessions").updateOne(
    { sessionId: input.sessionId, playerId },
    {
      $set: { sessionId: input.sessionId, playerId, variantId: normalizedVariantId, lastActivityAtUnix: nowUnix },
      $setOnInsert: { createdAtUnix: nowUnix },
    },
    { upsert: true }
  );

  return {
    ok: true,
    idempotentReplay: false,
    attemptId: input.attemptId,
    playerRating: attemptDoc.playerRating,
    puzzleRating: attemptDoc.puzzleRating,
  };
}
