const express = require("express");
const { MongoClient } = require("mongodb");

const app = express();
app.use(express.json({ limit: "256kb" }));

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "kid_draughts";
const API_KEY = process.env.API_KEY;

let Events, Players;

function requireApiKey(req, res, next) {
  const key = req.header("X-Api-Key") || "";
  if (!API_KEY || key !== API_KEY) return res.status(401).json({ ok: false 
});
  next();
}

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/roblox/events", requireApiKey, async (req, res) => {
  const { eventId, userId, type, ts, data } = req.body || {};
  if (!eventId || !userId || !type || !ts) {
    return res.status(400).json({ ok: false, error: "missing_fields" });
  }

  try {
    await Events.insertOne({
      eventId,
      userId: Number(userId),
      type,
      ts: Number(ts),
      data: data || {},
      receivedAt: Date.now(),
    });
  } catch (e) {
    if (String(e.code) === "11000") return res.json({ ok: true, deduped: 
true });
    console.error(e);
    return res.status(500).json({ ok: false, error: "db_error" });
  }

  const inc = {};
  if (type === "match_end") inc["totals.games"] = 1;
  if (type === "lesson_step_completed") inc["totals.lessonSteps"] = 1;

  await Players.updateOne(
    { userId: Number(userId) },
    {
      $set: { lastSeenAt: Number(ts) * 1000, lastEventType: type },
      ...(Object.keys(inc).length ? { $inc: inc } : {}),
      $setOnInsert: { createdAt: Date.now(), totals: { games: 0, 
lessonSteps: 0 } },
    },
    { upsert: true }
  );

  res.json({ ok: true });
});

app.get("/players/:userId/summary", async (req, res) => {
  const userId = Number(req.params.userId);
  const doc = await Players.findOne({ userId }, { projection: { _id: 0 } 
});
  res.json(doc || { userId, totals: { games: 0, lessonSteps: 0 } });
});

async function main() {
  if (!MONGODB_URI) throw new Error("Missing MONGODB_URI");
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  Events = db.collection("events");
  Players = db.collection("players");

  await Events.createIndex({ eventId: 1 }, { unique: true });
  await Events.createIndex({ userId: 1, ts: -1 });
  await Players.createIndex({ userId: 1 }, { unique: true });

  app.listen(PORT, () => console.log(`API on :${PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
