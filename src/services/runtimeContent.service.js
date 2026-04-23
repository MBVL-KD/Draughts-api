import { getDb } from "../config/mongo.js";
import { buildBookLessonsResponse, buildPlayerBooksResponse } from "./playerBooks.service.js";

const DEFAULT_STEPS_LIMIT = 100;
const MAX_STEPS_LIMIT = 200;

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseNonNegativeInt(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.trunc(n);
}

function textForLang(localized, lang = "nl") {
  const values = localized && typeof localized === "object" ? localized.values : null;
  if (!values || typeof values !== "object") return null;
  if (typeof values[lang] === "string" && values[lang].trim()) return values[lang];
  if (typeof values.en === "string" && values.en.trim()) return values.en;
  if (typeof values.nl === "string" && values.nl.trim()) return values.nl;
  return null;
}

function lessonTotals(lesson) {
  const authoringStepIds = safeArray(lesson?.authoringV2?.authoringLesson?.stepIds).filter(
    (v) => typeof v === "string" && v.trim()
  );
  const totalSteps = authoringStepIds.length > 0 ? authoringStepIds.length : safeArray(lesson?.steps).length;
  return {
    totalSteps,
    entryStepId:
      (typeof lesson?.authoringV2?.authoringLesson?.entryStepId === "string" &&
        lesson.authoringV2.authoringLesson.entryStepId.trim()) ||
      (authoringStepIds[0] || safeArray(lesson?.steps)[0]?.stepId || safeArray(lesson?.steps)[0]?.id || null),
  };
}

export async function buildRuntimeBooksResponse(userId, opts = {}) {
  const lang = typeof opts.lang === "string" && opts.lang.trim() ? opts.lang.trim() : "nl";
  const includePuzzles = opts.includePuzzles === true;
  const books = await buildPlayerBooksResponse(userId, { lang, includePuzzles });

  const items = safeArray(books.items).map((book) => {
    const lessons = safeArray(book.lessons);
    const totalLessons = lessons.length;
    const totalExams = lessons.filter((l) => l?.isExam === true).length;
    return {
      bookId: book.bookId,
      title: book.title,
      titleText: book.titleText,
      accessModel: book.accessModel,
      productId: book.productId,
      sequenceIndex: book.sequenceIndex,
      eligible: book.eligible,
      lockReasons: book.lockReasons,
      unlockProgress: book.unlockProgress,
      bookProgress: {
        completedLessons: 0,
        totalLessons,
        completedExams: 0,
        totalExams,
        percent: 0,
      },
      revision: null,
    };
  });

  const db = getDb();
  const rows = await db.collection("player_lesson_progress").find({ playerId: String(userId) }).toArray();
  const progressByBook = new Map();
  for (const row of rows) {
    const bookId = typeof row?.bookId === "string" ? row.bookId : "";
    if (!bookId) continue;
    const total = Number(row?.totalStepsKnown);
    const completed = safeArray(row?.completedStepIds).length;
    const completedLesson = Number.isFinite(total) && total >= 0 && completed >= total && total > 0;
    const current = progressByBook.get(bookId) || { completedLessons: 0, completedExams: 0 };
    if (completedLesson) {
      current.completedLessons += 1;
      if (row?.isExam === true) current.completedExams += 1;
    }
    progressByBook.set(bookId, current);
  }

  const bookDocs = await db
    .collection("books")
    .find({ isDeleted: { $ne: true } }, { projection: { bookId: 1, id: 1, revision: 1 } })
    .toArray();
  const revisionByBook = new Map(
    bookDocs.map((b) => [typeof b.bookId === "string" ? b.bookId : b.id, Number.isFinite(b?.revision) ? b.revision : null])
  );

  for (const item of items) {
    const p = progressByBook.get(item.bookId);
    if (p) {
      item.bookProgress.completedLessons = p.completedLessons;
      item.bookProgress.completedExams = p.completedExams;
    }
    item.bookProgress.percent =
      item.bookProgress.totalLessons > 0
        ? Math.round((Math.min(item.bookProgress.completedLessons, item.bookProgress.totalLessons) /
            item.bookProgress.totalLessons) *
            100)
        : 0;
    item.revision = revisionByBook.get(item.bookId) ?? null;
  }

  return {
    ok: true,
    schemaVersion: 1,
    userId,
    items,
  };
}

