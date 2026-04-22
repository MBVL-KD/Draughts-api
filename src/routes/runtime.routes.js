import { Router } from "express";
import {
  getRuntimeBookLessons,
  getRuntimeBooks,
  getRuntimeLessonSteps,
} from "../controllers/runtimeContent.controller.js";
import { requireApiKey } from "../middleware/require-api-key.js";

const router = Router();

router.use(requireApiKey);
router.get("/books", getRuntimeBooks);
router.get("/books/:bookId/lessons", getRuntimeBookLessons);
router.get("/lessons/:lessonId/steps", getRuntimeLessonSteps);

export default router;
