import { getDb } from "../config/mongo.js";

export async function syncPlayer(req, res) {
  const db = getDb();

  const userId = Number(req.body.userId);
  const username = String(req.body.username || "");
  const displayName = String(req.body.displayName || "");

  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({
      ok: false,
      error: "BAD_USER_ID"
    });
  }

  const now = Math.floor(Date.now() / 1000);

  const result = await db.collection("player_profiles").updateOne(
    { userId },
    {
      $set: {
        username,
        displayName,
        lastSeenAtUnix: now,
        updatedAtUnix: now
      },
      $setOnInsert: {
        userId,
        coins: 0,
        level: 1,
        xp: 0,
        badges: [],
        createdAtUnix: now,
        firstSeenAtUnix: now,
        stats: {
          gamesTotal: 0,
          wins: 0,
          losses: 0,
          draws: 0
        }
      }
    },
    { upsert: true }
  );

  res.json({
    ok: true,
    upserted: result.upsertedCount > 0
  });
}
