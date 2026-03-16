import { connectMongo } from "../src/config/mongo.js";

const db = await connectMongo();

await db.collection("matches").createIndex({ matchId: 1 }, { unique: true });
await db.collection("matches").createIndex({ whiteUserId: 1, endedAtUnix: -1 });
await db.collection("matches").createIndex({ blackUserId: 1, endedAtUnix: -1 });
await db.collection("matches").createIndex({ tournamentId: 1, endedAtUnix: -1 });
await db.collection("matches").createIndex({ ratingBucket: 1, endedAtUnix: -1 });

await db.collection("player_ratings").createIndex({ userId: 1, bucket: 1 }, { unique: true });
await db.collection("player_rating_history").createIndex({ userId: 1, processedAtUnix: -1 });
await db.collection("player_rating_history").createIndex({ matchId: 1 });
await db.collection("player_profiles").createIndex({ userId: 1 }, { unique: true });

console.log("Indexes created");
process.exit(0);
