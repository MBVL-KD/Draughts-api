import { Router } from "express";
import { syncPlayer } from "../controllers/player-sync.controller.js";

const router = Router();

router.post("/sync", syncPlayer);

export default router;
