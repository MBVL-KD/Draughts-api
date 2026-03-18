import mongoose from "mongoose";

const TournamentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },

    recordType: String,
    recordVersion: Number,

    templateKey: String,
    templateId: String,

    name: String,
    system: String,

    variantId: String,
    rulesetId: String,
    scenarioId: String,

    timeClass: String,
    timeControl: {
      baseSeconds: Number,
      incrementSeconds: Number,
    },

    frequency: String,
    rated: Boolean,
    allowSpectators: Boolean,
    allowAI: Boolean,

    status: String,
    isFinal: Boolean,

    createdAt: Number,
    updatedAt: Number,
    startAt: Number,
    endAt: Number,

    scheduleKey: String,
    scheduleBucket: String,

    islandTemplate: String,
    islandArenaId: String,
    islandModelName: String,

    playerCounts: {
      spectators: Number,
      participants: Number,
      queued: Number,
      inMatch: Number,
      left: Number,
      total: Number,
    },

    stats: {
      joins: Number,
      leaves: Number,
      matchesPlayed: Number,
      spectatorJoins: Number,
      participantJoins: Number,
      queueJoins: Number,
    },

    standings: { type: Array, default: [] },
    liveMatches: { type: Array, default: [] },
    recentMatches: { type: Array, default: [] },
    matchHistory: { type: Array, default: [] },

    finalizedAt: Number,
  },
  { timestamps: true }
);

const Tournament = mongoose.models.Tournament || mongoose.model("Tournament", TournamentSchema);

export default Tournament;    endAt: Number,

    scheduleKey: String,
    scheduleBucket: String,

    islandTemplate: String,
    islandArenaId: String,
    islandModelName: String,

    playerCounts: {
      spectators: Number,
      participants: Number,
      queued: Number,
      inMatch: Number,
      left: Number,
      total: Number,
    },

    stats: {
      joins: Number,
      leaves: Number,
      matchesPlayed: Number,
      spectatorJoins: Number,
      participantJoins: Number,
      queueJoins: Number,
    },

    standings: { type: Array, default: [] },
    liveMatches: { type: Array, default: [] },
    recentMatches: { type: Array, default: [] },
    matchHistory: { type: Array, default: [] },

    // 🔥 EXTRA (handig)
    finalizedAt: Number,
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Tournament", TournamentSchema);
