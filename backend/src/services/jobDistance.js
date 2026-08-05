import mongoose from 'mongoose';
import { config } from '../config.js';
import { PlaceCache } from '../models/PlaceCache.js';

const METERS_PER_MILE = 1609.344;
/** Cap OSRM “fastest” routes that take the long M25 arc (~2× crow-flies). */
const MAX_ROAD_FACTOR = 1.45;

/** Well-known UK airport / station codes — skip Nominatim. */
export const STATIC_COORDS = {
  LHR: { lat: 51.47, lng: -0.4543 },
  LGW: { lat: 51.1537, lng: -0.1821 },
  LTN: { lat: 51.8747, lng: -0.3683 },
  STN: { lat: 51.886, lng: 0.2389 },
  EUS: { lat: 51.5282, lng: -0.1337 },
  PAD: { lat: 51.5154, lng: -0.1755 },
  KGX: { lat: 51.5308, lng: -0.1238 },
  VIC: { lat: 51.4952, lng: -0.1441 },
  LCY: { lat: 51.5053, lng: 0.0553 },
};

const NOMINATIM_UA = 'wa-relay/1.0 (job-distance; contact: local)';

let lastNominatimAt = 0;

/**
 * @param {number} meters
 * @returns {number} miles rounded to 1 decimal
 */
export function metersToMiles(meters) {
  if (meters == null || !Number.isFinite(Number(meters)) || Number(meters) < 0) return null;
  return Math.round((Number(meters) / METERS_PER_MILE) * 10) / 10;
}

/**
 * Great-circle miles between two {lat,lng} points.
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 * @returns {number|null}
 */
