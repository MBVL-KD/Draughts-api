import { getDb } from "../config/mongo.js";

export async function getPlayerProfile(req, res) {
  const db = getDb();
  const userId = Number(req.params.userId);

  const profile = await db.collection("player_profiles").findOne({ userId });
  res.json({ ok: true, profile });
}

export async function getRecentGames(req, res) {
  const db = getDb();
  const userId = Number(req.params.userId);

  const games = await db.collection("matches")
    .find({
      $or: [{ whiteUserId: userId }, { blackUserId: userId }],
    })
    .sort({ endedAtUnix: -1 })
    .limit(20)
    .toArray();

  res.json({ ok: true, games });
}

export async function getPlayerRatings(req, res) {
  const db = getDb();
  const userId = Number(req.params.userId);

  const ratings = await db.collection("player_ratings")
    .find({ userId })
    .sort({ bucket: 1 })
    .toArray();

  res.json({ ok: true, ratings });
}
