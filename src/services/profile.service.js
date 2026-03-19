import { getDb } from "../config/mongo.js";

export async function patchProfilesFromMatch(payload) {
  if (!payload.countsForProfileStats) return;

  const db = getDb();
  const profiles = db.collection("player_profiles");
  const ratings = db.collection("player_ratings");

  const now = Math.floor(Date.now() / 1000);

  for (const side of ["white", "black"]) {
    const userId = payload[`${side}UserId`];
    if (!userId) continue;

    const bucket = payload.ratingBucket;
    const ratingDoc = bucket ? await ratings.findOne({ userId, bucket }) : null;

    const won =
      payload.outcome === "win" &&
      ((side === "white" && payload.winnerSide === "W") ||
        (side === "black" && payload.winnerSide === "B"));

    const drew = payload.outcome === "draw";
    const lost = payload.outcome === "win" && !won;

    await profiles.updateOne(
      { userId },
      {
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
            draws: 0,
          },
          totals: {
            wins: 0,
            draws: 0,
            losses: 0,
            ratedGames: 0,
            casualGames: 0,
          },
        },
        $set: {
          updatedAtUnix: now,
          lastSeenAtUnix: now,
          ...(ratingDoc
            ? {
                [`ratings.${bucket}`]: {
                  rating: ratingDoc.rating,
                  rd: ratingDoc.rd,
                  provisional: ratingDoc.provisional,
                  ratedGames: ratingDoc.ratedGames,
                },
              }
            : {}),
        },
        $inc: {
          "totals.wins": won ? 1 : 0,
          "totals.draws": drew ? 1 : 0,
          "totals.losses": lost ? 1 : 0,
          "totals.ratedGames": payload.rated ? 1 : 0,
          "totals.casualGames": payload.rated ? 0 : 1,
        },
        $push: {
          recentMatchIds: {
            $each: [payload.matchId],
            $position: 0,
            $slice: 20,
          },
        },
      },
      { upsert: true }
    );
  }
}
