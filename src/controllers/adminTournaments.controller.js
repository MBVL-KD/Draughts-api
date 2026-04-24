import { getDb } from "../config/mongo.js";
import { randomUUID } from "crypto";

const COLLECTION = "admin_tournaments";

export async function createTournament(req, res) {
  const body = req.body;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const countryId = typeof body.countryId === "string" ? body.countryId.trim() : "";

  if (!title) return res.status(400).json({ ok: false, error: "MISSING_TITLE" });
  if (!countryId) return res.status(400).json({ ok: false, error: "MISSING_COUNTRY_ID" });

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const tournamentId = body.tournamentId || randomUUID();

  const doc = {
    tournamentId,
    title,
    countryId,
    organizerEntityId: body.organizerEntityId ?? null,
    mode: body.mode ?? "virtual",
    categories: Array.isArray(body.categories) ? body.categories : [],
    schedule: Array.isArray(body.schedule) ? body.schedule : [],
    location: body.location ?? null,
    associatedClubId: body.associatedClubId ?? null,
    volunteerIds: Array.isArray(body.volunteerIds) ? body.volunteerIds : [],
    status: body.status ?? "draft",
    createdAtUnix: now,
    updatedAtUnix: now,
  };

  try {
    await db.collection(COLLECTION).insertOne(doc);
    return res.status(201).json({ ok: true, tournament: doc });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ ok: false, error: "TOURNAMENT_ID_CONFLICT" });
    }
    console.error("[admin] createTournament error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

export async function listTournaments(req, res) {
  const db = getDb();
  const filter = {};
  if (req.query.countryId) filter.countryId = String(req.query.countryId).trim();
  if (req.query.status) filter.status = String(req.query.status).trim();

  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

  try {
    const docs = await db
      .collection(COLLECTION)
      .find(filter)
      .sort({ createdAtUnix: -1 })
      .limit(limit)
      .toArray();
    return res.json({ ok: true, tournaments: docs });
  } catch (err) {
    console.error("[admin] listTournaments error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

export async function getTournament(req, res) {
  const tournamentId = String(req.params.tournamentId || "").trim();
  if (!tournamentId) return res.status(400).json({ ok: false, error: "MISSING_TOURNAMENT_ID" });

  try {
    const doc = await getDb().collection(COLLECTION).findOne({ tournamentId });
    if (!doc) return res.status(404).json({ ok: false, error: "TOURNAMENT_NOT_FOUND" });
    return res.json({ ok: true, tournament: doc });
  } catch (err) {
    console.error("[admin] getTournament error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

export async function patchTournament(req, res) {
  const tournamentId = String(req.params.tournamentId || "").trim();
  if (!tournamentId) return res.status(400).json({ ok: false, error: "MISSING_TOURNAMENT_ID" });

  const allowed = ["title", "status", "mode", "categories", "schedule", "location",
    "associatedClubId", "volunteerIds", "organizerEntityId"];
  const update = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  }
  if (Object.keys(update).length === 0) {
    return res.status(400).json({ ok: false, error: "NO_FIELDS_TO_UPDATE" });
  }
  update.updatedAtUnix = Math.floor(Date.now() / 1000);

  try {
    const result = await getDb()
      .collection(COLLECTION)
      .findOneAndUpdate({ tournamentId }, { $set: update }, { returnDocument: "after" });
    if (!result) return res.status(404).json({ ok: false, error: "TOURNAMENT_NOT_FOUND" });
    return res.json({ ok: true, tournament: result });
  } catch (err) {
    console.error("[admin] patchTournament error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}
