// Short-link storage for shared box scores (stats.html).
//
// POST { data: <box score> } → { id }   — stores the box score in Redis under
//   a content-hash id (identical content always maps to the same id), with a
//   one-year TTL. The share link becomes stats.html#b=<id>.
// GET ?id=<id> → { data }               — fetches a stored box score.
//
// When no Redis store is connected, POST returns 503 and the client falls
// back to the long self-contained #g= link.

const crypto = require('crypto');

const TTL_SECONDS = 365 * 24 * 3600;
const MAX_BYTES = 16 * 1024;

function redisEnv() {
  const env = process.env;
  const pair = (u, t) => (env[u] && env[t]) ? { url: env[u], token: env[t] } : null;
  const direct = pair('KV_REST_API_URL', 'KV_REST_API_TOKEN')
    || pair('UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN');
  if (direct) return direct;
  for (const key of Object.keys(env)) {
    if (!/(KV_REST_API_URL|UPSTASH_REDIS_REST_URL)$/.test(key)) continue;
    const found = pair(key, key.replace(/_URL$/, '_TOKEN'));
    if (found) return found;
  }
  return null;
}

async function redisCmd(env, cmd) {
  const r = await fetch(env.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error('storage error ' + r.status);
  return (await r.json()).result;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const env = redisEnv();
  try {
    if (req.method === 'POST') {
      if (!env) return res.status(503).json({ error: 'No storage connected — using the long link instead.' });
      const data = req.body && req.body.data;
      if (!data || typeof data !== 'object' || !Array.isArray(data.rows)) {
        return res.status(400).json({ error: 'Malformed box score.' });
      }
      const json = JSON.stringify(data);
      if (json.length > MAX_BYTES) return res.status(413).json({ error: 'Box score too large.' });
      const id = crypto.createHash('sha256').update(json).digest('base64url').slice(0, 10);
      await redisCmd(env, ['SET', 'box:' + id, json, 'EX', String(TTL_SECONDS)]);
      return res.status(200).json({ id });
    }
    const m = String(req.url || '').match(/[?&]id=([A-Za-z0-9_-]{4,32})/);
    if (!m) return res.status(400).json({ error: 'Missing id.' });
    if (!env) return res.status(503).json({ error: 'No storage connected.' });
    const raw = await redisCmd(env, ['GET', 'box:' + m[1]]);
    if (!raw) return res.status(404).json({ error: 'Box score not found — the link may have expired.' });
    // Content is immutable per id (content-hash), so long CDN caching is safe.
    res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate=86400');
    return res.status(200).json({ data: JSON.parse(raw) });
  } catch (e) {
    return res.status(502).json({ error: 'Storage error: ' + (e && e.message ? e.message : 'unknown') });
  }
};
