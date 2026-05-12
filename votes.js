// Cloudflare Pages Function: /api/votes
// Storage: Cloudflare KV namespace bound as `VOTES`
// Bot/spam protection: per-IP+meal cooldown via KV

const COOLDOWN_SECONDS = 60 * 60 * 4; // one vote per IP per meal per 4 hours

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

function validMeal(s) {
  return s === 'breakfast' || s === 'lunch' || s === 'dinner';
}

function emptyVotes() {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

// GET /api/votes?date=YYYY-MM-DD&meal=breakfast|lunch|dinner
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const meal = url.searchParams.get('meal');

  if (!validDate(date) || !validMeal(meal)) {
    return jsonResponse({ error: 'bad params' }, 400);
  }

  const key = `votes:${date}:${meal}`;
  const raw = await env.VOTES.get(key);
  const data = raw ? JSON.parse(raw) : emptyVotes();
  return jsonResponse(data);
}

// POST /api/votes  { date, meal, stars }
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid json' }, 400);
  }

  const { date, meal, stars } = body || {};

  if (!validDate(date) || !validMeal(meal)) {
    return jsonResponse({ error: 'bad params' }, 400);
  }
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return jsonResponse({ error: 'stars must be 1-5' }, 400);
  }

  // Rate limit: one vote per IP per meal per cooldown window.
  // CF-Connecting-IP is provided by Cloudflare on every request.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cooldownKey = `cooldown:${date}:${meal}:${ip}`;
  const existing = await env.VOTES.get(cooldownKey);
  if (existing) {
    return jsonResponse({ error: 'already voted for this meal' }, 429);
  }

  // Read-modify-write the tally. KV is eventually consistent; for a dorm-scale
  // poll this is fine. If two writes race, one increment may be lost — acceptable.
  const key = `votes:${date}:${meal}`;
  const raw = await env.VOTES.get(key);
  const votes = raw ? JSON.parse(raw) : emptyVotes();
  votes[stars] = (votes[stars] || 0) + 1;

  await env.VOTES.put(key, JSON.stringify(votes));
  await env.VOTES.put(cooldownKey, '1', { expirationTtl: COOLDOWN_SECONDS });

  return jsonResponse(votes);
}
