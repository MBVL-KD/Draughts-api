import express from "express";
import {
  upsertTournament,
  finalizeTournament,
  getTournaments,
  getTournament
} from "../controllers/tournamentController.js";
import { requireApiKey } from "../middleware/require-api-key.js";

const router = express.Router();

router.post("/upsert", requireApiKey, upsertTournament);
router.post("/finalize", requireApiKey, finalizeTournament);

// 🔥 NIEUW
router.get("/", getTournaments);
router.get("/:id", getTournament);

export default router;
