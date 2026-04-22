import { getDb } from "../config/mongo.js";

export const PLAYER_BOOKS_SCHEMA_VERSION = 1;

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function textForLang(localized, lang = "nl") {
  const values = localized && typeof localized === "object" ? localized.values : null;
  if (!values || typeof values !== "object") return null;
  if (typeof values[lang] === "string" && values[lang].trim()) return values[lang];
  if (typeof values.en === "string" && values.en.trim()) return values.en;
  if (typeof values.nl === "string" && values.nl.trim()) return values.nl;
  const first = Object.values(values).find((v) => typeof v === "string" && v.trim());
  return typeof first === "string" ? first : null;
}

function normalizeUnlockRules(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  return {
    type: obj.type === "requires_exams" ? "requires_exams" : "none",
    requiredBookId: typeof obj.requiredBookId === "string" && obj.requiredBookId.trim() ? obj.requiredBookId : null,
    requiredExamLessonIds: safeArray(obj.requiredExamLessonIds).filter((v) => typeof v === "string" && v.trim()),
    requiredPassMode: obj.requiredPassMode === "any" ? "any" : "all",
  };
}

function getPurchasedProductIds(profile) {
  const result = new Set();
  for (const id of safeArray(profile?.purchasedProductIds)) {
    if (typeof id === "string" && id.trim()) result.add(id.trim());
  }
  for (const id of safeArray(profile?.entitlements?.productIds)) {
    if (typeof id === "string" && id.trim()) result.add(id.trim());
  }
  for (const row of safeArray(profile?.purchases)) {
    if (!row || typeof row !== "object") continue;
    const pid = row.productId || row.id;
    if (typeof pid === "string" && pid.trim()) result.add(pid.trim());
  }
  return result;
}

function getPassedExamLessonIds(profile) {
  const passed = new Set();
  const ed = profile?.education && typeof profile.education === "object" ? profile.education : {};
  for (const row of safeArray(ed.examsCompleted)) {
    if (!row || typeof row !== "object") continue;
    const id = row.examId || row.lessonId || row.id;
    if (typeof id === "string" && id.trim()) passed.add(id.trim());
  }
  return passed;
}

function sortBooks(items) {
  return items.sort((a, b) => {
    const ai = Number.isFinite(a.sequenceIndex) ? a.sequenceIndex : 9999;
    const bi = Number.isFinite(b.sequenceIndex) ? b.sequenceIndex : 9999;
    if (ai !== bi) return ai - bi;
    return String(a.bookId).localeCompare(String(b.bookId));
  });
}

function isPuzzleBook(book) {
  const values = book?.title?.values;
  const nl = values && typeof values === "object" && typeof values.nl === "string" ? values.nl.trim().toLowerCase() : "";
  const en = values && typeof values === "object" && typeof values.en === "string" ? values.en.trim().toLowerCase() : "";
  if (nl === "puzzels" || en === "puzzles" || en === "puzzels") return true;

  const tags = safeArray(book?.tags).map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""));
  return tags.some((t) => t.includes("puzzle") || t.includes("puzzel"));
}

