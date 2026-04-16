import { createHash } from "crypto";
import { getDb } from "../config/mongo.js";
import { env } from "../config/env.js";

const PLAYER_DEFAULT_RATING = 800;
const PROFILE_RECENT_CAP = 50;
const ANTI_REPEAT_PASSES = [50, 20, 10];
const MAX_PLAYBACK_RETRIES = 3;
const RATING_WINDOWS = {
  training: { minDelta: -50, maxDelta: 200 },
  lesson: { minDelta: -150, maxDelta: 100 },
};

function normalizePlayerId(playerId) {
  return String(playerId);
}

function seededUnit(seedInput) {
  const hash = createHash("sha256").update(seedInput).digest("hex");
  const int = parseInt(hash.slice(0, 12), 16);
  return int / 0xffffffffffff;
}

function weightedPick(candidates, rngUnit) {
  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  if (total <= 0) return candidates[0] ?? null;
  let cursor = rngUnit * total;
  for (const candidate of candidates) {
    cursor -= candidate.weight;
    if (cursor <= 0) return candidate;
  }
  return candidates[candidates.length - 1] ?? null;
}

function scoreCandidate(puzzle, playerRating) {
  const puzzleRating = Number(puzzle?.rating?.value || PLAYER_DEFAULT_RATING);
  const ratingDistance = Math.abs(puzzleRating - playerRating);
  const ratingDistanceScore = Math.max(0, 1 - Math.min(ratingDistance, 600) / 600);
  const qualityScore = Number(puzzle?.quality?.importConfidence ?? 0.6);
  const noveltyScore = 1;
  return ratingDistanceScore * 0.6 + noveltyScore * 0.2 + qualityScore * 0.2;
}

function normalizeRequiredLanguages(lang, requiredLanguage) {
  const fallbackLang = typeof lang === "string" && lang ? lang : "nl";
  if (!Array.isArray(requiredLanguage) || !requiredLanguage.length) return [fallbackLang, "en"];
  const deduped = [];
  for (const value of requiredLanguage) {
    if (typeof value !== "string" || !value) continue;
    if (!deduped.includes(value)) deduped.push(value);
  }
  if (!deduped.includes("en")) deduped.push("en");
  return deduped;
}

async function fetchPlaybackPayload({ puzzle, lang, requiredLanguage }) {
  const baseUrl = process.env.INTERNAL_API_BASE_URL || env.internalApiBaseUrl || "";
  const ownerType = process.env.PLAYBACK_OWNER_TYPE || env.playbackOwnerType || "";
  const ownerId = process.env.PLAYBACK_OWNER_ID || env.playbackOwnerId || "";
  if (!baseUrl || !ownerType || !ownerId) {
    throw new Error("Missing playback integration env vars");
  }

  const bookId = puzzle?.bookId;
  const lessonId = puzzle?.lessonId;
  const stepId = puzzle?.stepId || puzzle?.puzzleId;
  if (!bookId || !lessonId || !stepId) {
    throw new Error("Puzzle contentRef is incomplete");
  }

  const languages = normalizeRequiredLanguages(lang, requiredLanguage);
  const qs = new URLSearchParams({ bookId, lessonId, lang: languages[0] });
  for (const item of languages) qs.append("requiredLanguage", item);

  const url = `${baseUrl.replace(/\/$/, "")}/api/steps/${encodeURIComponent(stepId)}/playback?${qs.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-owner-type": ownerType,
      "x-owner-id": ownerId,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Playback request failed (${response.status}): ${body}`);
  }

  const json = await response.json();
  return json?.item || null;
}

async function getOrCreateProfile(db, playerId, variantId) {
  const coll = db.collection("player_puzzle_profiles");
  const nowUnix = Math.floor(Date.now() / 1000);
  await coll.updateOne(
    { playerId, variantId },
    {
      $setOnInsert: {
        playerId,
        variantId,
        globalRating: PLAYER_DEFAULT_RATING,
        provisional: true,
        recentPuzzleIds: [],
        stats: { attempts: 0, solved: 0, failed: 0, avgTimeMs: 0, hintRate: 0 },
        createdAtUnix: nowUnix,
      },
      $set: { updatedAtUnix: nowUnix, lastSeenAtUnix: nowUnix },
    },
    { upsert: true }
  );
  return coll.findOne({ playerId, variantId });
}

function buildExcludedSet(recentPuzzleIds, passLimit, requestExcludes) {
  const set = new Set(requestExcludes);
  for (const id of recentPuzzleIds.slice(0, passLimit)) set.add(id);
  return [...set];
}

