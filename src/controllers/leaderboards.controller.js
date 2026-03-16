import { getDb } from "../config/mongo.js";

export async function getLeaderboard(req, res) {
  const db = getDb();
  const bucket = req.params.bucket;

  const rows = await db.collection("player_ratings")
    .find({
      bucket,
      provisional: false,
    })
    .sort({ rating: -1, rd: 1 })
    .limit(100)
    .toArray();

  res.json({ ok: true, bucket, rows });
}
