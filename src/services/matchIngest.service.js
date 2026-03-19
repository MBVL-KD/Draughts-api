import { z } from "zod";
import { getDb } from "../config/mongo.js";
import { applyRatedMatchIfNeeded } from "./rating.service.js";
import { patchProfilesFromMatch } from "./profile.service.js";

const finalizedMatchSchema = z.object({
  dedupeKey: z.string().optional(),
  type: z.literal("completed_match").optional(),
  payload: z.object({
    matchId: z.string(),
    recordType: z.literal("completed_match"),
    recordVersion: z.number(),
    algorithmVersion: z.string().optional(),

    whiteUserId: z.number().nullable().optional(),
    blackUserId: z.number().nullable().optional(),

    variant: z.string().optional(),
    rated: z.boolean().optional(),
    ratingBucket: z.string().optional(),

    countsForRatings: z.boolean().optional(),
    countsForStandings: z.boolean().optional(),
    countsForProfileStats: z.boolean().optional(),
    countsForTournamentScore: z.boolean().optional(),

    outcome: z.string().nullable().optional(),
    result: z.string().nullable().optional(),
    winnerSide: z.string().nullable().optional(),
    winnerUserId: z.number().nullable().optional(),
    endReason: z.string().nullable().optional(),

    startedAtUnix: z.number().optional(),
    endedAtUnix: z.number().optional(),
    durationSec: z.number().optional(),

    whiteRatingBefore: z.number().optional(),
    whiteRdBefore: z.number().optional(),
    whiteVolatilityBefore: z.number().optional(),

    blackRatingBefore: z.number().optional(),
    blackRdBefore: z.number().optional(),
    blackVolatilityBefore: z.number().optional(),
  }).passthrough(),
});

export async function ingestFinalizedMatch(body) {
  const parsed = finalizedMatchSchema.parse(body);
  const payload = parsed.payload;

  const db = getDb();
  const matches = db.collection("matches");

  const existing = await matches.findOne(
    { matchId: payload.matchId },
    { projection: { _id: 1, processedAtUnix: 1 } }
  );

  if (existing) {
    return {
      ok: true,
      matchId: payload.matchId,
      stored: false,
      alreadyProcessed: true,
      ratingProcessed: true,
    };
  }

  await matches.insertOne({
    ...payload,
    receivedAtUnix: Math.floor(Date.now() / 1000),
    processedAtUnix: null,
  });

  const ratingResult = await applyRatedMatchIfNeeded(payload);

  await patchProfilesFromMatch({
    ...payload,
    ...ratingResult.matchPatch,
  });

  await matches.updateOne(
    { matchId: payload.matchId },
    {
      $set: {
        ...ratingResult.matchPatch,
        processedAtUnix: Math.floor(Date.now() / 1000),
      },
    }
  );

  return {
    ok: true,
    matchId: payload.matchId,
    stored: true,
    alreadyProcessed: false,
    ratingProcessed: ratingResult.ratingProcessed,
  };
}