export async function buildPlayerBooksResponse(userId, opts = {}) {
  const db = getDb();
  const lang = typeof opts.lang === "string" && opts.lang.trim() ? opts.lang.trim() : "nl";
  const includePuzzles = opts.includePuzzles === true;

  // Keep list endpoint light: fetch book metadata + lesson headers only.
  // Avoid pulling full lesson step bodies for every book in the catalog call.
  const booksProjection = {
    bookId: 1,
    id: 1,
    title: 1,
    description: 1,
    accessModel: 1,
    productId: 1,
    sequenceIndex: 1,
    unlockRules: 1,
    tags: 1,
    "lessons.lessonId": 1,
    "lessons.id": 1,
    "lessons.title": 1,
    "lessons.isExam": 1,
  };

  const [profile, booksRaw] = await Promise.all([
    db.collection("player_profiles").findOne({ userId }),
    db.collection("books").find({ isDeleted: { $ne: true } }, { projection: booksProjection }).toArray(),
  ]);

  const purchased = getPurchasedProductIds(profile || {});
  const passedExamLessonIds = getPassedExamLessonIds(profile || {});

  const booksById = new Map();
  for (const book of booksRaw) {
    const id = book?.bookId || book?.id;
    if (typeof id === "string" && id.trim()) {
      booksById.set(id, book);
    }
  }

  const items = [];
  for (const book of booksRaw) {
    if (!includePuzzles && isPuzzleBook(book)) {
      continue;
    }
    const bookId = typeof book?.bookId === "string" ? book.bookId : typeof book?.id === "string" ? book.id : null;
    if (!bookId) continue;

    const accessModel = book?.accessModel === "paid" ? "paid" : "free";
    const productId = typeof book?.productId === "string" ? book.productId : "";
    const unlockRules = normalizeUnlockRules(book?.unlockRules);
    const sequenceIndex = Number.isFinite(Number(book?.sequenceIndex)) ? Math.trunc(Number(book.sequenceIndex)) : 9999;
    const lessons = safeArray(book?.lessons).map((l) => ({
      lessonId: typeof l?.lessonId === "string" ? l.lessonId : typeof l?.id === "string" ? l.id : null,
      title: l?.title || null,
      isExam: l?.isExam === true,
    }));

    const entitlementOk = accessModel === "free" || (productId && purchased.has(productId));

    let requiredExamLessonIds = [];
    if (unlockRules.type === "requires_exams") {
      if (unlockRules.requiredExamLessonIds.length > 0) {
        requiredExamLessonIds = [...unlockRules.requiredExamLessonIds];
      } else if (unlockRules.requiredBookId && booksById.has(unlockRules.requiredBookId)) {
        const reqBook = booksById.get(unlockRules.requiredBookId);
        requiredExamLessonIds = safeArray(reqBook?.lessons)
          .filter((l) => l?.isExam === true)
          .map((l) => l?.lessonId || l?.id)
          .filter((id) => typeof id === "string" && id.trim());
      }
    }

    const passedSet = new Set(requiredExamLessonIds.filter((id) => passedExamLessonIds.has(id)));
    const requiredExamCount = requiredExamLessonIds.length;
    const passedExamCount = passedSet.size;
    const examGateOk =
      unlockRules.type !== "requires_exams" ||
      requiredExamCount === 0 ||
      (unlockRules.requiredPassMode === "any" ? passedExamCount >= 1 : passedExamCount >= requiredExamCount);

    const lockReasons = [];
    if (!entitlementOk && accessModel === "paid") lockReasons.push("LOCKED_PURCHASE_REQUIRED");
    if (!examGateOk) lockReasons.push("LOCKED_PREREQ_EXAMS");

    items.push({
      bookId,
      title: book?.title || null,
      titleText: textForLang(book?.title, lang),
      description: book?.description || null,
      accessModel,
      productId,
      sequenceIndex,
      unlockRules,
      eligible: entitlementOk && examGateOk,
      lockReasons,
      unlockProgress: {
        requiredBookId: unlockRules.requiredBookId,
        requiredExamLessonIds,
        passedExamLessonIds: [...passedSet],
        requiredExamCount,
        passedExamCount,
        requiredPassMode: unlockRules.requiredPassMode,
      },
      lessons,
    });
  }

  return {
    ok: true,
    schemaVersion: PLAYER_BOOKS_SCHEMA_VERSION,
    userId,
    items: sortBooks(items),
  };
}

function lessonTotalStepsFromBook(lesson) {
  const authoring = lesson?.authoringV2?.authoringLesson;
  const ids = safeArray(authoring?.stepIds).filter((id) => typeof id === "string" && id.trim());
  if (ids.length) return ids.length;
  return safeArray(lesson?.steps).length;
}

function entryStepIdFromBook(lesson) {
  const authoring = lesson?.authoringV2?.authoringLesson;
  const explicit = authoring?.entryStepId;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const ids = safeArray(authoring?.stepIds).filter((id) => typeof id === "string" && id.trim());
  if (ids.length) return ids[0];
  const steps = safeArray(lesson?.steps);
  const first = steps[0];
  const sid = first?.stepId || first?.id;
  return typeof sid === "string" && sid.trim() ? sid.trim() : null;
}

