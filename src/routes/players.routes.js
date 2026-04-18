import { Router } from "express";
import {
  getPlayerProfile,
  getRecentGames,
  getRecentTournaments,
  getMatchDetails,
  getPlayerRatings,
  getPlayerRatingSnapshot,
  getProfileSnapshot,
  getPuzzleStats,
} from "../controllers/players.controller.js";
import { getLessonProgressPublic } from "../controllers/educationPublic.controller.js";
import { getLessonProgress, patchLessonProgress } from "../controllers/lessonProgress.controller.js";
import { requireApiKey } from "../middleware/require-api-key.js";

const router = Router();

router.get("/players/:userId/profile", getPlayerProfile);
router.get("/players/:userId/recent-games", getRecentGames);
router.get("/players/:userId/recent-tournaments", getRecentTournaments);
router.get("/players/:userId/ratings", getPlayerRatings);
router.get("/players/:userId/rating-snapshot", getPlayerRatingSnapshot);
router.get("/players/:userId/profile-snapshot", getProfileSnapshot);
router.get("/players/:userId/puzzle-stats", requireApiKey, getPuzzleStats);
router.get("/players/:userId/lesson-progress/public", requireApiKey, getLessonProgressPublic);
router.get("/players/:userId/lesson-progress", requireApiKey, getLessonProgress);
router.patch("/players/:userId/lesson-progress", requireApiKey, patchLessonProgress);
router.put("/players/:userId/lesson-progress", requireApiKey, patchLessonProgress);
router.get("/matches/:matchId", getMatchDetails);

export default router;
