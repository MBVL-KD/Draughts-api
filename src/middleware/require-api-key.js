import { env } from "../config/env.js";

export function requireApiKey(req, res, next) {
  if (!env.apiKey) {
    return res.status(500).json({
      ok: false,
      error: "API_KEY_NOT_CONFIGURED",
    });
  }

  const headerValue = req.header("x-api-key");
  if (!headerValue || headerValue !== env.apiKey) {
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
  }

  next();
}
