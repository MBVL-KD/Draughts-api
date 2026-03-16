import app from "./app.js";
import { env } from "./config/env.js";
import { connectMongo } from "./config/mongo.js";

import playerSyncRoutes from "./routes/player-sync.routes.js";
import playerRoutes from "./routes/players.routes.js";

app.use("/api/player", playerSyncRoutes);
app.use("/api/players", playerRoutes);

async function start() {
  await connectMongo();

  app.listen(env.port, () => {
    console.log(`Backend listening on port ${env.port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start backend:", err);
  process.exit(1);
});
