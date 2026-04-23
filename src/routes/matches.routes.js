import { Router } from "express";
import { postFinalizedMatch } from "../controllers/matches.controller.js";
import { requireApiKey } from "../middleware/require-api-key.js";

const router = Router();

router.post("/finalized", requireApiKey, postFinalizedMatch);

export default router;
