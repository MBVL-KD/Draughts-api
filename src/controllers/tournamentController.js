import { ObjectId } from "mongodb";
import { connectMongo } from "../config/mongo.js";

const COLLECTION = "tournaments";

function parseLimit(raw, fallback = 20, max = 50) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function buildTournamentListQuery(queryParams = {}) {
  const {
    status,
    variantId,
    timeClass,
    cursorUpdatedAt,
    cursorId,
  } = queryParams;

  const query = {
    "stats.matchesPlayed": { $gt: 0 },
  };

  if (typeof status === "string" && status.trim() !== "") {
    query.status = status.trim();
  }

  if (typeof variantId === "string" && variantId.trim() !== "") {
    query.variantId = variantId.trim();
  }

  if (typeof timeClass === "string" && timeClass.trim() !== "") {
    query.timeClass = timeClass.trim();
  }

  if (
    cursorUpdatedAt !== undefined &&
    cursorUpdatedAt !== null &&
    cursorId !== undefined &&
    cursorId !== null
  ) {
    const ts = Number(cursorUpdatedAt);
    const id = String(cursorId);

    if (Number.isFinite(ts) && ObjectId.isValid(id)) {
      query.$or = [
        { updatedAt: { $lt: ts } },
        {
          updatedAt: ts,
          _id: { $lt: new ObjectId(id) },
        },
      ];
    }
  }

  return query;
}

function buildNextCursor(page, hasMore) {
  if (!hasMore || !Array.isArray(page) || page.length === 0) {
    return null;
  }

  const last = page[page.length - 1];
  return {
    updatedAt: last.updatedAt,
    id: String(last._id),
  };
}

function sanitizeTournamentForList(doc) {
  if (!doc) return null;

  return {
    _id: doc._id,
    id: doc.id,
    recordType: doc.recordType,
    recordVersion: doc.recordVersion,

    templateKey: doc.templateKey,
    templateId: doc.templateId,

    name: doc.name,
    system: doc.system,

    variantId: doc.variantId,
    rulesetId: doc.rulesetId,
    scenarioId: doc.scenarioId,

    timeClass: doc.timeClass,
    timeControl: doc.timeControl,

    frequency: doc.frequency,
    rated: doc.rated,
    allowSpectators: doc.allowSpectators,
    allowAI: doc.allowAI,

    status: doc.status,
    isFinal: doc.isFinal,

    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    startAt: doc.startAt,
    endAt: doc.endAt,

    scheduleKey: doc.scheduleKey,
    scheduleBucket: doc.scheduleBucket,

    islandTemplate: doc.islandTemplate,
    islandArenaId: doc.islandArenaId,
    islandModelName: doc.islandModelName,

    playerCounts: doc.playerCounts,
    stats: doc.stats,
  };
}

export async function upsertTournament(req, res) {
  try {
    const { payload } = req.body || {};

    if (!payload || !payload.id) {
      return res.status(400).json({ error: "INVALID_PAYLOAD" });
    }

    const matchesPlayed = Number(payload?.stats?.matchesPlayed || 0);

    if (matchesPlayed <= 0) {
      return res.json({
        ok: true,
        skipped: true,
        reason: "no_matches_played",
      });
    }

    const db = await connectMongo();
    const collection = db.collection(COLLECTION);

    await collection.findOneAndUpdate(
      { id: payload.id },
      {
        $set: {
          ...payload,
          updatedAt: Number(payload.updatedAt || Date.now()),
        },
      },
      {
        upsert: true,
      }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("Tournament upsert error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

export async function finalizeTournament(req, res) {
  try {
    const { payload } = req.body || {};

    if (!payload || !payload.id) {
      return res.status(400).json({ error: "INVALID_PAYLOAD" });
    }

    const matchesPlayed = Number(payload?.stats?.matchesPlayed || 0);

    if (matchesPlayed <= 0) {
      return res.json({
        ok: true,
        skipped: true,
        reason: "no_matches_played",
      });
    }

    const db = await connectMongo();
    const collection = db.collection(COLLECTION);

    await collection.findOneAndUpdate(
      { id: payload.id },
      {
        $set: {
          ...payload,
          isFinal: true,
          finalizedAt: Date.now(),
          updatedAt: Number(payload.updatedAt || Date.now()),
        },
      },
      {
        upsert: true,
      }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("Tournament finalize error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

export async function getTournaments(req, res) {
  try {
    const safeLimit = parseLimit(req.query.limit, 20, 50);
    const query = buildTournamentListQuery(req.query);

    const db = await connectMongo();
    const collection = db.collection(COLLECTION);

    const docs = await collection
      .find(query, {
        projection: {
          standings: 0,
          liveMatches: 0,
          recentMatches: 0,
          matchHistory: 0,
        },
      })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(safeLimit + 1)
      .toArray();

    const hasMore = docs.length > safeLimit;
    const page = hasMore ? docs.slice(0, safeLimit) : docs;
    const nextCursor = buildNextCursor(page, hasMore);

    return res.json({
      ok: true,
      tournaments: page.map(sanitizeTournamentForList),
      hasMore,
      nextCursor,
    });
  } catch (err) {
    console.error("getTournaments error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

export async function getTournament(req, res) {
  try {
    const { id } = req.params || {};

    if (!id) {
      return res.status(400).json({ error: "MISSING_ID" });
    }

    const db = await connectMongo();
    const collection = db.collection(COLLECTION);

    const tournament = await collection.findOne({
      id,
      "stats.matchesPlayed": { $gt: 0 },
    });

    if (!tournament) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    return res.json({
      ok: true,
      tournament,
    });
  } catch (err) {
    console.error("getTournament error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}
