import { getDb } from "../config/mongo.js";

/** Aligned with puzzleResult.service.js PLAYER_DEFAULT_RATING */
export const PUZZLE_STATS_DEFAULT_RATING = 800;

/**
 * Streak rules (documented for clients):
 * - Attempts are ordered by playedAtUnix ascending (tie-break _id).
 * - A failed attempt (result.solved !== true) resets the running streak to 0.
 * - current = consecutive successes from the most recent attempt backward.
 * - best = maximum consecutive successes anywhere in history.
 */
export function computeStreaksFromAttemptRows(rows) {
  let best = 0;
  let running = 0;
  for (const row of rows) {
    const solved = row?.result?.solved === true;
    if (solved) {
      running += 1;
      if (running > best) best = running;
    } else {
      running = 0;
    }
  }

  let current = 0;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i]?.result?.solved === true) current += 1;
    else break;
  }

  return { current, best };
}

function normalizeVariantKey(variantId) {
  if (typeof variantId !== "string" || variantId.trim() === "") return "unknown";
  return variantId.trim().toLowerCase();
}

/**
 * Global rating: weighted average of per-variant ratings (from player_puzzle_profiles),
 * weighted by attempt counts from aggregation. Falls back to default when no weight.
 */
function computeGlobalRating(variantStats, profilesByVariant) {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const row of variantStats) {
    const key = normalizeVariantKey(row._id);
    const w = Number(row.attempted || 0);
    if (w <= 0) continue;
    const prof = profilesByVariant.get(key);
    const r = Number(prof?.globalRating ?? PUZZLE_STATS_DEFAULT_RATING);
    weightedSum += r * w;
    weightTotal += w;
  }
  if (weightTotal <= 0) return PUZZLE_STATS_DEFAULT_RATING;
  return Math.round(weightedSum / weightTotal);
}

/** Heuristic "deviation": high uncertainty while provisional / few attempts. */
function computeDeviation(totalAttempted, provisional) {
  if (provisional || totalAttempted < 20) return 200;
  return 75;
}

/**
 * @param {number} userId — Roblox user id (numeric); stored as string playerId in puzzle collections
 */
export async function buildPuzzleStatsResponse(userId) {
  const playerId = String(userId);
  const db = getDb();
  const attempts = db.collection("puzzle_attempts");
  const profiles = db.collection("player_puzzle_profiles");

  const [profileDocs, variantAgg, streakRows] = await Promise.all([
    profiles.find({ playerId }).toArray(),
    attempts
      .aggregate([
        { $match: { playerId } },
        {
          $group: {
            _id: "$variantId",
            solved: { $sum: { $cond: [{ $eq: ["$result.solved", true] }, 1, 0] } },
            attempted: { $sum: 1 },
            hintsUsed: { $sum: { $ifNull: ["$result.hintsUsed", 0] } },
            lastAt: { $max: "$playedAtUnix" },
          },
        },
      ])
      .toArray(),
    attempts
      .find({ playerId })
      .project({ playedAtUnix: 1, result: 1 })
      .sort({ playedAtUnix: 1, _id: 1 })
      .toArray(),
  ]);

  const profilesByVariant = new Map();
  for (const p of profileDocs) {
    profilesByVariant.set(normalizeVariantKey(p.variantId), p);
  }

  let solvedTotal = 0;
  let attemptedTotal = 0;
  let hintsTotal = 0;
  let lastActivityAt = null;

  const byVariant = {};

  for (const row of variantAgg) {
    const key = normalizeVariantKey(row._id);
    const solved = Number(row.solved || 0);
    const attempted = Number(row.attempted || 0);
    const hints = Number(row.hintsUsed || 0);
    solvedTotal += solved;
    attemptedTotal += attempted;
    hintsTotal += hints;

    const prof = profilesByVariant.get(key);
    const ratingVal = Number(prof?.globalRating ?? PUZZLE_STATS_DEFAULT_RATING);
    const lastAt = Number(row.lastAt);
    if (Number.isFinite(lastAt) && (lastActivityAt === null || lastAt > lastActivityAt)) {
      lastActivityAt = lastAt;
    }

    byVariant[key] = {
      solved,
      attempted,
      rating: ratingVal,
      provisional: prof?.provisional !== false,
    };
  }

  for (const [key, prof] of profilesByVariant.entries()) {
    if (byVariant[key]) continue;
    const r = Number(prof.globalRating ?? PUZZLE_STATS_DEFAULT_RATING);
    const updated = Number(prof.updatedAtUnix);
    byVariant[key] = {
      solved: 0,
      attempted: 0,
      rating: r,
      provisional: prof.provisional !== false,
    };
    if (Number.isFinite(updated) && (lastActivityAt === null || updated > lastActivityAt)) {
      lastActivityAt = updated;
    }
  }

  const streaks = computeStreaksFromAttemptRows(streakRows);

  const anyProvisional = profileDocs.some((p) => p.provisional !== false);
  const ratingValue = computeGlobalRating(variantAgg, profilesByVariant);
  const deviation = computeDeviation(attemptedTotal, anyProvisional || attemptedTotal < 20);

  return {
    schemaVersion: 1,
    ok: true,
    userId,
    rating: {
      value: ratingValue,
      deviation,
      scope: "global",
    },
    totals: {
      solved: solvedTotal,
      attempted: attemptedTotal,
      hintsUsed: hintsTotal,
    },
    streaks,
    lastActivityAt,
    byVariant,
  };
}
