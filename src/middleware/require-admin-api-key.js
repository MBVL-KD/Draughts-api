import { env } from "../config/env.js";

export function requireAdminApiKey(req, res, next) {
  if (!env.adminApiKey) {
    return res.status(500).json({ ok: false, error: "ADMIN_API_KEY_NOT_CONFIGURED" });
  }
  const header = req.header("x-admin-api-key");
  if (!header || header !== env.adminApiKey) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }
  next();
}
