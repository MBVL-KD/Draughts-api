import Tournament from "../models/Tournament.js";

export async function upsertTournament(req, res) {
  try {
    const { payload } = req.body || {};

    if (!payload || !payload.id) {
      return res.status(400).json({ error: "INVALID_PAYLOAD" });
    }

    const matchesPlayed = Number(payload?.stats?.matchesPlayed || 0);

    // Alleen bewaren als er echt minstens 1 match gespeeld is
    if (matchesPlayed <= 0) {
      return res.json({
        ok: true,
        skipped: true,
        reason: "no_matches_played",
      });
    }

    await Tournament.findOneAndUpdate(
      { id: payload.id },
      {
        ...payload,
        updatedAt: payload.updatedAt || Date.now(),
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("Tournament upsert error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

export async function finalizeTournament(req, res) {
  try {
    const { payload } = req.body || {};

    if (!payload || !payload.id) {
      return res.status(400).json({ error: "INVALID_PAYLOAD" });
    }

    const matchesPlayed = Number(payload?.stats?.matchesPlayed || 0);

    // Ook finalize niet opslaan als er nooit een match gespeeld is
    if (matchesPlayed <= 0) {
      return res.json({
        ok: true,
        skipped: true,
        reason: "no_matches_played",
      });
    }

    await Tournament.findOneAndUpdate(
      { id: payload.id },
      {
        ...payload,
        isFinal: true,
        finalizedAt: Date.now(),
        updatedAt: payload.updatedAt || Date.now(),
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("Tournament finalize error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

export async function getTournaments(req, res) {
  try {
    const { status, limit = 20 } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    const tournaments = await Tournament.find(query)
      .sort({ updatedAt: -1 })
      .limit(Number(limit))
      .lean();

    res.json({ ok: true, tournaments });
  } catch (err) {
    console.error("getTournaments error:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

export async function getTournament(req, res) {
  try {
    const { id } = req.params;

    const tournament = await Tournament.findOne({ id }).lean();

    if (!tournament) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    res.json({ ok: true, tournament });
  } catch (err) {
    console.error("getTournament error:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}
