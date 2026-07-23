// Live schedule/results endpoint for the JO bracket explorer (index.html).
//
// Fetches the published NJO schedule sheet's 14U_Men_Classic tab as CSV and
// returns one entry per 14BX game: matchup labels, scores (when entered),
// time, location, and win/lose routing. The explorer overlays this on its
// bracket model, so results and any sheet corrections flow in automatically.
// CDN-cached for 5 minutes — the sheet only changes a few times a day.

const SHEET_ID = '1ycEOkayVwo_h37vL98PTXbzEnBpRU_-3S9l6NeiwCc4';
const GID = '727959574'; // 14U_Men_Classic tab
const CSV_URL = process.env.SCHEDULE_CSV_URL
  || 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=csv&gid=' + GID;

// Minimal CSV parser (handles quoted cells and embedded commas/newlines).
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

function num(v) {
  const s = String(v == null ? '' : v).trim();
  if (!/^\d+$/.test(s)) return null;
  return parseInt(s, 10);
}

// Sheet row layout around the GMID column (anchor at index i):
// i-6 White · i-5 White score · i-4 Dark · i-3 Dark score · i-2 W-to · i-1 L-to
// Absolute columns: 1 = Time, 3 = Location.
function parseGames(csv) {
  const games = [];
  for (const row of parseCSV(csv)) {
    for (let i = 0; i < row.length; i++) {
      const m = String(row[i]).trim().match(/^14BX-(\d{3})$/);
      if (!m || i < 6) continue;
      const clean = (idx) => String(row[idx] == null ? '' : row[idx]).trim();
      games.push({
        n: parseInt(m[1], 10),
        white: clean(i - 6),
        ws: num(row[i - 5]),
        dark: clean(i - 4),
        ds: num(row[i - 3]),
        wTo: clean(i - 2),
        lTo: clean(i - 1),
        time: clean(1),
        loc: clean(3),
      });
      break;
    }
  }
  return games;
}

module.exports = async (req, res) => {
  try {
    const r = await fetch(CSV_URL, { redirect: 'follow' });
    if (!r.ok) throw new Error('sheet returned ' + r.status);
    const csv = await r.text();
    const games = parseGames(csv);
    if (!games.length) throw new Error('no 14BX games found in the sheet');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ updatedAt: Date.now(), games });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Could not load the schedule sheet: ' + (e && e.message ? e.message : 'unknown error') });
  }
};
