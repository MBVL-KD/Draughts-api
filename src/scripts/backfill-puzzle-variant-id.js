import { MongoClient, ServerApiVersion } from "mongodb";
import { env } from "../config/env.js";

const dbName = process.env.BACKFILL_DB_NAME || env.mongoDbName || "kid_draughts";
const defaultVariantId = process.env.DEFAULT_VARIANT_ID || "international";
const puzzleBookName = (process.env.PUZZLE_BOOK_NAME || "Puzzels").trim().toLowerCase();
const batchSize = Number(process.env.BACKFILL_BATCH_SIZE || 500);
const dryRun = (process.env.DRY_RUN || "false").toLowerCase() === "true";
const nowIso = new Date().toISOString();

if (!env.mongoUri) {
  throw new Error("Missing MONGODB_URI");
}

const client = new MongoClient(env.mongoUri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function main() {
  await client.connect();
  const db = client.db(dbName);
  const books = db.collection("books");
  const catalog = db.collection("puzzle_catalog");

  console.log(`[backfill] db=${dbName} defaultVariantId=${defaultVariantId} dryRun=${dryRun}`);
  console.log(`[backfill] puzzleBookName=${puzzleBookName}`);

  const docsMissingVariant = await catalog.countDocuments({
    $or: [{ "meta.variantId": { $exists: false } }, { "meta.variantId": null }, { "meta.variantId": "" }],
  });
  console.log(`[backfill] puzzle_catalog missing variant before=${docsMissingVariant}`);

  const cursor = books.find(
    {},
    { projection: { _id: 1, bookId: 1, variantId: 1, title: 1, name: 1, bookName: 1, lessons: 1 } }
  );
  let ops = [];
  let updates = 0;

  for await (const book of cursor) {
    const titleValues = book?.title?.values;
    const bookTitle =
      (typeof book?.title === "string" && book.title) ||
      (typeof book?.name === "string" && book.name) ||
      (typeof book?.bookName === "string" && book.bookName) ||
      (titleValues && typeof titleValues.nl === "string" && titleValues.nl) ||
      (titleValues && typeof titleValues.en === "string" && titleValues.en) ||
      "";
    if (bookTitle.trim().toLowerCase() !== puzzleBookName) continue;

    const variantFromBook = typeof book.variantId === "string" && book.variantId ? book.variantId : null;
    const lessons = Array.isArray(book.lessons) ? book.lessons : [];

    for (const lesson of lessons) {
      const steps = Array.isArray(lesson.steps) ? lesson.steps : [];

      for (const step of steps) {
        const stepIdValue = step.stepId ?? step.id ?? step._id;
        if (stepIdValue == null) continue;

        const stepId = String(stepIdValue);
        const variantId =
          (typeof step.variantId === "string" && step.variantId) ||
          variantFromBook ||
          defaultVariantId;

        ops.push({
          updateOne: {
            filter: { puzzleId: stepId },
            update: {
              $set: {
                "meta.variantId": variantId,
                updatedAt: nowIso,
              },
            },
            upsert: false,
          },
        });

        if (ops.length >= batchSize) {
          if (!dryRun) {
            const result = await catalog.bulkWrite(ops, { ordered: false });
            updates += (result.modifiedCount || 0) + (result.upsertedCount || 0);
          } else {
            updates += ops.length;
          }
          ops = [];
        }
      }
    }
  }

  if (ops.length) {
    if (!dryRun) {
      const result = await catalog.bulkWrite(ops, { ordered: false });
      updates += (result.modifiedCount || 0) + (result.upsertedCount || 0);
    } else {
      updates += ops.length;
    }
  }

  if (!dryRun) {
    await catalog.createIndex({ "meta.variantId": 1, active: 1, "rating.value": 1 });
  }

  const missingAfter = dryRun
    ? docsMissingVariant
    : await catalog.countDocuments({
        $or: [{ "meta.variantId": { $exists: false } }, { "meta.variantId": null }, { "meta.variantId": "" }],
      });

  console.log(`[backfill] updates=${updates}`);
  console.log(`[backfill] puzzle_catalog missing variant after=${missingAfter}`);
}

main()
  .catch((error) => {
    console.error("[backfill] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close();
  });
