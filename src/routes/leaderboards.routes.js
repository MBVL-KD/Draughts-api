import { Router } from "express";
import { getLeaderboard } from "../controllers/leaderboards.controller.js";

const router = Router();

router.get("/:bucket", getLeaderboard);

export default router;
