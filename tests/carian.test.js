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

test('klien: petua pautan Google Maps juga bila hasil ada tetapi tiada yang mengandungi semua perkataan carian (saluran uji)', () => {
  const vm = require('node:vm'), { clientScript } = require('./helpers');
  const src = clientScript('IndexUji.html');
  const c = {};
  vm.runInNewContext(src.match(/function noFullMatch\([^)]*\) \{[\s\S]*?\n\}/)[0] + ';this.f = noFullMatch;', c);
  const R = (title, sub) => ({ title, sub: sub || '' });
  assert.strictEqual(c.f('agensi penguatkuasaan maritim negeri terengganu', [R('Agensi Penguatkuasaan Maritim', 'Kemaman, Terengganu')]), true);
  assert.strictEqual(c.f('klinik kesihatan beserah', [R('Klinik Kesihatan Beserah', 'Kuantan')]), false);
  assert.strictEqual(c.f('klinik kesihatan beserah', [R('Klinik Kesihatan Balok'), R('Klinik Kesihatan Beserah')]), false);
  assert.strictEqual(c.f('a b', [R('X')]), false);   // tiada perkataan >= 3 huruf → tiada petua
  assert.match(src, /rows \+ \(noFullMatch\(q, res\) \? MAPS_TIP : ''\)/);
});

test('klien: hasil carian disusun — sepadan penuh dahulu, tekaan jalan terakhir, dalam kumpulan ikut jarak (saluran uji)', () => {
  const vm = require('node:vm'), { clientScript } = require('./helpers');
  const src = clientScript('IndexUji.html');
  const c = {};
  vm.runInNewContext('const dist = (a, b) => Math.abs(a.lat - b.lat);' + src.match(/function rankPlaces\([^)]*\) \{[\s\S]*?\n\}/)[0] + ';this.f = rankPlaces;', c);
  const P = (title, lat, src, sub) => ({ title, sub: sub || '', lat, lng: 0, src: src || 'osm' });
  const me = { lat: 0, lng: 0 };
  const res = [P('Klinik Kesihatan Kuantan', 9), P('Klinik Kesihatan Balok', 4.2), P('Balok Kuantan', 4.3, 'alamat', 'Anggaran · Kampung Balok'), P('Klinik Kesihatan Sungai Ular', 17)];
  assert.deepStrictEqual(c.f('klinik kesihatan balok', res, me).map(p => p.title),
    ['Klinik Kesihatan Balok', 'Klinik Kesihatan Kuantan', 'Klinik Kesihatan Sungai Ular', 'Balok Kuantan']);
  assert.deepStrictEqual(c.f('klinik', res, null), res);     // tiada lokasi → susunan server
  assert.match(src, /rankPlaces\(q, await call\('searchPlaces'/);
});
