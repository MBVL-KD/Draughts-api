import express from "express";
import {
  upsertTournament,
  finalizeTournament,
  getTournaments,
  getTournament
} from "../controllers/tournamentController.js";

const router = express.Router();

router.post("/upsert", upsertTournament);
router.post("/finalize", finalizeTournament);

// 🔥 NIEUW
router.get("/", getTournaments);
router.get("/:id", getTournament);

export default router;
