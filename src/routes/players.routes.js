import { Router } from "express";

import {
  getPlayerProfile,
  getRecentGames,
  getPlayerRatings,
  getPlayerRatingSnapshot,
  getProfileSnapshot
} from "../controllers/players.controller.js";

const router = Router();

router.get("/players/:userId/profile", getPlayerProfile);
router.get("/players/:userId/recent-games", getRecentGames);
router.get("/players/:userId/ratings", getPlayerRatings);
router.get("/players/:userId/rating-snapshot", getPlayerRatingSnapshot);
router.get("/players/:userId/profile-snapshot", getProfileSnapshot);

router.get("/matches/:matchId", getMatchDetails);

export default router;
