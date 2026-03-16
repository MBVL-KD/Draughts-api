import { Router } from "express";
import {
  getPlayerProfile,
  getRecentGames,
  getPlayerRatings,
  getPlayerRatingSnapshot,
} from "../controllers/players.controller.js";

const router = Router();

router.get("/:userId/profile", getPlayerProfile);
router.get("/:userId/recent-games", getRecentGames);
router.get("/:userId/ratings", getPlayerRatings);
router.get("/:userId/rating-snapshot", getPlayerRatingSnapshot);

export default router;
