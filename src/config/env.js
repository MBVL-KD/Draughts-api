import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || "development",
  mongoUri: process.env.MONGODB_URI || "",
  mongoDbName: process.env.MONGODB_DB_NAME || "kid_draughts",
  apiKey: process.env.API_KEY || "",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  internalApiBaseUrl: process.env.INTERNAL_API_BASE_URL || "",
  playbackOwnerType: process.env.PLAYBACK_OWNER_TYPE || "",
  playbackOwnerId: process.env.PLAYBACK_OWNER_ID || "",
};
