import Tournament from "../models/Tournament.js";
import mongoose from "mongoose";

export async function upsertTournament(req, res) {
  try {
    const { payload } = req.body || {};

    if (!payload || !payload.id) {
      return res.status(400).json({ error: "INVALID_PAYLOAD" });
    }

    const matchesPlayed = Number(payload?.stats?.matchesPlayed || 0);

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
    const {
      status,
      limit = 20,
      cursorUpdatedAt,
      cursorId,
      variantId,
      timeClass,
    } = req.query;

    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
    const query = {};

    if (status) {
      query.status = status;
    }

    if (variantId) {
      query.variantId = variantId;
    }

    if (timeClass) {
      query.timeClass = timeClass;
    }

    if (cursorUpdatedAt && cursorId) {
      const ts = Number(cursorUpdatedAt);

      if (!Number.isNaN(ts) && mongoose.Types.ObjectId.isValid(cursorId)) {
        query.$or = [
          { updatedAt: { $lt: ts } },
          {
            updatedAt: ts,
            _id: { $lt: new mongoose.Types.ObjectId(cursorId) },
          },
        ];
      }
    }

    const tournaments = await Tournament.find(query)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(safeLimit + 1)
      .lean();

    const hasMore = tournaments.length > safeLimit;
    const page = hasMore ? tournaments.slice(0, safeLimit) : tournaments;

    let nextCursor = null;
    if (hasMore && page.length > 0) {
      const last = page[page.length - 1];
      nextCursor = {
        updatedAt: last.updatedAt,
        id: String(last._id),
      };
    }

    return res.json({
      ok: true,
      tournaments: page,
      hasMore,
      nextCursor,
    });
  } catch (err) {
    console.error("getTournaments error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

export async function getTournament(req, res) {
  try {
    const { id } = req.params;

    const tournament = await Tournament.findOne({ id }).lean();

    if (!tournament) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    return res.json({ ok: true, tournament });
  } catch (err) {
    console.error("getTournament error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}    console.error("Tournament upsert error:", err);
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
