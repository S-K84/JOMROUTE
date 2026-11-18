const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers');

/** Carian tempat: Photon (OSM) dahulu; Google Geocoder juga bila tiada hasil yang meliputi semua perkataan carian. */
const KLINIK = ['Balok', 'Kuantan', 'Sungai Ular', 'Paya Besar'].map(n => ({
  properties: { name: 'Klinik Kesihatan ' + n, city: 'Kuantan' }, geometry: { coordinates: [103.3, 3.8] } }));
const fx = (features, googleName, calls) => ({
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ features }) }) },
  Maps: { newGeocoder: () => { const g = { setRegion: () => g, setLanguage: () => g, setBounds: () => g,
    geocode: () => { calls.n++; return { results: googleName ? [{ formatted_address: googleName + ', 26100 Beserah, Pahang',
      geometry: { location: { lat: 3.86, lng: 103.37 }, location_type: 'APPROXIMATE' } }] : [] }; } }; return g; } }
});

test('Photon beri 4 klinik lain tanpa "beserah" → Google ditanya dan jawapannya diletak dahulu', () => {
  const calls = { n: 0 }, { ctx } = loadCode(fx(KLINIK, 'Klinik Kesihatan Beserah', calls));
  const r = ctx.searchPlaces('g_A', 'klinik kesihatan beserah kuantan', 3.86, 103.37);
  assert.strictEqual(calls.n, 1);
  assert.strictEqual(r[0].title, 'Klinik Kesihatan Beserah');
  assert.ok(r.length >= 5);
});

test('Photon sudah ada hasil yang meliputi semua perkataan → Google tidak ditanya (jimat kuota)', () => {
  const calls = { n: 0 }, f = KLINIK.concat([{ properties: { name: 'Klinik Kesihatan Beserah', city: 'Kuantan' }, geometry: { coordinates: [103.37, 3.86] } }]);
  const { ctx } = loadCode(fx(f, 'Lain', calls));
  const r = ctx.searchPlaces('g_A', 'klinik kesihatan beserah kuantan', 3.86, 103.37);
  assert.strictEqual(calls.n, 0);
  assert.ok(r.some(p => p.title === 'Klinik Kesihatan Beserah'));
});
