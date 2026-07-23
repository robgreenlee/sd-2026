// Cloud sync endpoint for the player stat tracker (stats.html).
//
// Stores each team's entire stats database as one JSON record in Redis,
// keyed by team code and protected by a passcode (set on first save).
// Backed by any Upstash-compatible Redis REST store — on Vercel, add one
// via Storage → Create Database → Upstash for Redis and connect it to this
// project; the env vars below are injected automatically.
//
// POST /api/sync  { action: 'load'|'save', team, secret, data? }
//   load → { data, updatedAt } (data is null if the team has never saved)
//   save → { ok: true, updatedAt }

const crypto = require('crypto');

const MAX_BYTES = 1024 * 1024; // one season of stats is ~50 KB; 1 MB is generous

// Find the Upstash REST credentials under any name Vercel may have injected
// them with, including custom prefixes (e.g. LAMOStorage_KV_REST_API_URL).
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
  if (!r.ok) throw new Error('Storage backend error (' + r.status + ')');
  const out = await r.json();
  return out.result;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  const env = redisEnv();
  if (!env) {
    return res.status(503).json({ error: 'Cloud sync is not set up on the server yet — connect an Upstash Redis store to this Vercel project (see README).' });
  }
  try {
    const body = req.body || {};
    const action = body.action;
    const team = String(body.team || '').trim().toLowerCase();
    const secret = body.secret;
    if (!/^[a-z0-9][a-z0-9_-]{2,39}$/.test(team)) {
      return res.status(400).json({ error: 'Team code must be 3–40 letters, numbers, dashes or underscores.' });
    }
    if (typeof secret !== 'string' || secret.length < 4) {
      return res.status(400).json({ error: 'Passcode must be at least 4 characters.' });
    }
    const secretHash = crypto.createHash('sha256').update(secret).digest('hex');
    const key = 'polo:' + team;
    const raw = await redisCmd(env, ['GET', key]);
    const existing = raw ? JSON.parse(raw) : null;
    if (existing && existing.secretHash !== secretHash) {
      return res.status(403).json({ error: 'Wrong passcode for this team code.' });
    }

    if (action === 'load') {
      return res.status(200).json(existing ? { data: existing.data, updatedAt: existing.updatedAt } : { data: null });
    }
    if (action === 'save') {
      const data = body.data;
      if (!data || typeof data !== 'object' || !Array.isArray(data.players) || !Array.isArray(data.games)) {
        return res.status(400).json({ error: 'Malformed stats data.' });
      }
      const json = JSON.stringify(data);
      if (json.length > MAX_BYTES) {
        return res.status(413).json({ error: 'Stats data too large to sync.' });
      }
      const record = { secretHash, updatedAt: Date.now(), data };
      await redisCmd(env, ['SET', key, JSON.stringify(record)]);
      return res.status(200).json({ ok: true, updatedAt: record.updatedAt });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    return res.status(500).json({ error: 'Sync failed: ' + (e && e.message ? e.message : 'unknown error') });
  }
};
