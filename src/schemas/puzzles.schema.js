import { z } from "zod";

const modeSchema = z.enum(["training", "lesson", "ranked"]);

export const nextPuzzleSchema = z.object({
  playerId: z.union([z.string(), z.number()]),
  mode: modeSchema,
  variantId: z.string().min(1),
  sessionId: z.string().max(120).optional().nullable(),
  lang: z.string().min(2).max(10).optional().default("nl"),
  requiredLanguage: z.array(z.string().min(2).max(10)).max(5).optional(),
  topicTags: z.array(z.string().min(1).max(80)).max(20).optional().default([]),
  bookId: z.string().optional(),
  lessonId: z.string().optional(),
  excludePuzzleIds: z.array(z.string()).max(200).optional().default([]),
  seed: z.string().max(120).optional(),
  debug: z.boolean().optional().default(false),
});

const flatResultFieldsSchema = z.object({
  solved: z.boolean(),
  timeMs: z.number().int().min(0).max(1000 * 60 * 60),
  hintsUsed: z.number().int().min(0).max(100),
  attemptCount: z.number().int().min(1).max(50),
  mistakes: z.number().int().min(0).max(100),
});

const resultTierSchema = z.enum(["perfect", "recovered", "unsolved"]);

const lessonProgressSchema = z.object({
  bookId: z.string().min(1),
  lessonId: z.string().min(1),
  stepId: z.string().min(1),
  stepIndex: z.number().int().min(0),
  totalStepsKnown: z.number().int().min(0).optional(),
  bookRevision: z.number().int().min(0).optional(),
  markStepCompleted: z.boolean().optional(),
});

export const puzzleResultCompatSchema = z
  .object({
    attemptId: z.string().min(1).max(120),
    playerId: z.union([z.string(), z.number()]),
    sessionId: z.string().min(1).max(120),
    puzzleId: z.string().min(1),
    mode: modeSchema,
    variantId: z.string().min(1),
    result: flatResultFieldsSchema.optional(),
    solved: z.boolean().optional(),
    timeMs: z.number().int().min(0).max(1000 * 60 * 60).optional(),
    hintsUsed: z.number().int().min(0).max(100).optional(),
    attemptCount: z.number().int().min(1).max(50).optional(),
    mistakes: z.number().int().min(0).max(100).optional(),
    hadMistake: z.boolean().optional(),
    resultTier: resultTierSchema.optional(),
    endedBy: z.string().min(1).max(64).optional(),
    stepVersion: z.string().max(120).optional(),
    contentVersion: z.string().max(120).optional(),
    finalFen: z.string().max(200).optional(),
    lessonProgress: lessonProgressSchema.optional(),
    debug: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    const hasNested = Boolean(value.result);
    const hasFlat =
      typeof value.solved === "boolean" &&
      typeof value.timeMs === "number" &&
      typeof value.hintsUsed === "number" &&
      typeof value.attemptCount === "number" &&
      typeof value.mistakes === "number";

    if (!hasNested && !hasFlat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either result.{...} or flat solved/timeMs/hintsUsed/attemptCount/mistakes",
      });
    }
  })
  .transform((value) => ({
    // Runtime v2 fields are optional: derive sensible defaults when omitted.
    // This keeps older clients compatible while allowing richer analytics.
    resultTier:
      value.resultTier ||
      (value.result?.solved || value.solved
        ? (value.hadMistake ||
          Boolean((value.result?.mistakes ?? value.mistakes ?? 0) > 0)
            ? "recovered"
            : "perfect")
        : "unsolved"),
    hadMistake:
      typeof value.hadMistake === "boolean"
        ? value.hadMistake
        : Boolean((value.result?.mistakes ?? value.mistakes ?? 0) > 0),
    endedBy: value.endedBy || ((value.result?.solved || value.solved) ? "solved" : "unsolved"),
    attemptId: value.attemptId,
    playerId: value.playerId,
    sessionId: value.sessionId,
    puzzleId: value.puzzleId,
    mode: value.mode,
    variantId: value.variantId,
    result:
      value.result ||
      {
        solved: value.solved,
        timeMs: value.timeMs,
        hintsUsed: value.hintsUsed,
        attemptCount: value.attemptCount,
        mistakes: value.mistakes,
      },
    stepVersion: value.stepVersion,
    contentVersion: value.contentVersion,
    finalFen: value.finalFen,
    lessonProgress: value.lessonProgress,
    debug: value.debug ?? false,
  }));
