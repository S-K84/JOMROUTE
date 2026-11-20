const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers');

const KL = { lat: 3.139, lng: 101.687 };
const NEAR = { lat: 3.2, lng: 101.7 };
const OK = { status: 'OK', routes: [] };
const QUOTA = 'Kuota peta Google hari ini sudah habis. Cuba lagi esok.';

/** Maps.DirectionFinder olok-olok. behave(nomborPanggilan, nilaiAvoid) memulangkan jawapan atau melontar ralat. */
function setup(behave) {
  const st = { calls: 0, avoid: '' };
  const df = {};
  ['setOrigin', 'setDestination', 'setMode', 'setAlternatives', 'setRegion', 'setLanguage', 'setDepart', 'addWaypoint']
    .forEach(m => { df[m] = () => df; });
  df.setAvoid = a => { st.avoid = a; return df; };
  df.getDirections = () => { st.calls++; return behave(st.calls, st.avoid); };
  const Maps = { newDirectionFinder: () => df,
    DirectionFinder: { Mode: { WALKING: 'walking', DRIVING: 'driving' }, Avoid: { TOLLS: 'tolls', HIGHWAYS: 'highways' } } };
  const env = loadCode({ Maps });
  env.st = st;
  env.route = (o, d, opts) => {
    try { env.ctx.getRoute('g_t', o, d, opts || {}); return 'OK'; } catch (e) { return e.message; }
  };
  return env;
}

test('lokasi > 2,000 km dari destinasi: mesej jelas, Google tidak dipanggil, kuota tidak digunakan', () => {
  const env = setup(() => OK);
  const m = env.route({ lat: 51.505, lng: -3.577 }, KL);       // Bridgend, Wales → KL
  assert.match(m, /^Lokasi anda dikesan \d+ km dari destinasi\. Semak GPS atau matikan VPN\.$/);
  assert.strictEqual(env.st.calls, 0);
  assert.strictEqual(Object.keys(env.cache.store).length, 0);
});

test('Bangkok → Singapura (~1,430 km) masih dibenarkan', () => {
  assert.strictEqual(setup(() => OK).route({ lat: 13.756, lng: 100.502 }, { lat: 1.352, lng: 103.82 }), 'OK');
});

test('ZERO_RESULTS: "Tiada laluan ke destinasi ini." dan status dicatat dalam log', () => {
  const env = setup(() => ({ status: 'ZERO_RESULTS' }));
  assert.strictEqual(env.route(KL, NEAR, { avoidTolls: true }), 'Tiada laluan ke destinasi ini.');
  assert.ok(env.logs.some(l => /ZERO_RESULTS.*elak tolls/.test(l)), env.logs.join('\n'));
});

test('status OVER_QUERY_LIMIT: mesej kuota', () => {
  assert.strictEqual(setup(() => ({ status: 'OVER_QUERY_LIMIT' })).route(KL, NEAR), QUOTA);
});

test('pengecualian kuota semasa elak feri: mesej kuota tanpa cubaan kedua', () => {
  const env = setup(() => { throw new Error('Service invoked too many times for one day: route.'); });
  assert.strictEqual(env.route(KL, NEAR, { avoidFerries: true }), QUOTA);
  assert.strictEqual(env.st.calls, 1);
});

test('"ferries" ditolak oleh servis: cuba semula tanpa feri', () => {
  const env = setup((n, avoid) => { if (/ferries/.test(avoid)) throw new Error('Invalid argument: avoid'); return OK; });
  assert.strictEqual(env.route(KL, NEAR, { avoidFerries: true }), 'OK');
  assert.strictEqual(env.st.calls, 2);
});

test('status lain: "Laluan tidak dijumpai."', () => {
  assert.strictEqual(setup(() => ({ status: 'NOT_FOUND' })).route(KL, NEAR), 'Laluan tidak dijumpai.');
});

test('papan tanda "Nifai" dalam arahan Google dibetulkan kepada "Nilai" (teks banner & suara datang dari sini)', () => {
  const step = html => ({ html_instructions: html, distance: { text: '9.7 km', value: 9700 }, start_location: { lat: 3.2, lng: 101.7 }, maneuver: 'turn-left' });
  const env = setup(() => ({ status: 'OK', routes: [{ summary: 'E2', overview_polyline: { points: '_p~iF~ps|U' },
    legs: [{ distance: { text: '10 km', value: 10000, }, duration: { text: '9 min', value: 540 },
      steps: [step('Take exit <b>10</b> toward <b>Nifai</b>'), step('Ke <b>Nilai</b>')] }] }] }));
  const routes = env.ctx.getRoute('g_t', NEAR, { lat: 2.8, lng: 101.8 }, {});
  const st = routes[0].steps;
  assert.strictEqual(st[0].road, 'Nilai');
  assert.match(st[0].text, /toward Nilai$/);
  assert.strictEqual(st[1].road, 'Nilai');
});

