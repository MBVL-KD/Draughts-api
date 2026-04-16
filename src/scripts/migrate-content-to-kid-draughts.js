import { MongoClient, ServerApiVersion } from "mongodb";
import { createHash } from "crypto";
import { env } from "../config/env.js";

const sourceDbName = process.env.MIGRATION_SOURCE_DB || "test";
const targetDbName = process.env.MIGRATION_TARGET_DB || env.mongoDbName || "kid-draughts";
const collectionsCsv = process.env.MIGRATION_COLLECTIONS || "books";
const collectionNames = collectionsCsv
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const batchSize = Number(process.env.MIGRATION_BATCH_SIZE || 500);
const rebuildPuzzleCatalog = (process.env.REBUILD_PUZZLE_CATALOG || "true").toLowerCase() === "true";
const deactivateMissing = (process.env.DEACTIVATE_MISSING_PUZZLES || "true").toLowerCase() === "true";
const pruneStaleCatalogDocs = (process.env.PRUNE_STALE_PUZZLE_CATALOG || "true").toLowerCase() === "true";
const puzzleBookName = (process.env.PUZZLE_BOOK_NAME || "Puzzels").trim().toLowerCase();
const nowIso = new Date().toISOString();
const runId = `run:${Date.now()}`;

if (!env.mongoUri) {
  throw new Error("Missing MONGODB_URI");
}

if (sourceDbName === targetDbName) {
  throw new Error("Source and target DB names must be different for migration safety.");
}

const client = new MongoClient(env.mongoUri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

function normalizeId(value) {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    if (value.$oid) return String(value.$oid);
    if (typeof value.toHexString === "function") return value.toHexString();
    if (value.toString) return String(value.toString());
  }
  return null;
}

function getBookTitleText(bookDoc) {
  if (typeof bookDoc?.title === "string") return bookDoc.title;
  if (typeof bookDoc?.name === "string") return bookDoc.name;
  if (typeof bookDoc?.bookName === "string") return bookDoc.bookName;
  const values = bookDoc?.title?.values;
  if (values && typeof values === "object") {
    if (typeof values.nl === "string" && values.nl.trim()) return values.nl;
    if (typeof values.en === "string" && values.en.trim()) return values.en;
    const first = Object.values(values).find((v) => typeof v === "string" && v.trim());
    if (typeof first === "string") return first;
  }
  return "";
}

function* extractPuzzlesFromBook(bookDoc) {
  const bookTitle = getBookTitleText(bookDoc).trim().toLowerCase();
  if (bookTitle !== puzzleBookName) return;

  const ownerId =
    normalizeId(bookDoc.ownerId) ||
    normalizeId(bookDoc.ownerUserId) ||
    normalizeId(bookDoc.createdByUserId) ||
    "owner-unknown";
  const bookId = normalizeId(bookDoc.bookId) || normalizeId(bookDoc._id);
  const lessons = Array.isArray(bookDoc.lessons) ? bookDoc.lessons : [];

  for (const lesson of lessons) {
    const lessonId = normalizeId(lesson.lessonId) || normalizeId(lesson.id) || normalizeId(lesson._id);
    const steps = Array.isArray(lesson.steps) ? lesson.steps : [];

    for (const step of steps) {
      const stepId = normalizeId(step.stepId) || normalizeId(step.id) || normalizeId(step._id);
      if (!stepId) continue;

      const puzzleId = stepId;
      const runtimeKeyInput = `${ownerId}:${bookId || "book-unknown"}:${lessonId || "lesson-unknown"}:${stepId}`;
      const runtimeKey = createHash("sha256").update(runtimeKeyInput).digest("hex");
      const ratingSeed = Number(step?.puzzleMeta?.puzzleRating || step?.rating || 1200);
      const topicTags = Array.isArray(step?.puzzleMeta?.topicTags)
        ? step.puzzleMeta.topicTags.filter((v) => typeof v === "string")
        : [];

      yield {
        puzzleId,
        runtimeKey,
        keyScope: {
          ownerId,
          bookId: bookId || null,
          lessonId: lessonId || null,
          stepId,
        },
        bookId: bookId || null,
        lessonId: lessonId || null,
        stepId,
        active: step.active !== false && lesson.active !== false && bookDoc.active !== false,
        rating: {
          value: Number.isFinite(ratingSeed) ? ratingSeed : 1200,
          provisional: true,
          plays: Number(step?.aggregates?.plays || 0),
        },
        meta: {
          topicTags,
          difficultyBand: step?.puzzleMeta?.difficultyBand || null,
          variantId: step?.variantId || bookDoc?.variantId || null,
        },
        source: {
          type: "books.lessons.steps",
          contentUpdatedAt: step?.updatedAt || lesson?.updatedAt || bookDoc?.updatedAt || null,
        },
        sync: {
          lastSeenRunId: runId,
          syncedAt: nowIso,
        },
        createdAt: step?.createdAt || nowIso,
        updatedAt: nowIso,
      };
    }
  }
}