export async function getNextPuzzle(input) {
  if (input.mode === "ranked") {
    return { error: { status: 409, body: { ok: false, error: "RANKED_DISABLED" } } };
  }
  if (input.mode === "lesson" && !input.lessonId && !input.bookId) {
    return { error: { status: 400, body: { ok: false, error: "LESSON_SCOPE_REQUIRED" } } };
  }

  const db = getDb();
  const playerId = normalizePlayerId(input.playerId);
  const profile = await getOrCreateProfile(db, playerId, input.variantId);
  const playerRating = Number(profile?.globalRating || PLAYER_DEFAULT_RATING);
  const window = RATING_WINDOWS[input.mode];
  const minRating = playerRating + window.minDelta;
  const maxRating = playerRating + window.maxDelta;

  let selectedPass = ANTI_REPEAT_PASSES[ANTI_REPEAT_PASSES.length - 1];
  let candidates = [];
  for (const pass of ANTI_REPEAT_PASSES) {
    const excludedIds = buildExcludedSet(profile?.recentPuzzleIds || [], pass, input.excludePuzzleIds || []);
    const query = {
      active: true,
      "meta.variantId": input.variantId,
      "rating.value": { $gte: minRating, $lte: maxRating },
      puzzleId: { $nin: excludedIds },
    };
    if (input.bookId) query.bookId = input.bookId;
    if (input.lessonId) query.lessonId = input.lessonId;

    candidates = await db.collection("puzzle_catalog").find(query).limit(120).toArray();
    if (candidates.length > 0) {
      selectedPass = pass;
      break;
    }
  }

  if (!candidates.length) {
    return { error: { status: 404, body: { ok: false, error: "NO_PUZZLE_AVAILABLE" } } };
  }

  const scored = candidates.map((puzzle) => ({
    puzzle,
    weight: Math.max(0.01, scoreCandidate(puzzle, playerRating)),
  }));
  const rngUnit = input.debug && input.seed
    ? seededUnit(`${input.seed}:${playerId}:${input.variantId}:${candidates.length}`)
    : Math.random();
  const shuffled = [...scored].sort((a, b) => b.weight - a.weight);
  const picked = weightedPick(scored, rngUnit)?.puzzle;
  if (picked) {
    shuffled.sort((a, b) => (a.puzzle.puzzleId === picked.puzzleId ? -1 : b.weight - a.weight));
  }

  let selected = null;
  let playbackPayload = null;
  let candidateRetriesUsed = 0;
  for (const candidate of shuffled.slice(0, MAX_PLAYBACK_RETRIES + 1)) {
    try {
      playbackPayload = await fetchPlaybackPayload({
        puzzle: candidate.puzzle,
        lang: input.lang,
        requiredLanguage: input.requiredLanguage,
      });
      if (playbackPayload) {
        selected = candidate.puzzle;
        break;
      }
    } catch (_error) {
      candidateRetriesUsed += 1;
    }
  }

  if (!selected || !playbackPayload) {
    return {
      error: {
        status: 503,
        body: { ok: false, error: "PLAYBACK_UNAVAILABLE", message: "Playback could not be generated after retries." },
      },
    };
  }

  const sessionId = input.sessionId || `sess_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  return {
    ok: true,
    sessionId,
    puzzle: {
      puzzleId: selected.puzzleId,
      runtimeKey: selected.runtimeKey,
      bookId: selected.bookId,
      lessonId: selected.lessonId,
      stepId: selected.stepId,
      variantId: selected?.meta?.variantId,
      topicTags: selected?.meta?.topicTags || [],
      difficultyBand: selected?.meta?.difficultyBand || null,
      playbackPayload,
    },
    contentRef: {
      bookId: selected.bookId,
      lessonId: selected.lessonId,
      stepId: selected.stepId,
      stepVersion: selected?.source?.contentUpdatedAt || null,
    },
    playerSnapshot: {
      globalRating: playerRating,
      provisional: Boolean(profile?.provisional),
    },
    debugInfo: input.debug
      ? {
          enabled: true,
          seedUsed: input.seed || null,
          exclusionPass: selectedPass,
          windowMin: minRating,
          windowMax: maxRating,
          candidateCount: candidates.length,
          candidateRetriesUsed,
        }
      : undefined,
    meta: {
      profileRecentCap: PROFILE_RECENT_CAP,
    },
  };
}
