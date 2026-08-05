import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  metersToMiles,
  computePricePerMile,
  geocodePlace,
  routeDistanceMeters,
  enrichJobGeo,
  buildGeocodeFallbacks,
  haversineMiles,
  clampRouteMiles,
  STATIC_COORDS,
} from './jobDistance.js';

describe('buildGeocodeFallbacks', () => {
  it('shortens long cruise-terminal style names', () => {
    const v = buildGeocodeFallbacks('Queen Elizabeth II Cruise Terminal, Southampton');
    assert.ok(v.includes('QUEEN ELIZABETH II CRUISE TERMINAL, SOUTHAMPTON'));
    assert.ok(v.includes('CRUISE TERMINAL SOUTHAMPTON'));
    assert.ok(!v.includes('SOUTHAMPTON') || v[0] !== 'SOUTHAMPTON');
    assert.ok(v.every((x) => x !== 'SOUTHAMPTON'));
  });

  it('adds UK postcode outcode fallback', () => {
    const v = buildGeocodeFallbacks('EC3N 1JY');
    assert.ok(v.includes('EC3N 1JY'));
    assert.ok(v.includes('EC3N LONDON'));
    assert.equal(v.includes('EC3N'), false);
  });

  it('qualifies bare London outcodes for Nominatim', () => {
    const v = buildGeocodeFallbacks('WC2');
    assert.ok(v.includes('WC2'));
    assert.ok(v.includes('WC2 LONDON'));
    assert.ok(v.indexOf('WC2 LONDON') < v.indexOf('WC2'));
  });

  it('does not fall back to bare London outcode from a full postcode', () => {
    const v = buildGeocodeFallbacks('E1 1HH');
    assert.ok(v.includes('E1 1HH'));
    assert.ok(v.includes('E1 LONDON'));
    assert.ok(!v.includes('E1') || v.includes('E1 1HH'));
    assert.equal(v.includes('E1'), false);
  });

  it('does not force London on non-London outcodes', () => {
    const v = buildGeocodeFallbacks('GU14');
    assert.ok(v.includes('GU14'));
    assert.ok(!v.includes('GU14 LONDON'));
  });
});

describe('metersToMiles', () => {
  it('converts and rounds to 1 decimal', () => {
    assert.equal(metersToMiles(1609.344), 1);
    assert.equal(metersToMiles(8046.72), 5);
    assert.equal(metersToMiles(20000), 12.4);
  });

  it('returns null for invalid', () => {
    assert.equal(metersToMiles(null), null);
    assert.equal(metersToMiles(-1), null);
    assert.equal(metersToMiles(NaN), null);
  });
});

describe('clampRouteMiles', () => {
  it('keeps efficient OSRM routes', () => {
    const from = STATIC_COORDS.LHR;
    const to = STATIC_COORDS.EUS;
    assert.equal(clampRouteMiles(18.1, from, to), 18.1);
  });

  it('caps long M25-style detours vs crow-flies', () => {
    const from = { lat: 51.6208699, lng: -0.28426 }; // HA8
    const to = STATIC_COORDS.LGW;
    const crow = haversineMiles(from, to);
    assert.ok(crow > 30 && crow < 35);
    const capped = clampRouteMiles(65.6, from, to);
    assert.ok(capped < 50);
    assert.ok(capped >= crow);
    assert.equal(capped, Math.round(crow * 1.45 * 10) / 10);
  });
});

describe('computePricePerMile', () => {
  it('rounds to 2 decimals', () => {
    assert.equal(computePricePerMile(75, 12.4), 6.05);
    assert.equal(computePricePerMile(80, 10), 8);
  });

  it('returns null when missing price or distance', () => {
    assert.equal(computePricePerMile(null, 10), null);
    assert.equal(computePricePerMile(75, null), null);
    assert.equal(computePricePerMile(75, 0), null);
  });
});

describe('geocodePlace static', () => {
  it('resolves airports without network', async () => {
    const r = await geocodePlace('LHR', { skipNetwork: true });
    assert.equal(r.source, 'static');
    assert.equal(r.lat, STATIC_COORDS.LHR.lat);
    assert.equal(r.lng, STATIC_COORDS.LHR.lng);
  });

  it('returns null for unknown with skipNetwork', async () => {
    const r = await geocodePlace('ZZ99 9ZZ', { skipNetwork: true });
    assert.equal(r, null);
  });
});

describe('routeDistanceMeters', () => {
  it('reads OSRM distance', async () => {
    const fetchFn = mock.fn(async () => ({
      ok: true,
      json: async () => ({ routes: [{ distance: 20000 }] }),
    }));
    const meters = await routeDistanceMeters(
      STATIC_COORDS.LHR,
      STATIC_COORDS.LGW,
      { fetchFn },
    );
    assert.equal(meters, 20000);
    assert.equal(fetchFn.mock.callCount(), 1);
  });

  it('returns null on HTTP failure', async () => {
    const fetchFn = mock.fn(async () => ({ ok: false }));
    const meters = await routeDistanceMeters(STATIC_COORDS.LHR, STATIC_COORDS.LGW, {
      fetchFn,
    });
    assert.equal(meters, null);
  });
});

describe('enrichJobGeo', () => {
  it('fills miles and £/mi for static airports via mocked OSRM', async () => {
    const fetchFn = mock.fn(async (url) => {
      const u = String(url);
      if (u.includes('/route/')) {
        return { ok: true, json: async () => ({ routes: [{ distance: 20000 }] }) };
      }
      return { ok: false };
    });
    const job = await enrichJobGeo(
      { from: 'LHR', to: 'LGW', price: 75, currency: 'GBP' },
      { fetchFn },
    );
    assert.equal(job.fromLat, STATIC_COORDS.LHR.lat);
    assert.equal(job.toLat, STATIC_COORDS.LGW.lat);
    assert.equal(job.distanceMiles, 12.4);
    assert.equal(job.pricePerMile, 6.05);
  });

  it('leaves distance null when route fails', async () => {
    const fetchFn = mock.fn(async () => ({ ok: false }));
    const job = await enrichJobGeo(
      { from: 'LHR', to: 'LGW', price: 75, currency: 'GBP' },
      { fetchFn },
    );
    assert.equal(job.fromLat, STATIC_COORDS.LHR.lat);
    assert.equal(job.distanceMiles, null);
    assert.equal(job.pricePerMile, null);
  });

  it('skips when from/to missing', async () => {
    const job = await enrichJobGeo({ from: 'LHR', to: null, price: 50 });
    assert.equal(job.distanceMiles, null);
    assert.equal(job.fromLat, null);
  });
});
