import { Router } from "express";
import { getPlayerProfile, getRecentGames, getPlayerRatings } from "../controllers/players.controller.js";

const router = Router();

router.get("/:userId/profile", getPlayerProfile);
router.get("/:userId/recent-games", getRecentGames);
router.get("/:userId/ratings", getPlayerRatings);

export default router;
