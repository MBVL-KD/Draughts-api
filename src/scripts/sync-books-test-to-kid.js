import { MongoClient, ServerApiVersion } from "mongodb";
import { env } from "../config/env.js";

const sourceDbName = process.env.MIGRATION_SOURCE_DB || "test";
const targetDbName = process.env.MIGRATION_TARGET_DB || env.mongoDbName || "kid_draughts";
const batchSize = Number(process.env.MIGRATION_BATCH_SIZE || 200);
const dryRun = String(process.env.DRY_RUN || "false").toLowerCase() === "true";
const explicitBookIds = String(process.env.BOOK_IDS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

if (!env.mongoUri) throw new Error("Missing MONGODB_URI");
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
  }
  return null;
}

function buildBookFilter(bookIds) {
  if (!bookIds.length) return {};
  return {
    $or: [
      { bookId: { $in: bookIds } },
      { id: { $in: bookIds } },
      { _id: { $in: bookIds } },
    ],
  };
}

async function main() {
  await client.connect();
  const sourceDb = client.db(sourceDbName);
  const targetDb = client.db(targetDbName);

  const sourceBooks = sourceDb.collection("books");
  const targetBooks = targetDb.collection("books");
  const filter = buildBookFilter(explicitBookIds);

  const sourceCount = await sourceBooks.countDocuments(filter);
  const targetCountBefore = await targetBooks.countDocuments(filter);

  console.log(`[books-sync] source=${sourceDbName} target=${targetDbName}`);
  console.log(`[books-sync] filterBookIds=${explicitBookIds.length ? explicitBookIds.join(",") : "ALL"}`);
  console.log(`[books-sync] dryRun=${dryRun}`);
  console.log(`[books-sync] sourceCount=${sourceCount} targetCountBefore=${targetCountBefore}`);

  const cursor = sourceBooks.find(filter);
  let ops = [];
  let upserts = 0;
  let scanned = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const stableBookId = normalizeId(doc.bookId) || normalizeId(doc.id) || normalizeId(doc._id);
    if (!stableBookId) continue;

    if (!dryRun) {
      ops.push({
        replaceOne: {
          filter: {
            $or: [
              { _id: doc._id },
              { bookId: stableBookId },
              { id: stableBookId },
            ],
          },
          replacement: doc,
          upsert: true,
        },
      });
    }

    if (!dryRun && ops.length >= batchSize) {
      await targetBooks.bulkWrite(ops, { ordered: false });
      upserts += ops.length;
      ops = [];
    }
  }

  if (!dryRun && ops.length) {
    await targetBooks.bulkWrite(ops, { ordered: false });
    upserts += ops.length;
  }

  const targetCountAfter = await targetBooks.countDocuments(filter);
  console.log(
    JSON.stringify(
      {
        ok: true,
        sourceDbName,
        targetDbName,
        dryRun,
        scanned,
        upserts: dryRun ? 0 : upserts,
        sourceCount,
        targetCountBefore,
        targetCountAfter,
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error("[books-sync] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close();
  });
