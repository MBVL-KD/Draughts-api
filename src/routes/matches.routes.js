import { Router } from "express";
import { postFinalizedMatch } from "../controllers/matches.controller.js";

const router = Router();

router.post("/finalized", postFinalizedMatch);

export default router;
