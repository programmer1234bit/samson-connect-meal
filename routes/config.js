import express from "express";
const router = express.Router();

/**
 * GET /api/config/maps-key
 * Returns { key: "..." } when GOOGLE_MAPS_API_KEY is present in env.
 * NOTE: returning API keys from the server is acceptable for client-side APIs
 * when the key is restricted by HTTP referrers. For extra security restrict by session/auth.
 */
router.get("/maps-key", (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY || null;
  if (!key) return res.status(404).json({ error: "maps key not configured" });
  // OPTIONAL: restrict by referer or session here
  // const referer = req.get('referer') || '';
  // if (!referer.includes('yourdomain.com')) return res.status(403).json({error:'forbidden'});
  res.json({ key });
});

export default router;
