/**
 * index.js — Kid Draughts API (Events + Games + Players + PDN export)
 *
 * Endpoints:
 *  - GET  /health
 *  - POST /roblox/events            (append-only audit/analytics)
 *  - POST /roblox/games/upsert      (create/update game header at start)
 *  - POST /roblox/games/finalize    (store full game incl moves + generate PDN)
 *  - GET  /games/:gameId/pdn        (export PDN)
 *  - GET  /players/:userId/summary  (simple player summary)
 *
 * Env:
 *  - MONGODB_URI (required)
 *  - API_KEY     (required, used as X-Api-Key)
 *  - DB_NAME     (optional, default "kid_draughts")
 *  - PORT        (optional, default 3000)
 */

const express = require("express");
const { MongoClient } = require("mongodb");
const { generatePDN } = require("./pdn");

const app = express();
app.use(express.json({ limit: "256kb" }));

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "kid_draughts";
const API_KEY = process.env.API_KEY;

let Events, Players, Games;

function requireApiKey(req, res, next) {
  const key = req.header("X-Api-Key") || "";
  if (!API_KEY || key !== API_KEY) return res.status(401).json({ ok: false });
  next();
}

function toInt(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

app.get("/health", (req, res) => res.json({ ok: true }));

/**
 * POST /roblox/events
 * Body:
 * {
 *   eventId: string (required),
 *   userId: number (required for now),
 *   type: string (required),
 *   ts: number (unix seconds, required),
 *   data: object,
 *   gameId?: string,
 *   correlationId?: string,
 *   sessionId?: string,
 *   schemaVersion?: number
 * }
 */
app.post("/roblox/events", requireApiKey, async (req, res) => {
  const {
    eventId,
    userId,
    type,
    ts,
    data,
    gameId = null,
    correlationId = null,
    sessionId = null,
    schemaVersion = 1,
  } = req.body || {};

  if (!eventId || userId === undefined || !type || !ts) {
    return res.status(400).json({ ok: false, error: "missing_fields" });
  }

  try {
    await Events.insertOne({
      eventId,
      userId: toInt(userId),
      type,
      ts: toInt(ts),
      gameId,
      correlationId,
      sessionId,
      schemaVersion: toInt(schemaVersion, 1),
      data: data || {},
      receivedAt: Date.now(),
    });
  } catch (e) {
    // Duplicate eventId -> idempotent retry ok
    if (String(e.code) === "11000") return res.json({ ok: true, deduped: true });
    console.error(e);
    return res.status(500).json({ ok: false, error: "db_error" });
  }

  // Minimal rolling summary (extend later)
  const inc = {};
  if (type === "match_end") inc["totals.games"] = 1;
  if (type === "lesson_step_completed") inc["totals.lessonSteps"] = 1;

  try {
    await Players.updateOne(
      { userId: toInt(userId) },
      {
        $set: {
          lastSeenAt: toInt(ts) * 1000,
          lastEventType: type,
          lastEventAt: Date.now(),
        },
        ...(Object.keys(inc).length ? { $inc: inc } : {}),
        $setOnInsert: { createdAt: Date.now(), totals: { games: 0, lessonSteps: 0 } },
      },
      { upsert: true }
    );
  } catch (e) {
    // Don't fail the event insert response for summary issues
    console.error("[players.updateOne] failed:", e);
  }

  res.json({ ok: true });
});

/**
 * POST /roblox/games/upsert
 * Recommended at match start (header only)
 * Body minimal:
 * {
 *   gameId, variant, startFen,
 *   white:{userId,display,isAI?,aiLevel?},
 *   black:{userId,display,isAI?,aiLevel?},
 *   mode?, rated?, timeControl?, correlationId?
 * }
 */
app.post("/roblox/games/upsert", requireApiKey, async (req, res) => {
  const g = req.body || {};
  if (!g.gameId || !g.variant || !g.white || !g.black || !g.startFen) {
    return res.status(400).json({ ok: false, error: "missing_fields" });
  }

  await Games.updateOne(
    { gameId: g.gameId },
    {
      $setOnInsert: {
        gameId: g.gameId,
        createdAt: Date.now(),
        status: "running",
      },
      $set: {
        updatedAt: Date.now(),
        mode: g.mode || "pvp",
        variant: g.variant,
        rated: !!g.rated,
        timeControl: g.timeControl || null,
        white: g.white,
        black: g.black,
        correlationId: g.correlationId || null,
        startFen: g.startFen,
      },
    },
    { upsert: true }
  );

  res.json({ ok: true });
});

/**
 * POST /roblox/games/finalize
 * Call once at match end with full moves + final state.
 * Body minimal:
 * {
 *  gameId, result, finalFen, moves:[...],
 *  variant?, endReason?, stats?, ratings?,
 *  white?, black?, timeControl?, rated?
 * }
 */
app.post("/roblox/games/finalize", requireApiKey, async (req, res) => {
  const g = req.body || {};
  if (!g.gameId || !g.result || !g.finalFen || !Array.isArray(g.moves)) {
    return res.status(400).json({ ok: false, error: "missing_fields" });
  }

  // Generate PDN from stored moves (notation-driven v1)
  const pdn = generatePDN({
    gameId: g.gameId,
    variant: g.variant || "International",
    white: g.white || { display: "White" },
    black: g.black || { display: "Black" },
    result: g.result,
    moves: g.moves,
    timeControl: g.timeControl || null,
    rated: !!g.rated,
  });

  await Games.updateOne(
    { gameId: g.gameId },
    {
      $setOnInsert: { createdAt: Date.now() },
      $set: {
        updatedAt: Date.now(),
        endAt: Date.now(),
        status: "finished",
        mode: g.mode || "pvp",
        variant: g.variant || "International",
        rated: !!g.rated,
        timeControl: g.timeControl || null,
        white: g.white || null,
        black: g.black || null,
        correlationId: g.correlationId || null,

        result: g.result,
        endReason: g.endReason || null,
        finalFen: g.finalFen,
        moves: g.moves,
        stats: g.stats || null,
        ratings: g.ratings || null,

        pdn: { tags: pdn.tags, text: pdn.text }, // cached PDN v1
      },
    },
    { upsert: true }
  );

  res.json({ ok: true });
});

/**
 * GET /games/:gameId/pdn
 * Returns cached PDN text if present; otherwise generates on the fly.
 */
app.get("/games/:gameId/pdn", async (req, res) => {
  const g = await Games.findOne({ gameId: req.params.gameId });
  if (!g) return res.status(404).send("Not found");

  if (g.pdn?.text) return res.type("text/plain").send(g.pdn.text);

  const pdn = generatePDN(g);
  res.type("text/plain").send(pdn.text);
});

/**
 * GET /players/:userId/summary
 */
app.get("/players/:userId/summary", async (req, res) => {
  const userId = toInt(req.params.userId);
  const doc = await Players.findOne({ userId }, { projection: { _id: 0 } });
  res.json(doc || { userId, totals: { games: 0, lessonSteps: 0 } });
});

async function main() {
  if (!MONGODB_URI) throw new Error("Missing MONGODB_URI");
  if (!API_KEY) throw new Error("Missing API_KEY");

  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  await client.connect();

  const db = client.db(DB_NAME);
  Events = db.collection("events");
  Players = db.collection("players");
  Games = db.collection("games");

  // Indexes
  await Events.createIndex({ eventId: 1 }, { unique: true });
  await Events.createIndex({ userId: 1, ts: -1 });
  await Events.createIndex({ gameId: 1, ts: -1 });

  await Players.createIndex({ userId: 1 }, { unique: true });

  await Games.createIndex({ gameId: 1 }, { unique: true });
  await Games.createIndex({ "white.userId": 1, createdAt: -1 });
  await Games.createIndex({ "black.userId": 1, createdAt: -1 });

  app.listen(PORT, () => console.log(`API on :${PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
