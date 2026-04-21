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

export async function buildPlayerBooksResponse(userId, opts = {}) {
  const db = getDb();
  const lang = typeof opts.lang === "string" && opts.lang.trim() ? opts.lang.trim() : "nl";

  const [profile, booksRaw] = await Promise.all([
    db.collection("player_profiles").findOne({ userId }),
    db.collection("books").find({ isDeleted: { $ne: true } }).toArray(),
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
