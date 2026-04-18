import { getDb } from "../config/mongo.js";

export const EDUCATION_PUBLIC_SCHEMA_VERSION = 1;

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toUnixSeconds(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeExamEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const examId = raw.examId != null ? String(raw.examId) : raw.id != null ? String(raw.id) : "";
  const title = typeof raw.title === "string" ? raw.title : "";
  const passedAt = toUnixSeconds(raw.passedAt ?? raw.passedAtUnix);
  const score = raw.score != null && Number.isFinite(Number(raw.score)) ? Number(raw.score) : null;
  if (!examId && !title) return null;
  return { examId: examId || "", title, passedAt, score };
}

function normalizeBookEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const bookId = raw.bookId != null ? String(raw.bookId) : "";
  const title = typeof raw.title === "string" ? raw.title : "";
  const completedAt = toUnixSeconds(raw.completedAt ?? raw.completedAtUnix);
  if (!bookId && !title) return null;
  return { bookId: bookId || "", title, completedAt };
}

/**
 * Reads `player_profiles.education` (optional subdocument). Safe for “public” responses.
 * @param {object|null|undefined} profile — raw player_profiles doc or merged profile-like object
 * @param {number} userId
 */
export function buildEducationPublicFields(profile, userId) {
  const ed = profile?.education && typeof profile.education === "object" ? profile.education : {};
  const disp = ed.educationLevelDisplay ?? ed.levelDisplay;
  const display = disp && typeof disp === "object" ? disp : {};

  const nl = typeof display.nl === "string" ? display.nl : typeof display.NL === "string" ? display.NL : null;
  const en = typeof display.en === "string" ? display.en : typeof display.EN === "string" ? display.EN : null;

  const tier = ed.educationTier ?? ed.tier ?? null;
  const levelRaw = ed.educationLevel != null ? ed.educationLevel : ed.level;
  const educationLevel =
    levelRaw != null && Number.isFinite(Number(levelRaw)) ? Math.trunc(Number(levelRaw)) : null;

  const examsCompleted = safeArray(ed.examsCompleted)
    .map(normalizeExamEntry)
    .filter(Boolean);
  const booksCompleted = safeArray(ed.booksCompleted)
    .map(normalizeBookEntry)
    .filter(Boolean);

  const educationLevelDisplay = { nl, en };
  const educationLevelLabel = nl ?? en ?? null;

  return {
    userId,
    educationTier: typeof tier === "string" && tier.trim() ? tier.trim() : tier != null ? String(tier) : null,
    educationLevel,
    educationLevelDisplay,
    educationLevelLabel,
    examsCompleted,
    booksCompleted,
  };
}

export function buildEducationPublicResponse(profile, userId) {
  return {
    ok: true,
    schemaVersion: EDUCATION_PUBLIC_SCHEMA_VERSION,
    ...buildEducationPublicFields(profile, userId),
  };
}

export async function loadPlayerProfileForEducation(userId) {
  const db = getDb();
  return db.collection("player_profiles").findOne({ userId });
}