export async function buildRuntimeBookLessonsResponse(userId, bookId, opts = {}) {
  const lang = typeof opts.lang === "string" && opts.lang.trim() ? opts.lang.trim() : "nl";
  const detail = await buildBookLessonsResponse(userId, bookId, { lang });
  if (detail?.error) return detail;

  const db = getDb();
  const bookDoc = await db
    .collection("books")
    .findOne({ isDeleted: { $ne: true }, $or: [{ bookId }, { id: bookId }] }, { projection: { revision: 1 } });

  // detail.lessons already contains entryStepId and progress.totalSteps from the lessons collection
  const lessons = safeArray(detail.lessons).map((l) => ({
    ...l,
    totalSteps: l.progress?.totalSteps ?? 0,
    entryStepId: l.entryStepId || null,
  }));

  return {
    ok: true,
    schemaVersion: 1,
    userId,
    bookId,
    title: detail.title,
    titleText: detail.titleText,
    eligible: detail.eligible,
    lockReasons: detail.lockReasons,
    unlockProgress: detail.unlockProgress,
    revision: Number.isFinite(bookDoc?.revision) ? bookDoc.revision : null,
    lessons,
  };
}

export async function buildRuntimeLessonStepsResponse(input) {
  const db = getDb();
  const bookId = String(input.bookId || "").trim();
  const lessonId = String(input.lessonId || "").trim();
  if (!bookId || !lessonId) {
    return { error: { status: 400, body: { ok: false, error: "BAD_REQUEST", message: "bookId and lessonId are required" } } };
  }

  const offset = parseNonNegativeInt(input.offset, 0);
  const reqLimit = parseNonNegativeInt(input.limit, DEFAULT_STEPS_LIMIT);
  const limit = Math.max(1, Math.min(MAX_STEPS_LIMIT, reqLimit));
  const lang = typeof input.lang === "string" && input.lang.trim() ? input.lang.trim() : "nl";

  const [bookDoc, lessonDoc] = await Promise.all([
    db.collection("books").findOne(
      { isDeleted: { $ne: true }, $or: [{ bookId }, { id: bookId }] },
      { projection: { bookId: 1, id: 1, revision: 1 } }
    ),
    db.collection("lessons").findOne(
      { isDeleted: { $ne: true }, bookId, $or: [{ lessonId }, { id: lessonId }] },
      { projection: { stepIds: 1 } }
    ),
  ]);

  if (!bookDoc) return { error: { status: 404, body: { ok: false, error: "BOOK_NOT_FOUND" } } };
  if (!lessonDoc) return { error: { status: 404, body: { ok: false, error: "LESSON_NOT_FOUND" } } };

  const allStepIds = safeArray(lessonDoc.stepIds).filter((id) => typeof id === "string" && id.trim());
  const totalSteps = allStepIds.length;
  const pageStepIds = allStepIds.slice(offset, offset + limit);

  const stepDocs = pageStepIds.length > 0
    ? await db.collection("steps").find(
        { isDeleted: { $ne: true }, stepId: { $in: pageStepIds } },
        { projection: { stepId: 1, id: 1, type: 1, orderIndex: 1, title: 1, prompt: 1, hint: 1, initialState: 1 } }
      ).toArray()
    : [];

  const stepById = new Map(stepDocs.map((s) => [s.stepId || s.id, s]));
  const steps = pageStepIds.map((stepId, index) => {
    const step = stepById.get(stepId);
    return {
      stepId,
      stepType: step?.type || null,
      orderIndex: Number.isFinite(step?.orderIndex) ? step.orderIndex : offset + index,
      title: step?.title || null,
      titleText: textForLang(step?.title, lang),
      prompt: step?.prompt || null,
      promptText: textForLang(step?.prompt, lang),
      hint: step?.hint || null,
      initialState: step?.initialState || null,
    };
  });

  const nextOffset = offset + steps.length;
  const hasMore = nextOffset < totalSteps;
  const revision = Number.isFinite(bookDoc?.revision) ? bookDoc.revision : null;
  const resolvedBookId = typeof bookDoc.bookId === "string" ? bookDoc.bookId : bookDoc.id || bookId;
  return {
    ok: true,
    schemaVersion: 1,
    bookId: resolvedBookId,
    lessonId,
    revision,
    etag: revision == null ? null : `book:${bookId}:rev:${revision}:lesson:${lessonId}:offset:${offset}:limit:${limit}`,
    pagination: {
      offset,
      limit,
      count: steps.length,
      totalSteps,
      hasMore,
      nextOffset: hasMore ? nextOffset : null,
    },
    steps,
  };
}
