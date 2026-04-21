import express from "express";
import { env } from "../config/env.js";
import { requireApiKey } from "../middleware/require-api-key.js";

/**
 * Proxies Studio lesson-step playback so game servers can use one base URL
 * (Draughts-api) while playback is still served by Studio.
 *
 * Upstream: INTERNAL_API_BASE_URL (e.g. https://draughts-studio.onrender.com)
 * Path + query are preserved (req.originalUrl starts with /api/steps/...).
 *
 * Forwards x-owner-type / x-owner-id from the client when present; otherwise
 * falls back to PLAYBACK_OWNER_* / env (same as puzzle bridge).
 */
const router = express.Router();

router.use(requireApiKey);

router.use(async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const base = (process.env.INTERNAL_API_BASE_URL || env.internalApiBaseUrl || "").replace(/\/$/, "");
  if (!base) {
    return res.status(503).json({
      ok: false,
      error: "PLAYBACK_UPSTREAM_NOT_CONFIGURED",
      message: "Set INTERNAL_API_BASE_URL to the Studio origin (e.g. https://draughts-studio.onrender.com).",
    });
  }

  const pathAndQuery = req.originalUrl || `${req.baseUrl}${req.url}`;
  const upstreamUrl = `${base}${pathAndQuery.startsWith("/") ? "" : "/"}${pathAndQuery}`;

  const headerType = req.header("x-owner-type");
  const headerId = req.header("x-owner-id");
  const ownerType = (typeof headerType === "string" && headerType.trim()) || env.playbackOwnerType || "";
  const ownerId = (typeof headerId === "string" && headerId.trim()) || env.playbackOwnerId || "";

  const upstreamHeaders = { Accept: "application/json" };
  if (ownerType) upstreamHeaders["x-owner-type"] = ownerType;
  if (ownerId) upstreamHeaders["x-owner-id"] = ownerId;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "manual",
    });
    const text = await upstream.text();
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);
    return res.status(upstream.status).send(text);
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: "PLAYBACK_UPSTREAM_FETCH_FAILED",
      message: String(err?.message || err),
    });
  }
});

export default router;