function progressFromDoc(doc, lesson) {
  const completedSteps = safeArray(doc?.completedStepIds).length;
  const totalFromDoc = Number(doc?.totalStepsKnown);
  const docTotal =
    Number.isFinite(totalFromDoc) && totalFromDoc >= 0 ? Math.trunc(totalFromDoc) : Number.NaN;
  const fromBook = lesson ? lessonTotalStepsFromBook(lesson) : 0;
  const totalSteps = Math.max(fromBook, Number.isFinite(docTotal) ? docTotal : 0, completedSteps);
  const percent = totalSteps > 0 ? Math.round((Math.min(completedSteps, totalSteps) / totalSteps) * 100) : 0;
  return { completedSteps, totalSteps, percent };
}

function lessonStatus(bookEligible, progress) {
  if (!bookEligible) return "locked";
  if (progress.totalSteps > 0 && progress.completedSteps >= progress.totalSteps) return "completed";
  if (progress.completedSteps > 0) return "in_progress";
  return "not_started";
}

export async function buildBookLessonsResponse(userId, bookId, opts = {}) {
  const db = getDb();
  const lang = typeof opts.lang === "string" && opts.lang.trim() ? opts.lang.trim() : "nl";
  const playerId = String(userId);

  const [catalog, bookDoc, lessonProgressRows] = await Promise.all([
    buildPlayerBooksResponse(userId, { lang, includePuzzles: true }),
    db.collection("books").findOne({ isDeleted: { $ne: true }, $or: [{ bookId }, { id: bookId }] }),
    db.collection("player_lesson_progress").find({ playerId, bookId }).toArray(),
  ]);

  const bookListRow = safeArray(catalog.items).find((row) => row.bookId === bookId);
  if (!bookDoc || !bookListRow) {
    return { error: { status: 404, body: { ok: false, error: "BOOK_NOT_FOUND" } } };
  }

  const progressByLessonId = new Map();
  for (const row of lessonProgressRows) {
    if (typeof row?.lessonId === "string" && row.lessonId.trim()) {
      progressByLessonId.set(row.lessonId, row);
    }
  }

  const lessons = safeArray(bookDoc.lessons).map((lesson) => {
    const lessonId =
      typeof lesson?.lessonId === "string" ? lesson.lessonId : typeof lesson?.id === "string" ? lesson.id : null;
    const isExam = lesson?.isExam === true;
    const progressDoc = lessonId ? progressByLessonId.get(lessonId) : null;
    const entryStepId = entryStepIdFromBook(lesson);
    const furthestStepId =
      typeof progressDoc?.furthestStepId === "string" && progressDoc.furthestStepId.trim()
        ? progressDoc.furthestStepId.trim()
        : null;
    const resumeStepId = furthestStepId || entryStepId;
    const progress = progressFromDoc(progressDoc, lesson);
    const status = lessonStatus(bookListRow.eligible, progress);
    const attempted = progressDoc != null;
    const passed = status === "completed";
    const canRetake = isExam ? false : true;
    const examBlocked = isExam && !canRetake && status === "completed";
    const canProceed =
      bookListRow.eligible &&
      status !== "locked" &&
      !examBlocked &&
      (status === "not_started" || status === "in_progress" || status === "completed");
    const canRestart = bookListRow.eligible && status !== "locked" && !examBlocked && status !== "not_started";
    const disabledReason =
      status === "locked" ? "BOOK_LOCKED" : examBlocked ? "EXAM_ALREADY_ATTEMPTED" : null;

    return {
      lessonId,
      title: lesson?.title || null,
      titleText: textForLang(lesson?.title, lang),
      isExam,
      entryStepId,
      resumeStepId,
      progress,
      status,
      attempt: {
        attempted,
        passed,
        canRetake,
      },
      actions: {
        canProceed,
        canRestart,
        disabledReason,
      },
    };
  });

  return {
    ok: true,
    schemaVersion: PLAYER_BOOKS_SCHEMA_VERSION,
    userId,
    bookId,
    title: bookListRow.title,
    titleText: bookListRow.titleText,
    eligible: bookListRow.eligible,
    lockReasons: bookListRow.lockReasons,
    unlockProgress: bookListRow.unlockProgress,
    lessons,
  };
}
