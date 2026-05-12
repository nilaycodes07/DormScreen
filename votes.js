// Cloudflare Pages Function: /api/votes
// Storage: Cloudflare KV namespace bound as `VOTES`
// One vote per IP per day across all halls.

const HALLS = ['Wok', 'Taqueria', 'Triton Grill', 'Umi', 'Salad Bar'];

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function validDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function validHall(s) {
  return HALLS.includes(s);
}

function emptyTally() {
  const t = {};
  HALLS.forEach(h => t[h] = 0);
  return t;
}

// Seconds until end of UTC day. KV expirationTtl will auto-delete the cooldown
// entry at midnight, so users can vote again tomorrow without us cleaning up.
function secondsUntilUtcMidnight() {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0
  ));
  return Math.max(60, Math.floor((tomorrow - now) / 1000));
}

// GET /api/votes?date=YYYY-MM-DD
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date');

  if (!validDate(date)) {
    return jsonResponse({ error: 'bad params' }, 400);
  }

  const key = `halls:${date}`;
  const raw = await env.VOTES.get(key);
  const data = raw ? JSON.parse(raw) : emptyTally();

  // Backfill any missing hall keys (in case the list changes later)
  const t = emptyTally();
  HALLS.forEach(h => { if (typeof data[h] === 'number') t[h] = data[h]; });

  return jsonResponse(t);
}

// POST /api/votes  { date, hall }
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid json' }, 400);
  }

  const { date, hall } = body || {};

  if (!validDate(date)) {
    return jsonResponse({ error: 'bad date' }, 400);
  }
  if (!validHall(hall)) {
    return jsonResponse({ error: 'unknown hall' }, 400);
  }

  // Rate limit: one vote per IP per day, across all halls.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cooldownKey = `cooldown:${date}:${ip}`;
  const existing = await env.VOTES.get(cooldownKey);
  if (existing) {
    return jsonResponse({ error: 'already voted today' }, 429);
  }

  const key = `halls:${date}`;
  const raw = await env.VOTES.get(key);
  const tally = raw ? JSON.parse(raw) : emptyTally();
  tally[hall] = (tally[hall] || 0) + 1;

  // Persist. KV is eventually consistent; concurrent writes may rarely drop
  // an increment. For dorm-scale traffic this is acceptable.
  await env.VOTES.put(key, JSON.stringify(tally));
  await env.VOTES.put(cooldownKey, '1', {
    expirationTtl: secondsUntilUtcMidnight()
  });

  return jsonResponse(tally);
}