test('had laluan seorang pengguna: 15 sejam dan 45 setiap 6 jam, supaya beberapa akaun tidak menghabiskan kuota Maps bersama (semakan keselamatan 19 Nov 2026)', () => {
  const env = setup(() => OK);
  const R = () => env.route(NEAR, KL);
  const ok = n => { for (let i = 0; i < n; i++) assert.strictEqual(R(), 'OK'); };
  ok(15);
  assert.match(R(), /Terlalu banyak/);                        // ke-16 dalam sejam ditolak
  env.clock.now += 3600 * 1000 + 1; ok(15);                   // tetingkap sejam baharu: 30
  env.clock.now += 3600 * 1000 + 1; ok(15);                   // 45 dalam kira-kira 2 jam
  env.clock.now += 3600 * 1000 + 1;
  assert.match(R(), /Terlalu banyak/);                        // ke-46 ditolak walaupun had sejam sudah baharu
});

/** Kod polyline Google (untuk menyediakan data ujian & menyemak hasil). */
function encPoly(pts) {
  let out = '', pl = 0, pg = 0;
  const e = v => { v = v < 0 ? ~(v << 1) : v << 1; let c = ''; while (v >= 0x20) { c += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return c + String.fromCharCode(v + 63); };
  pts.forEach(([la, ln]) => { const a = Math.round(la * 1e5), b = Math.round(ln * 1e5); out += e(a - pl) + e(b - pg); pl = a; pg = b; });
  return out;
}
function decPoly(str) {
  const out = []; let i = 0, la = 0, ln = 0;
  const n = () => { let r = 0, sh = 0, b; do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20); return r & 1 ? ~(r >> 1) : r >> 1; };
  while (i < str.length) { la += n(); ln += n(); out.push([la / 1e5, ln / 1e5]); }
  return out;
}

test('garis biru: server menghantar `detail` = cantuman polyline setiap langkah (bentuk jalan sebenar), bukan hanya overview yang diringkaskan (aduan 20 Nov 2026: garis lurus tersasar dari jalan)', () => {
  const A = [[3.2, 101.7], [3.201, 101.701], [3.202, 101.7005]];   // langkah 1
  const B = [[3.202, 101.7005], [3.203, 101.699], [3.204, 101.699]]; // langkah 2 (titik pertama = titik akhir langkah 1)
  const step = pts => ({ html_instructions: 'Terus', distance: { text: '1 km', value: 1000 }, start_location: { lat: 3.2, lng: 101.7 },
    polyline: { points: encPoly(pts) } });
  const env = setup(() => ({ status: 'OK', routes: [{ summary: 'X', overview_polyline: { points: 'OVERVIEW' },
    legs: [{ distance: { text: '2 km', value: 2000 }, duration: { text: '2 min', value: 120 }, steps: [step(A), step(B)] }] }] }));
  const r = env.ctx.getRoute('g_t', NEAR, { lat: 3.3, lng: 101.8 }, {})[0];
  assert.strictEqual(r.polyline, 'OVERVIEW');                       // kongsi laluan (had 20,000 aksara) kekal ringkas
  assert.deepStrictEqual(decPoly(r.detail), A.concat(B.slice(1))); // titik sambungan tidak berganda
});

test('garis biru: tanpa polyline langkah, `detail` tiada (klien jatuh balik kepada overview)', () => {
  const env = setup(() => ({ status: 'OK', routes: [{ summary: 'X', overview_polyline: { points: 'OVERVIEW' },
    legs: [{ distance: { text: '2 km', value: 2000 }, duration: { text: '2 min', value: 120 },
      steps: [{ html_instructions: 'Terus', distance: { text: '1 km', value: 1000 }, start_location: { lat: 3.2, lng: 101.7 } }] }] }] }));
  const r = env.ctx.getRoute('g_t', NEAR, { lat: 3.3, lng: 101.8 }, {})[0];
  assert.ok(!r.detail);
});

test('pemilik tidak dihadkan oleh had laluan peribadi (15/sejam, 45/6 jam) semasa menguji; pengguna lain masih dihadkan; had global G_maps kekal (20 Nov 2026: pemilik kena "Terlalu banyak permintaan")', () => {
  const env = setup(() => OK);
  env.session.email = env.session.owner;                         // pemilik
  for (let i = 0; i < 50; i++) assert.strictEqual(env.route(NEAR, KL), 'OK', 'panggilan ke-' + (i + 1));
  const other = setup(() => OK);                                  // pengguna biasa: tetap dihadkan
  for (let i = 0; i < 15; i++) assert.strictEqual(other.route(NEAR, KL), 'OK');
  assert.match(other.route(NEAR, KL), /Terlalu banyak/);
});
