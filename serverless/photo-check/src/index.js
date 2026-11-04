// NEERKATTI photo check (final round, P1): one small Cloudflare Worker that holds the vision
// model's API key, so the key is never in the website or this repository.
//
// The map sends a photo that the browser has already shrunk to about 1 MB and re-drawn, which
// drops its hidden data (EXIF, including GPS), and, only if the person allowed it, where they
// stand. The Worker asks Google's Gemini model for one of five answers about the ground in the
// photo and sends it back with how far the photo was taken from the patch.
// It stores nothing: no photo, no location, no log of either.
const CATEGORIES = ['construction', 'dumping', 'sewage', 'no_change', 'unclear'];
const ORIGINS = ['https://athulyapandian24.github.io', 'http://127.0.0.1:8791', 'http://localhost:8765', 'http://127.0.0.1:8765'];
const MAX_PHOTO = 1_500_000;   // characters of base64, a little over a 1 MB JPEG
const PER_MINUTE = 8;          // checks per visitor per minute, per Worker instance

const PROMPT = `You check citizens' photos for NEERKATTI, which watches Chennai's Pallikaranai marsh, a protected wetland, for filling and building.
Look only at the ground, water and structures in this photo, and choose ONE category:
- construction: new buildings, foundations, walls, piling, construction machines, or fresh concrete or paving.
- dumping: earth, rubble, debris or garbage dumped or spread to fill land or water.
- sewage: sewage or dirty wastewater flowing or pooled (pipes, foam, dark or oily water).
- no_change: natural water, marsh, reeds, grass or trees, with no sign of the three above.
- unclear: too dark or blurred, indoors, a photo of something else, or you cannot tell.
Answer "unclear" rather than guess. Never describe or identify people, faces, number plates, or any sign or text that names a person or company.
Give a confidence from 0 to 1 and one plain sentence, under 25 words, on what you see on the ground.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    category: { type: 'STRING', enum: CATEGORIES },
    confidence: { type: 'NUMBER' },
    reason: { type: 'STRING' }
  },
  required: ['category', 'confidence', 'reason']
};

const recent = new Map();   // visitor -> times of their recent checks (this instance only)

function reply(body, status, cors) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

function metres(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return Math.round(2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(a))));
}

function isNumber(x) { return typeof x === 'number' && Number.isFinite(x); }

function tooMany(visitor) {
  const now = Date.now();
  const times = (recent.get(visitor) || []).filter((t) => now - t < 60_000);
  times.push(now);
  recent.set(visitor, times);
  return times.length > PER_MINUTE;
}

async function askModel(env, photo) {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'image/jpeg', data: photo } }, { text: PROMPT }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2, maxOutputTokens: 2048 }
      })
    });
    if (!res.ok) {
      const detail = await res.text();
      return { error: `The vision model refused the request (${res.status}).`, detail: detail.slice(0, 300), status: res.status === 429 ? 429 : 502 };
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    let answer;
    try { answer = JSON.parse(text); } catch { return { error: 'The vision model gave no readable answer.', status: 502 }; }
    const category = CATEGORIES.includes(answer.category) ? answer.category : 'unclear';
    const confidence = isNumber(answer.confidence) ? Math.max(0, Math.min(1, answer.confidence)) : 0;
    const reason = String(answer.reason || '').slice(0, 240);
    return { category, confidence: Math.round(confidence * 100) / 100, reason, model };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'The vision model took too long. Try again.' : 'Could not reach the vision model.', status: 504 };
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const known = ORIGINS.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': known ? origin : ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // Which models this key can use (names only), to pick GEMINI_MODEL; no photo involved
    if (request.method === 'GET' && url.pathname === '/models') {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } });
      if (!res.ok) return reply({ error: `Model list refused (${res.status}).` }, 502, cors);
      const data = await res.json();
      const names = (data.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace('models/', ''));
      return reply({ models: names, using: env.GEMINI_MODEL || 'gemini-2.5-flash' }, 200, cors);
    }
    if (request.method === 'GET' && url.pathname === '/') return reply({ service: 'NEERKATTI photo check', ok: !!env.GEMINI_API_KEY }, 200, cors);
    if (request.method !== 'POST' || url.pathname !== '/check') return reply({ error: 'Not found.' }, 404, cors);
    if (!known) return reply({ error: 'This service only answers the NEERKATTI map.' }, 403, cors);
    if (!env.GEMINI_API_KEY) return reply({ error: 'The photo check has no API key yet.' }, 503, cors);
    if (tooMany(request.headers.get('CF-Connecting-IP') || 'anyone')) return reply({ error: 'Too many checks in a minute. Wait a moment and try again.' }, 429, cors);

    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Send the photo as JSON.' }, 400, cors); }
    const photo = String(body.photo || '').replace(/^data:image\/jpeg;base64,/, '');
    if (!photo || photo.length > MAX_PHOTO || !/^[A-Za-z0-9+/=]+$/.test(photo)) return reply({ error: 'Send one JPEG photo of up to about 1 MB.' }, 400, cors);

    const answer = await askModel(env, photo);
    if (answer.error) return reply({ error: answer.error }, answer.status || 502, cors);
    const here = isNumber(body.lat) && isNumber(body.lon);
    const site = body.site || {};
    answer.distance_m = here && isNumber(site.lat) && isNumber(site.lon) ? metres(body.lat, body.lon, site.lat, site.lon) : null;
    return reply(answer, 200, cors);
  }
};
