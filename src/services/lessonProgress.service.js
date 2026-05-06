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

function encodeCursor(lastPlayedAtUnix) {
  const token = `${lastPlayedAtUnix || 0}`;
  return Buffer.from(token, "utf8").toString("base64");
}

function decodeCursor(cursor) {
  try {
    const raw = Buffer.from(String(cursor), "base64").toString("utf8");
    const ts = toFiniteInt(raw);
    if (ts === null) return null;
    return { lastPlayedAtUnix: ts };
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<object|null>}
 */
export async function findLessonProgressDoc(playerId, bookId, lessonId) {
  const db = getDb();
  return db.collection(COLLECTION).findOne({ playerId, bookId, lessonId });
}

export function mapDocToListItem(doc) {
  const ids = Array.isArray(doc.completedStepIds) ? doc.completedStepIds : [];
  return {
    bookId: doc.bookId,
    lessonId: doc.lessonId,
    furthestStepIndex: doc.furthestStepIndex ?? null,
    furthestStepId: doc.furthestStepId ?? null,
    totalStepsKnown: doc.totalStepsKnown ?? null,
    bookRevision: doc.bookRevision ?? null,
    completedStepIds: [...ids],
    completedCount: ids.length,
    lastPlayedAt: doc.lastPlayedAtUnix ?? null,
  };
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
    console.warn("[lesson-progress] revision_mismatch", {
      playerId,
      bookId,
      lessonId,
      expectedRevision: storedRev,
      actualRevision: clientRev,
    });
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

  if (input.isExam === true && input.canRetake === false && existing) {
    return {
      error: {
        status: 409,
        body: {
          ok: false,
          error: "EXAM_ALREADY_ATTEMPTED",
          message: "Exam already attempted and retake is disabled",
        },
      },
    };
  }

  const markStepCompleted = input.markStepCompleted !== false;
  const totalStepsInput = input.totalSteps != null ? input.totalSteps : input.totalStepsKnown;
  const totalStepsKnownInput = toFiniteInt(totalStepsInput);
  const hasTotalStepsInput = totalStepsKnownInput !== null && totalStepsKnownInput >= 0;

  const nowUnix = Math.floor(Date.now() / 1000);
  let nextBookRev = storedRev;
  if (clientRev !== null) {
    nextBookRev = storedRev !== null ? Math.max(clientRev, storedRev) : clientRev;
  } else if (nextBookRev === null && existing?.bookRevision != null) {
    nextBookRev = toFiniteInt(existing.bookRevision);
  }

  const source =
    typeof input.source === "string" && input.source.trim() ? input.source.trim() : "roblox";

  // Use an atomic pipeline update so concurrent writes can't overwrite each other.
  const setStage = {
    playerId,
    bookId,
    lessonId,
    furthestStepIndex: { $max: [{ $ifNull: ["$furthestStepIndex", -1] }, stepIndex] },
    furthestStepId: {
      $cond: [
        { $gte: [stepIndex, { $ifNull: ["$furthestStepIndex", -1] }] },
        stepId,
        { $ifNull: ["$furthestStepId", null] },
      ],
    },
    completedStepIds: markStepCompleted
      ? { $setUnion: [{ $ifNull: ["$completedStepIds", []] }, [stepId]] }
      : { $ifNull: ["$completedStepIds", []] },
    lastPlayedAtUnix: nowUnix,
    bookRevision: nextBookRev,
    schemaVersion: LESSON_PROGRESS_SCHEMA_VERSION,
    source,
    updatedAtUnix: nowUnix,
    createdAtUnix: { $ifNull: ["$createdAtUnix", nowUnix] },
  };

  if (hasTotalStepsInput) {
    setStage.totalStepsKnown = {
      $max: [{ $ifNull: ["$totalStepsKnown", 0] }, totalStepsKnownInput],
    };
  } else {
    setStage.totalStepsKnown = { $ifNull: ["$totalStepsKnown", null] };
  }

  await coll.updateOne(
    { playerId, bookId, lessonId },
    [{ $set: setStage }],
    { upsert: true }
  );

  const saved = await coll.findOne({ playerId, bookId, lessonId });
  console.log("[lesson-progress] write", {
    userId: playerId,
    bookId,
    lessonId,
    stepId,
    stepIndex,
    revision: nextBookRev,
  });
  return mapDocToGetResponse(saved, bookId, lessonId);
}

export async function listLessonProgressForPlayer(playerId, opts) {
  const db = getDb();
  const coll = db.collection(COLLECTION);
  const limit = opts.limit;
  const offset = opts.offset ?? 0;
  const cursor = opts.cursor;
  const filter = { playerId: normalizePlayerId(playerId) };
  const cursorDecoded = cursor ? decodeCursor(cursor) : null;

  if (cursor && !cursorDecoded) {
    return {
      error: {
        status: 400,
        body: {
          ok: false,
          error: "BAD_CURSOR",
          issues: [{ path: "cursor", code: "cursor.invalid", message: "Invalid cursor token" }],
        },
      },
    };
  }

  const cursorFilter = cursorDecoded
    ? {
        lastPlayedAtUnix: { $lt: cursorDecoded.lastPlayedAtUnix },
      }
    : {};

  const [total, docs] = await Promise.all([
    coll.countDocuments(filter),
    coll
      .find({ ...filter, ...cursorFilter })
      .sort({ lastPlayedAtUnix: -1, bookId: 1, lessonId: 1 })
      .skip(offset)
      .limit(limit)
      .toArray(),
  ]);

  const last = docs[docs.length - 1];
  const nextCursor = docs.length === limit && last ? encodeCursor(last.lastPlayedAtUnix || 0) : null;

  return {
    ok: true,
    mode: "list",
    schemaVersion: LESSON_PROGRESS_SCHEMA_VERSION,
    items: docs.map(mapDocToListItem),
    pagination: {
      limit,
      offset,
      total,
      nextCursor,
    },
  };
}
