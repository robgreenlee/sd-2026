// Live schedule/results endpoint for the JO bracket explorer (index.html).
//
// GET  — returns one entry per 14BX game (matchup, scores, time, location,
//        W/L routing), pulled from the first source that works:
//          1. the published Google Sheet's 14U_Men_Classic tab (CSV export)
//          2. the same tab via Google's gviz CSV endpoint
//          3. the Kahuna Events live-results page (HTML table)
//          4. the most recent manually pasted schedule (stored in Redis)
//        All sources share one column layout: the GMID cell (14BX-###) is the
//        anchor; White/scores/Dark/routing sit at fixed offsets before it.
// POST — { action: 'paste', text } parses a pasted copy of the sheet
//        (TSV from Google Sheets select-all, CSV, or HTML) and stores it in
//        Redis (when configured) so every device gets the update; the parsed
//        games are returned either way so the pasting device applies them.

const SHEET_ID = '1ycEOkayVwo_h37vL98PTXbzEnBpRU_-3S9l6NeiwCc4';
const GID = process.env.SCHEDULE_GID || '727959574'; // 14U_Men_Classic tab (gid can churn when the sheet is rebuilt)
const SHEET_NAME = process.env.SCHEDULE_SHEET_NAME || '14U_Men_Classic';
const KAHUNA_URL = process.env.SCHEDULE_KAHUNA_URL
  || 'https://www.kahunaevents.org/cgi-bin/htmlos.cgi/005582.1.014876855010509834';

function sources() {
  const base = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID;
  const list = process.env.SCHEDULE_CSV_URL
    ? [{ name: 'custom', url: process.env.SCHEDULE_CSV_URL }]
    : [
        // By tab NAME first — immune to gid churn when the sheet is rebuilt.
        { name: 'byname', url: base + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(SHEET_NAME) },
        // Whole-spreadsheet HTML view: every tab in one response, no gid or
        // tab name needed — the GMID filter finds the 14BX rows wherever they are.
        { name: 'htmlview', url: base + '/htmlview' },
        { name: 'export', url: base + '/export?format=csv&gid=' + GID },
        { name: 'gviz', url: base + '/gviz/tq?tqx=out:csv&gid=' + GID },
      ];
  list.push({ name: 'kahuna', url: KAHUNA_URL });
  return list;
}

const PASTE_KEY = 'polo:schedule:14bx';
const MAX_PASTE = 900 * 1024;

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
  if (!r.ok) throw new Error('storage error ' + r.status);
  return (await r.json()).result;
}

// ---------- parsing ----------
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function htmlToRows(html) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html))) {
    const cells = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let c;
    while ((c = tdRe.exec(m[1]))) {
      cells.push(c[1].replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ').trim());
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function textToRows(text) {
  if (/<table|<tr[\s>]/i.test(text)) return htmlToRows(text);
  if (text.indexOf('\t') >= 0) return text.split(/\r?\n/).map(l => l.split('\t'));
  return parseCSV(text);
}

function num(v) {
  const s = String(v == null ? '' : v).trim();
  return /^\d+$/.test(s) ? parseInt(s, 10) : null;
}

// Row layout around the GMID cell (anchor at index i), all offsets relative
// so leading extra cells (e.g. htmlview's row-number column) don't matter:
// i-11 Date · i-10 Time · i-9 Type · i-8 Location · i-7 Gm# ·
// i-6 White · i-5 White score · i-4 Dark · i-3 Dark score · i-2 W-to · i-1 L-to
function parseGames(rows) {
  const games = [];
  for (const row of rows) {
    for (let i = 6; i < row.length; i++) {
      const m = String(row[i]).trim().match(/^14BX-(\d{3})$/);
      if (!m) continue;
      const clean = (idx) => idx >= 0 && row[idx] != null ? String(row[idx]).trim() : '';
      games.push({
        n: parseInt(m[1], 10),
        white: clean(i - 6),
        ws: num(row[i - 5]),
        dark: clean(i - 4),
        ds: num(row[i - 3]),
        wTo: clean(i - 2),
        lTo: clean(i - 1),
        time: clean(i - 10),
        loc: clean(i - 8),
      });
      break;
    }
  }
  return games;
}

// ---------- handlers ----------
async function handleGet(req, res) {
  const attempts = [];
  for (const src of sources()) {
    try {
      const r = await fetch(src.url, { redirect: 'follow' });
      const text = await r.text();
      const games = r.ok ? parseGames(textToRows(text)) : [];
      if (r.ok && games.length) {
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return res.status(200).json({ updatedAt: Date.now(), games, source: src.name });
      }
      attempts.push({
        source: src.name,
        status: r.status,
        contentType: String((r.headers && r.headers.get && r.headers.get('content-type')) || ''),
        snippet: text.slice(0, 160),
        reason: !r.ok ? 'HTTP ' + r.status : 'no 14BX rows parsed',
      });
    } catch (e) {
      attempts.push({ source: src.name, reason: 'fetch failed: ' + (e && e.message ? e.message : 'unknown') });
    }
  }
  // Last resort: the most recent pasted schedule.
  const env = redisEnv();
  if (env) {
    try {
      const raw = await redisCmd(env, ['GET', PASTE_KEY]);
      if (raw) {
        const stored = JSON.parse(raw);
        if (stored && Array.isArray(stored.games) && stored.games.length) {
          res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
          return res.status(200).json({ updatedAt: stored.storedAt, games: stored.games, source: 'paste' });
        }
      }
      attempts.push({ source: 'paste', reason: 'no pasted schedule stored yet' });
    } catch (e) {
      attempts.push({ source: 'paste', reason: 'storage: ' + (e && e.message ? e.message : 'unknown') });
    }
  } else {
    attempts.push({ source: 'paste', reason: 'no Redis store connected' });
  }
  res.setHeader('Cache-Control', 'no-store');
  const summary = attempts.map(a => a.source + ': ' + a.reason).join(' · ');
  const body = { error: 'Could not load the schedule — ' + summary };
  if (String(req.url || '').indexOf('debug=1') >= 0) body.attempts = attempts;
  return res.status(502).json(body);
}

async function handlePaste(req, res) {
  const text = (req.body && req.body.text) || '';
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Nothing to parse — paste the schedule text first.' });
  }
  if (text.length > MAX_PASTE) {
    return res.status(413).json({ error: 'Pasted text too large.' });
  }
  const games = parseGames(textToRows(text));
  if (!games.length) {
    return res.status(400).json({ error: 'No 14BX game rows found in the pasted text. Copy the whole 14U_Men_Classic tab (Ctrl/Cmd-A, then copy) and paste it all.' });
  }
  let stored = false;
  const env = redisEnv();
  if (env) {
    try {
      await redisCmd(env, ['SET', PASTE_KEY, JSON.stringify({ games, storedAt: Date.now() })]);
      stored = true;
    } catch (e) { /* still return the games for local use */ }
  }
  return res.status(200).json({ ok: true, count: games.length, stored, games, updatedAt: Date.now(), source: 'paste' });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST') {
    const action = req.body && req.body.action;
    if (action === 'paste') return handlePaste(req, res);
    return res.status(400).json({ error: 'Unknown action.' });
  }
  return handleGet(req, res);
};
