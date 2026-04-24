import { getDb } from "../config/mongo.js";
import { buildPuzzleStatsResponse } from "./puzzleStats.service.js";

function buildAdminProfile(doc, ratings = []) {
  return {
    robloxUserId: doc.userId,
    username: doc.username ?? null,
    displayName: doc.displayName ?? null,
    status: doc.status ?? "active",
    externalRefs: doc.externalRefs ?? {},
    ratings: ratings.map((r) => ({
      bucket: r.bucket,
      rating: r.rating,
      rd: r.rd ?? null,
      provisional: r.provisional === true,
      ratedGames: r.ratedGames ?? 0,
      updatedAtUnix: r.updatedAtUnix ?? null,
    })),
    stats: doc.stats ?? { gamesTotal: 0, wins: 0, losses: 0, draws: 0 },
    coins: doc.coins ?? 0,
    level: doc.level ?? 1,
    xp: doc.xp ?? 0,
    badges: Array.isArray(doc.badges) ? doc.badges : [],
    firstSeenAtUnix: doc.firstSeenAtUnix ?? null,
    lastSeenAtUnix: doc.lastSeenAtUnix ?? null,
    createdAtUnix: doc.createdAtUnix ?? null,
  };
}

export async function preRegisterPlayer(robloxUserId, childRef) {
  const db = getDb();
  const profiles = db.collection("player_profiles");
  const now = Math.floor(Date.now() / 1000);

  const existing = await profiles.findOne({ userId: robloxUserId });

  if (existing) {
    if (!existing.externalRefs?.childRef) {
      await profiles.updateOne(
        { userId: robloxUserId },
        { $set: { "externalRefs.childRef": childRef, updatedAtUnix: now } }
      );
    }
    const updated = await profiles.findOne({ userId: robloxUserId });
    const ratings = await db
      .collection("player_ratings")
      .find({ userId: robloxUserId })
      .sort({ bucket: 1 })
      .toArray();
    return { created: false, player: buildAdminProfile(updated, ratings) };
  }

  const doc = {
    userId: robloxUserId,
    username: null,
    displayName: null,
    status: "pre_registered",
    externalRefs: { childRef },
    coins: 0,
    level: 1,
    xp: 0,
    badges: [],
    stats: { gamesTotal: 0, wins: 0, losses: 0, draws: 0 },
    createdAtUnix: now,
    firstSeenAtUnix: null,
    lastSeenAtUnix: null,
    updatedAtUnix: now,
  };
  await profiles.insertOne(doc);
  return { created: true, player: buildAdminProfile(doc, []) };
}

export async function getPlayerByChildRef(childRef) {
  const db = getDb();
  const profile = await db
    .collection("player_profiles")
    .findOne({ "externalRefs.childRef": childRef });
  if (!profile) return null;
  const ratings = await db
    .collection("player_ratings")
    .find({ userId: profile.userId })
    .sort({ bucket: 1 })
    .toArray();
  return buildAdminProfile(profile, ratings);
}

export async function batchGetProfiles(userIds) {
  const db = getDb();
  const [profiles, ratings] = await Promise.all([
    db.collection("player_profiles").find({ userId: { $in: userIds } }).toArray(),
    db.collection("player_ratings").find({ userId: { $in: userIds } }).toArray(),
  ]);

  const ratingsByUser = new Map();
  for (const r of ratings) {
    const arr = ratingsByUser.get(r.userId) ?? [];
    arr.push(r);
    ratingsByUser.set(r.userId, arr);
  }

  return profiles.map((p) => buildAdminProfile(p, ratingsByUser.get(p.userId) ?? []));
}

export async function getAdminPlayerProfile(userId) {
  const db = getDb();
  const [profile, ratings] = await Promise.all([
    db.collection("player_profiles").findOne({ userId }),
    db.collection("player_ratings").find({ userId }).sort({ bucket: 1 }).toArray(),
  ]);
  if (!profile) return null;
  return buildAdminProfile(profile, ratings);
}

export async function getAdminGames(userId, limit = 20) {
  const db = getDb();
  const docs = await db
    .collection("matches")
    .find({ $or: [{ whiteUserId: userId }, { blackUserId: userId }] })
    .sort({ endedAtUnix: -1, _id: -1 })
    .limit(limit)
    .toArray();

  return docs.map((m) => {
    const isWhite = m.whiteUserId === userId;
    const opponent = isWhite
      ? { robloxUserId: m.blackUserId, displayName: m.blackDisplayName ?? m.blackPlayerName ?? null }
      : { robloxUserId: m.whiteUserId, displayName: m.whiteDisplayName ?? m.whitePlayerName ?? null };
    const result = m.result === "1-0" ? (isWhite ? "win" : "loss")
      : m.result === "0-1" ? (isWhite ? "loss" : "win")
      : m.result === "1/2-1/2" ? "draw" : null;
    return {
      matchId: m.matchId ?? null,
      variant: m.variant ?? null,
      ruleset: m.ruleset ?? null,
      rated: m.rated === true,
      result,
      color: isWhite ? "white" : "black",
      opponent,
      ratingBucket: m.ratingBucket ?? m.bucket ?? null,
      startedAtUnix: m.startedAtUnix ?? null,
      endedAtUnix: m.endedAtUnix ?? null,
      durationSec: m.durationSec ?? null,
      tournamentId: m.tournamentId ?? null,
    };
  });
}

export async function getAdminLessonSummary(userId) {
  const db = getDb();
  const playerId = String(userId);
  const docs = await db
    .collection("player_lesson_progress")
    .find({ playerId })
    .sort({ lastPlayedAtUnix: -1 })
    .limit(200)
    .toArray();

  const bookIds = new Set(docs.map((d) => d.bookId));
  const completed = docs.filter(
    (d) =>
      d.totalStepsKnown > 0 &&
      Array.isArray(d.completedStepIds) &&
      d.completedStepIds.length >= d.totalStepsKnown
  );

  return {
    booksStarted: bookIds.size,
    lessonsStarted: docs.length,
    lessonsCompleted: completed.length,
    recentProgress: docs.slice(0, 10).map((d) => ({
      bookId: d.bookId,
      lessonId: d.lessonId,
      completedSteps: Array.isArray(d.completedStepIds) ? d.completedStepIds.length : 0,
      totalSteps: d.totalStepsKnown ?? null,
      lastPlayedAtUnix: d.lastPlayedAtUnix ?? null,
    })),
  };
}

export async function getAdminPuzzleSummary(userId) {
  return buildPuzzleStatsResponse(userId);
}

export async function getAdminTournaments(userId, limit = 20) {
  const db = getDb();
  const docs = await db
    .collection("tournaments")
    .find({ recordType: "tournament_snapshot", "standings.userId": userId })
    .sort({ endAt: -1, _id: -1 })
    .limit(limit)
    .toArray();

  return docs.map((t) => {
    const standing = (t.standings ?? []).find((s) => s.userId === userId);
    return {
      tournamentId: t.id ?? null,
      name: t.name ?? null,
      variantId: t.variantId ?? null,
      status: t.status ?? null,
      rank: standing?.rank ?? standing?.finalRank ?? null,
      points: standing?.points ?? null,
      wins: standing?.wins ?? null,
      draws: standing?.draws ?? null,
      losses: standing?.losses ?? null,
      gamesPlayed: standing?.games ?? null,
      endedAtUnix: t.endAt ?? null,
    };
  });
}
