import { Router } from "express";
import { requireAdminApiKey } from "../middleware/require-admin-api-key.js";
import {
  registerPlayer,
  getByChildRef,
  batchProfiles,
  getProfile,
  getGames,
  getLessonSummary,
  getPuzzleSummary,
  getTournaments,
  getBadges,
} from "../controllers/adminPlayers.controller.js";
import {
  createTournament,
  listTournaments,
  getTournament,
  patchTournament,
} from "../controllers/adminTournaments.controller.js";

const router = Router();

router.use(requireAdminApiKey);

// Identity bridge
router.post("/players/register", registerPlayer);
router.get("/players/by-child/:childRef", getByChildRef);
router.post("/players/batch-profiles", batchProfiles);

// Per-player reads
router.get("/players/:userId/profile", getProfile);
router.get("/players/:userId/games", getGames);
router.get("/players/:userId/lessons/summary", getLessonSummary);
router.get("/players/:userId/puzzles/summary", getPuzzleSummary);
router.get("/players/:userId/tournaments", getTournaments);
router.get("/players/:userId/badges", getBadges);

// Tournaments
router.post("/tournaments", createTournament);
router.get("/tournaments", listTournaments);
router.get("/tournaments/:tournamentId", getTournament);
router.patch("/tournaments/:tournamentId", patchTournament);

export default router;