export function haversineMiles(a, b) {
  if (!a || !b) return null;
  const lat1 = Number(a.lat);
  const lng1 = Number(a.lng);
  const lat2 = Number(b.lat);
  const lng2 = Number(b.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sin =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const miles = 2 * 3958.8 * Math.asin(Math.min(1, Math.sqrt(sin)));
  return Math.round(miles * 10) / 10;
}

/**
 * Prefer OSRM miles, but clamp absurd orbital detours for £/mi.
 * @param {number|null|undefined} routeMiles
 * @param {{ lat: number, lng: number }} from
 * @param {{ lat: number, lng: number }} to
 * @returns {number|null}
 */
export function clampRouteMiles(routeMiles, from, to) {
  if (routeMiles == null || !Number.isFinite(Number(routeMiles))) return null;
  const miles = Number(routeMiles);
  const crow = haversineMiles(from, to);
  if (crow == null || crow <= 0) return Math.round(miles * 10) / 10;
  const cap = Math.round(crow * MAX_ROAD_FACTOR * 10) / 10;
  return Math.round(Math.min(miles, cap) * 10) / 10;
}

/**
 * @param {number|null|undefined} price
 * @param {number|null|undefined} distanceMiles
 * @returns {number|null}
 */
export function computePricePerMile(price, distanceMiles) {
  const p = price == null ? null : Number(price);
  const d = distanceMiles == null ? null : Number(distanceMiles);
  if (p == null || !Number.isFinite(p) || d == null || !Number.isFinite(d) || d <= 0) return null;
  return Math.round((p / d) * 100) / 100;
}

function normalizeQuery(place) {
  return String(place || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

/** London postal areas — bare outcodes (esp. WC2) often miss on Nominatim. */
const LONDON_OUTCODE_RE = /^(EC|WC|E|N|NW|SE|SW|W)\d/i;

/**
 * Nominatim often misses long landmark names; try shorter variants.
 * e.g. "Queen Elizabeth II Cruise Terminal, Southampton" → "Cruise Terminal Southampton"
 * @param {string} place
 * @returns {string[]}
 */
export function buildGeocodeFallbacks(place) {
  const raw = String(place || '').trim();
  const variants = [];
  const add = (s) => {
    const n = normalizeQuery(s);
    if (n && !variants.includes(n)) variants.push(n);
  };

  // Bare London outcodes: prefer "E1 London" (bare E1/W1 geocode to wrong cities)
  const outcodeOnly = raw.match(/^([A-Za-z]{1,2}\d{1,2}[A-Za-z]?)$/);
  if (outcodeOnly && LONDON_OUTCODE_RE.test(outcodeOnly[1])) {
    add(`${outcodeOnly[1]} London`);
    add(`${outcodeOnly[1]}, London`);
    add(raw);
  } else {
    add(raw);
  }
  add(raw.replace(/,/g, ' '));

  // UK full postcode → outcode (or London-qualified outcode)
  const pc = raw.match(/^([A-Za-z]{1,2}\d{1,2}[A-Za-z]?)\s*\d[A-Za-z]{2}$/);
  if (pc) {
    if (LONDON_OUTCODE_RE.test(pc[1])) add(`${pc[1]} London`);
    else add(pc[1]);
  }

  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const city = parts[parts.length - 1];
    add(parts.slice(-2).join(' '));
    add(`${parts[0]} ${city}`);
    const landmarkWords = parts[0].split(/\s+/).filter(Boolean);
    for (let i = 1; i < landmarkWords.length; i++) {
      add(`${landmarkWords.slice(i).join(' ')} ${city}`);
    }
    // Avoid bare city alone — too ambiguous for driving distance.
  }

  return variants;
}

function emptyGeo() {
  return {
    fromLat: null,
    fromLng: null,
    toLat: null,
    toLng: null,
    distanceMiles: null,
    pricePerMile: null,
  };
}

async function sleep(ms) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

async function readCache(query) {
  if (mongoose.connection.readyState !== 1) return null;
  try {
    const cached = await PlaceCache.findOne({ query }).lean();
    if (cached && Number.isFinite(cached.lat) && Number.isFinite(cached.lng)) {
      return { lat: cached.lat, lng: cached.lng, source: 'cache' };
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function writeCache(queries, lat, lng) {
  if (mongoose.connection.readyState !== 1) return;
  for (const query of queries) {
    try {
      await PlaceCache.findOneAndUpdate(
        { query },
        { query, lat, lng },
        { upsert: true, new: true },
      );
    } catch {
      /* ignore */
    }
  }
}

/**
 * @param {string} q normalized query
 * @param {{ fetchFn?: typeof fetch }} opts
 * @returns {Promise<{ lat: number, lng: number } | null>}
 */
async function nominatimSearch(q, opts = {}) {
  const fetchFn = opts.fetchFn || globalThis.fetch;
  const interval = config.nominatimMinIntervalMs;
  const wait = interval - (Date.now() - lastNominatimAt);
  if (wait > 0) await sleep(wait);

  const url = new URL(`${config.nominatimUrl}/search`);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'gb');

  lastNominatimAt = Date.now();
  try {
    const res = await fetchFn(url.toString(), {
      headers: { 'User-Agent': NOMINATIM_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = Array.isArray(data) && data[0] ? data[0] : null;
    const lat = hit ? Number(hit.lat) : NaN;
    const lng = hit ? Number(hit.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/**
 * Resolve place string to { lat, lng } or null.
 * Uses static table, PlaceCache, then Nominatim (with name fallbacks).
 * Cache is keyed only by the original place string so a bad "E1" entry
 * (Newcastle) cannot override "E1 1HH" (London).
 * @param {string} place
 * @param {{ fetchFn?: typeof fetch, skipNetwork?: boolean }} [opts]
 */
export async function geocodePlace(place, opts = {}) {
  const variants = buildGeocodeFallbacks(place);
  if (!variants.length) return null;
  const inputKey = normalizeQuery(place);

  for (const q of variants) {
    if (STATIC_COORDS[q]) {
      const hit = { ...STATIC_COORDS[q], source: 'static' };
      await writeCache([inputKey], hit.lat, hit.lng);
      return hit;
    }
  }

  const cached = await readCache(inputKey);
  if (cached) return cached;

  if (opts.skipNetwork) return null;

  for (const q of variants) {
    const hit = await nominatimSearch(q, opts);
    if (hit) {
      await writeCache([inputKey], hit.lat, hit.lng);
      return { ...hit, source: 'nominatim' };
    }
  }

  return null;
}

/**
 * Driving distance in meters via OSRM, or null.
 * @param {{ lat: number, lng: number }} from
 * @param {{ lat: number, lng: number }} to
 * @param {{ fetchFn?: typeof fetch }} [opts]
 */
export async function routeDistanceMeters(from, to, opts = {}) {
  if (!from || !to) return null;
  const fetchFn = opts.fetchFn || globalThis.fetch;
  const path = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${config.osrmUrl}/route/v1/driving/${path}?overview=false`;
  try {
    const res = await fetchFn(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meters = data?.routes?.[0]?.distance;
    if (meters == null || !Number.isFinite(Number(meters))) return null;
    return Number(meters);
  } catch {
    return null;
  }
}

/**
 * Enrich a single job with coords, distanceMiles, pricePerMile.
 * @param {object} job
 * @param {{ fetchFn?: typeof fetch, skipNetwork?: boolean }} [opts]
 */
export async function enrichJobGeo(job, opts = {}) {
  const base = {
    from: job?.from ?? null,
    to: job?.to ?? null,
    price: job?.price == null ? null : Number(job.price),
    currency: job?.currency || 'GBP',
    ...emptyGeo(),
  };

  if (!base.from || !base.to) return base;

  const fromCoord = await geocodePlace(base.from, opts);
  const toCoord = await geocodePlace(base.to, opts);

  if (fromCoord) {
    base.fromLat = fromCoord.lat;
    base.fromLng = fromCoord.lng;
  }
  if (toCoord) {
    base.toLat = toCoord.lat;
    base.toLng = toCoord.lng;
  }

  if (!fromCoord || !toCoord) return base;

  const meters = await routeDistanceMeters(fromCoord, toCoord, opts);
  const miles = clampRouteMiles(metersToMiles(meters), fromCoord, toCoord);
  base.distanceMiles = miles;
  base.pricePerMile = computePricePerMile(base.price, miles);
  return base;
}

/**
 * @param {object[]} jobs
 * @param {{ fetchFn?: typeof fetch, skipNetwork?: boolean }} [opts]
 */
export async function enrichJobsGeo(jobs, opts = {}) {
  if (!Array.isArray(jobs) || !jobs.length) return [];
  const out = [];
  for (const job of jobs) {
    out.push(await enrichJobGeo(job, opts));
  }

  // Pair / multi-leg with a single total fare: £/mi over combined driving miles
  const pricedIdx = out.findIndex((j) => j.price != null && Number(j.price) > 0);
  if (pricedIdx >= 0 && out.length > 1) {
    const onlyOnePriced = out.filter((j) => j.price != null).length === 1;
    if (onlyOnePriced) {
      const totalMiles = out.reduce(
        (s, j) => s + (j.distanceMiles != null && Number.isFinite(j.distanceMiles) ? Number(j.distanceMiles) : 0),
        0,
      );
      if (totalMiles > 0) {
        out[pricedIdx] = {
          ...out[pricedIdx],
          pricePerMile: computePricePerMile(out[pricedIdx].price, totalMiles),
        };
      }
    }
  }

  return out;
}
