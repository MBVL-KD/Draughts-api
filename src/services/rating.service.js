import { getDb } from "../config/mongo.js";

const INITIAL_RATING = 1500;
const INITIAL_RD = 700;
const INITIAL_VOL = 0.06;

function scoreFromResult(payload, side) {
  if (payload.outcome === "draw") return 0.5;
  if (payload.outcome === "win") {
    return payload.winnerSide === side ? 1 : 0;
  }
  return 0.5;
}

async function getOrCreatePlayerRating(userId, bucket) {
  const db = getDb();
  const ratings = db.collection("player_ratings");

  let doc = await ratings.findOne({ userId, bucket });
  if (doc) return doc;

  doc = {
    userId,
    bucket,
    rating: INITIAL_RATING,
    rd: INITIAL_RD,
    volatility: INITIAL_VOL,
    provisional: true,
    ratedGames: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    peakRating: INITIAL_RATING,
    lastRatedAtUnix: null,
    updatedAtUnix: Math.floor(Date.now() / 1000),
  };

  await ratings.insertOne(doc);
  return doc;
}

function naiveGlickoLikeUpdate(player, opponent, scoreActual) {
  const expected = 1 / (1 + Math.pow(10, (opponent.rating - player.rating) / 400));
  const k = player.provisional ? 40 : 20;
  const delta = Math.round(k * (scoreActual - expected));

  const ratingAfter = player.rating + delta;
  const rdAfter = Math.max(60, Math.round(player.rd * 0.92));
  const volatilityAfter = player.volatility;

  return {
    ratingBefore: player.rating,
    rdBefore: player.rd,
    volatilityBefore: player.volatility,
    ratingAfter,
    rdAfter,
    volatilityAfter,
    delta,
    provisionalBefore: player.provisional,
    provisionalAfter: rdAfter > 110,
  };
}

export async function applyRatedMatchIfNeeded(payload) {
  if (!payload.countsForRatings || !payload.rated || !payload.ratingBucket) {
    return {
      ratingProcessed: false,
      matchPatch: {},
    };
  }

  if (!payload.whiteUserId || !payload.blackUserId) {
    return {
      ratingProcessed: false,
      matchPatch: {},
    };
  }

  const db = getDb();
  const ratings = db.collection("player_ratings");
  const history = db.collection("player_rating_history");

  const whiteCurrent = await getOrCreatePlayerRating(payload.whiteUserId, payload.ratingBucket);
  const blackCurrent = await getOrCreatePlayerRating(payload.blackUserId, payload.ratingBucket);

  const whiteScore = scoreFromResult(payload, "W");
  const blackScore = scoreFromResult(payload, "B");

  const whiteUpdate = naiveGlickoLikeUpdate(whiteCurrent, blackCurrent, whiteScore);
  const blackUpdate = naiveGlickoLikeUpdate(blackCurrent, whiteCurrent, blackScore);

  const now = Math.floor(Date.now() / 1000);

  await ratings.updateOne(
    { userId: payload.whiteUserId, bucket: payload.ratingBucket },
    {
      $set: {
        rating: whiteUpdate.ratingAfter,
        rd: whiteUpdate.rdAfter,
        volatility: whiteUpdate.volatilityAfter,
        provisional: whiteUpdate.provisionalAfter,
        peakRating: Math.max(whiteCurrent.peakRating || whiteCurrent.rating, whiteUpdate.ratingAfter),
        lastRatedAtUnix: now,
        updatedAtUnix: now,
      },
      $inc: {
        ratedGames: 1,
        wins: whiteScore === 1 ? 1 : 0,
        draws: whiteScore === 0.5 ? 1 : 0,
        losses: whiteScore === 0 ? 1 : 0,
      },
    }
  );

  await ratings.updateOne(
    { userId: payload.blackUserId, bucket: payload.ratingBucket },
    {
      $set: {
        rating: blackUpdate.ratingAfter,
        rd: blackUpdate.rdAfter,
        volatility: blackUpdate.volatilityAfter,
        provisional: blackUpdate.provisionalAfter,
        peakRating: Math.max(blackCurrent.peakRating || blackCurrent.rating, blackUpdate.ratingAfter),
        lastRatedAtUnix: now,
        updatedAtUnix: now,
      },
      $inc: {
        ratedGames: 1,
        wins: blackScore === 1 ? 1 : 0,
        draws: blackScore === 0.5 ? 1 : 0,
        losses: blackScore === 0 ? 1 : 0,
      },
    }
  );

  await history.insertMany([
    {
      userId: payload.whiteUserId,
      matchId: payload.matchId,
      bucket: payload.ratingBucket,
      opponentUserId: payload.blackUserId,
      scoreActual: whiteScore,
      ...whiteUpdate,
      processedAtUnix: now,
    },
    {
      userId: payload.blackUserId,
      matchId: payload.matchId,
      bucket: payload.ratingBucket,
      opponentUserId: payload.whiteUserId,
      scoreActual: blackScore,
      ...blackUpdate,
      processedAtUnix: now,
    },
  ]);

  return {
    ratingProcessed: true,
    matchPatch: {
      whiteRatingAfter: whiteUpdate.ratingAfter,
      whiteRdAfter: whiteUpdate.rdAfter,
      whiteVolatilityAfter: whiteUpdate.volatilityAfter,
      whiteDelta: whiteUpdate.delta,

      blackRatingAfter: blackUpdate.ratingAfter,
      blackRdAfter: blackUpdate.rdAfter,
      blackVolatilityAfter: blackUpdate.volatilityAfter,
      blackDelta: blackUpdate.delta,
    },
  };
}