async function copyCollection(sourceDb, targetDb, collectionName) {
  const sourceCollection = sourceDb.collection(collectionName);
  const targetCollection = targetDb.collection(collectionName);
  const cursor = sourceCollection.find({});
  let ops = [];
  let copied = 0;

  for await (const doc of cursor) {
    ops.push({
      replaceOne: {
        filter: { _id: doc._id },
        replacement: doc,
        upsert: true,
      },
    });

    if (ops.length >= batchSize) {
      await targetCollection.bulkWrite(ops, { ordered: false });
      copied += ops.length;
      ops = [];
    }
  }

  if (ops.length) {
    await targetCollection.bulkWrite(ops, { ordered: false });
    copied += ops.length;
  }

  return copied;
}

async function ensurePuzzleCatalogIndexes(targetDb) {
  const coll = targetDb.collection("puzzle_catalog");
  await coll.createIndex({ puzzleId: 1 }, { unique: true });
  await coll.createIndex(
    { runtimeKey: 1 },
    { unique: true, partialFilterExpression: { runtimeKey: { $type: "string" } } }
  );
  await coll.createIndex({ active: 1, "rating.value": 1 });
  await coll.createIndex({ "meta.variantId": 1, active: 1, "rating.value": 1 });
  await coll.createIndex({ bookId: 1, lessonId: 1, "meta.variantId": 1, active: 1 });
  await coll.createIndex({ "meta.topicTags": 1, active: 1 });
  await coll.createIndex({ "sync.lastSeenRunId": 1 });
}

async function rebuildCatalogFromBooks(targetDb) {
  const books = targetDb.collection("books");
  const catalog = targetDb.collection("puzzle_catalog");
  let ops = [];
  let upserts = 0;

  const cursor = books.find({});
  for await (const bookDoc of cursor) {
    for (const puzzleDoc of extractPuzzlesFromBook(bookDoc)) {
      ops.push({
        replaceOne: {
          filter: { puzzleId: puzzleDoc.puzzleId },
          replacement: puzzleDoc,
          upsert: true,
        },
      });

      if (ops.length >= batchSize) {
        await catalog.bulkWrite(ops, { ordered: false });
        upserts += ops.length;
        ops = [];
      }
    }
  }

  if (ops.length) {
    await catalog.bulkWrite(ops, { ordered: false });
    upserts += ops.length;
  }

  let deactivated = 0;
  let pruned = 0;
  if (deactivateMissing) {
    const result = await catalog.updateMany(
      { "sync.lastSeenRunId": { $ne: runId }, active: true },
      {
        $set: {
          active: false,
          updatedAt: nowIso,
          "sync.syncedAt": nowIso,
        },
      }
    );
    deactivated = result.modifiedCount || 0;
  }

  if (pruneStaleCatalogDocs) {
    const result = await catalog.deleteMany({ "sync.lastSeenRunId": { $ne: runId } });
    pruned = result.deletedCount || 0;
  }

  return { upserts, deactivated, pruned };
}

async function main() {
  await client.connect();
  const sourceDb = client.db(sourceDbName);
  const targetDb = client.db(targetDbName);

  console.log(`[migration] source=${sourceDbName} target=${targetDbName}`);
  console.log(`[migration] collections=${collectionNames.join(", ")}`);
  console.log(`[migration] puzzleBookName=${puzzleBookName}`);

  const summary = {};
  for (const name of collectionNames) {
    const count = await copyCollection(sourceDb, targetDb, name);
    summary[name] = count;
    console.log(`[migration] copied ${count} docs for collection '${name}'`);
  }

  if (rebuildPuzzleCatalog) {
    const catalogSummary = await rebuildCatalogFromBooks(targetDb);
    await ensurePuzzleCatalogIndexes(targetDb);
    console.log(
      `[migration] puzzle_catalog upserts=${catalogSummary.upserts} deactivated=${catalogSummary.deactivated} pruned=${catalogSummary.pruned}`
    );
  }

  console.log("[migration] done");
  console.log(JSON.stringify({ sourceDbName, targetDbName, summary, runId }, null, 2));
}

main()
  .catch((error) => {
    console.error("[migration] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close();
  });
