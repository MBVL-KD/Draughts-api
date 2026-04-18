import { connectMongo } from "../config/mongo.js";

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
await db.collection("player_puzzle_profiles").createIndex({ playerId: 1, variantId: 1 }, { unique: true });
await db.collection("puzzle_attempts").createIndex({ attemptId: 1 }, { unique: true });
await db.collection("puzzle_attempts").createIndex({ playerId: 1, playedAtUnix: -1 });
await db.collection("puzzle_attempts").createIndex({ puzzleId: 1, playedAtUnix: -1 });
await db.collection("player_sessions").createIndex({ sessionId: 1 }, { unique: true });
await db.collection("puzzle_catalog").createIndex({ active: 1, "meta.variantId": 1, "rating.value": 1 });
await db.collection("puzzle_catalog").createIndex({ bookId: 1, lessonId: 1, "meta.variantId": 1, active: 1 });
await db.collection("player_lesson_progress").createIndex({ playerId: 1, bookId: 1, lessonId: 1 }, { unique: true });
await db.collection("player_lesson_progress").createIndex({ playerId: 1, lastPlayedAtUnix: -1 });

console.log("Indexes created");
process.exit(0);
