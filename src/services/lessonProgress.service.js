import { getDb } from "../config/mongo.js";

const COLLECTION = "player_lesson_progress";
export const LESSON_PROGRESS_SCHEMA_VERSION = 1;

function normalizePlayerId(playerId) {
  return String(playerId);
}

function toFiniteInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * @returns {Promise<object|null>}
 */
export async function findLessonProgressDoc(playerId, bookId, lessonId) {
  const db = getDb();
  return db.collection(COLLECTION).findOne({ playerId, bookId, lessonId });
}

export function mapDocToGetResponse(doc, bookId, lessonId) {
  if (!doc) {
    return {
      ok: true,
      bookId,
      lessonId,
      furthestStepIndex: null,
      furthestStepId: null,
      totalStepsKnown: null,
      completedStepIds: [],
      lastPlayedAt: null,
      bookRevision: null,
      schemaVersion: LESSON_PROGRESS_SCHEMA_VERSION,
    };
  }
  return {
    ok: true,
    bookId: doc.bookId,
    lessonId: doc.lessonId,
    furthestStepIndex: doc.furthestStepIndex ?? null,
    furthestStepId: doc.furthestStepId ?? null,
    totalStepsKnown: doc.totalStepsKnown ?? null,
    completedStepIds: Array.isArray(doc.completedStepIds) ? [...doc.completedStepIds] : [],
    lastPlayedAt: doc.lastPlayedAtUnix ?? null,
    bookRevision: doc.bookRevision ?? null,
    schemaVersion: doc.schemaVersion ?? LESSON_PROGRESS_SCHEMA_VERSION,
  };
}

/**
 * @param {object} input
 * @param {boolean|undefined} input.markStepCompleted default true — if false, no append to completedStepIds
 */
export async function upsertLessonProgress(input) {
  const db = getDb();
  const coll = db.collection(COLLECTION);
  const playerId = normalizePlayerId(input.playerId);
  const { bookId, lessonId, stepId } = input;
  const stepIndex = toFiniteInt(input.stepIndex);
  if (stepIndex === null || stepIndex < 0) {
    return { error: { status: 400, body: { ok: false, error: "BAD_STEP_INDEX" } } };
  }

  const existing = await coll.findOne({ playerId, bookId, lessonId });
  const clientRev = input.bookRevision != null ? toFiniteInt(input.bookRevision) : null;
  const storedRev = existing?.bookRevision != null ? toFiniteInt(existing.bookRevision) : null;

  if (clientRev !== null && storedRev !== null && clientRev < storedRev) {
    return {
      error: {
        status: 409,
        body: {
          ok: false,
          error: "BOOK_REVISION_MISMATCH",
          expectedRevision: storedRev,
          actualRevision: clientRev,
        },
      },
    };
  }

  const prevFurthest = existing?.furthestStepIndex != null ? toFiniteInt(existing.furthestStepIndex) : -1;
  const prevFurthestSafe = prevFurthest === null ? -1 : prevFurthest;
  const furthestStepIndex = Math.max(prevFurthestSafe, stepIndex);

  let furthestStepId = existing?.furthestStepId ?? null;
  if (stepIndex >= prevFurthestSafe) {
    furthestStepId = stepId;
  }

  const markStepCompleted = input.markStepCompleted !== false;
  const completed = new Set(Array.isArray(existing?.completedStepIds) ? existing.completedStepIds : []);
  if (markStepCompleted) {
    completed.add(stepId);
  }

  let totalStepsKnown = existing?.totalStepsKnown ?? null;
  const totalStepsInput = input.totalSteps != null ? input.totalSteps : input.totalStepsKnown;
  if (totalStepsInput != null) {
    const ts = toFiniteInt(totalStepsInput);
    if (ts !== null && ts >= 0) {
      totalStepsKnown =
        totalStepsKnown === null ? ts : Math.max(totalStepsKnown, ts);
    }
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  let nextBookRev = storedRev;
  if (clientRev !== null) {
    nextBookRev = storedRev !== null ? Math.max(clientRev, storedRev) : clientRev;
  } else if (nextBookRev === null && existing?.bookRevision != null) {
    nextBookRev = toFiniteInt(existing.bookRevision);
  }

  const nextDoc = {
    playerId,
    bookId,
    lessonId,
    furthestStepIndex,
    furthestStepId,
    totalStepsKnown,
    completedStepIds: [...completed],
    lastPlayedAtUnix: nowUnix,
    bookRevision: nextBookRev,
    schemaVersion: LESSON_PROGRESS_SCHEMA_VERSION,
    source: typeof input.source === "string" && input.source.trim() ? input.source.trim() : "roblox",
    updatedAtUnix: nowUnix,
  };

  await coll.updateOne(
    { playerId, bookId, lessonId },
    {
      $set: nextDoc,
      $setOnInsert: { createdAtUnix: nowUnix },
    },
    { upsert: true }
  );

  const saved = await coll.findOne({ playerId, bookId, lessonId });
  return mapDocToGetResponse(saved, bookId, lessonId);
}
