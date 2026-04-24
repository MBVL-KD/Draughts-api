import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { adminSpec } from "./swagger/adminSpec.js";

import matchesRouter from "./routes/matches.routes.js";
import playersRouter from "./routes/players.routes.js";
import leaderboardsRouter from "./routes/leaderboards.routes.js";
import playerSyncRoutes from "./routes/player-sync.routes.js";
import tournamentsRouter from "./routes/tournaments.js";
import puzzlesRoutes from "./routes/puzzles.routes.js";
import playbackProxyRoutes from "./routes/playback-proxy.routes.js";
import runtimeRoutes from "./routes/runtime.routes.js";
import adminRoutes from "./routes/admin.routes.js";

const app = express();

app.use(cors({ origin: env.corsOrigin === "*" ? true : env.corsOrigin }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(adminSpec, {
  customSiteTitle: "Draughts4All Admin API",
}));

/** Must be before other `/api` routers so `/api/steps/*` is not swallowed. */
app.use("/api/steps", playbackProxyRoutes);

app.use("/api/admin", adminRoutes);
app.use("/api/player", playerSyncRoutes);
app.use("/api", playersRouter)
app.use("/api/runtime", runtimeRoutes);
app.use("/api/matches", matchesRouter);
app.use("/api/leaderboards", leaderboardsRouter);
app.use("/api/tournaments", tournamentsRouter);
app.use("/v1/puzzles", puzzlesRoutes);

export default app;
