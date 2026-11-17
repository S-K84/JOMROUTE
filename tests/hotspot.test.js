const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers');

/** Zon kerap ada polis/kamera: sejarah laporan oleh BERBEZA pengguna di tempat yang sama. */
const P = { lat: 3.139, lng: 101.687 };
const rep = (env, id, type, dLat) => { env.clock.now += 31000; return env.ctx.submitReports(id, { lat: P.lat + (dLat || 0), lng: P.lng, name: id, items: [{ type }] }); };
const J = v => JSON.parse(JSON.stringify(v));

test('zon: dilaporkan oleh 3 pengguna berbeza dalam 250 m → diamaran; 2 pengguna atau 1 pengguna berulang → belum', () => {
  const env = loadCode(), { ctx } = env;
  rep(env, 'g_A', 'POLIS'); rep(env, 'g_B', 'POLIS', 0.0005);
  rep(env, 'g_A', 'POLIS'); rep(env, 'g_A', 'POLIS', 0.0003);          // pengguna sama berulang tidak menambah
  assert.deepStrictEqual(J(ctx.getHotspots('g_X')), []);
  rep(env, 'g_C', 'POLIS', 0.001);
  ctx.CacheService.getScriptCache().remove('hot');
  const list = J(ctx.getHotspots('a_0123456789abcdef0123'));          // tetamu boleh membaca
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0][2], 'P');
  assert.ok(Math.abs(list[0][0] - P.lat) < 0.01 && Math.abs(list[0][1] - P.lng) < 0.01);
  assert.strictEqual(list[0].length, 3);                             // ID pelapor tidak dihantar kepada klien
});

test('zon: jenis berasingan (POLIS / KAMERA) dan tempat jauh (> 250 m) berasingan', () => {
  const env = loadCode(), { ctx } = env;
  ['g_A', 'g_B', 'g_C'].forEach(u => rep(env, u, 'KAMERA'));
  ['g_A', 'g_B'].forEach(u => rep(env, u, 'POLIS'));
  ['g_D', 'g_E', 'g_F'].forEach(u => rep(env, u, 'SESAK'));          // jenis lain tidak direkodkan
  ['g_A', 'g_B', 'g_C'].forEach(u => rep(env, u, 'POLIS', 0.02));    // ~2 km jauh
  ctx.CacheService.getScriptCache().remove('hot');
  const list = J(ctx.getHotspots('g_X')).map(x => x[2]).sort();
  assert.deepStrictEqual(list, ['K', 'P']);                           // KAMERA (3), POLIS di tempat jauh (3); POLIS asal hanya 2
  assert.strictEqual(env.sheet('SHEET_HOT').getLastRow(), 4);         // tajuk + KAMERA + POLIS (2 pengguna, belum layak) + POLIS jauh
});

test('zon: cleanup membuang zon > 180 hari; getHotspots mengabaikan zon > 120 hari', () => {
  const env = loadCode(), { ctx } = env;
  ['g_A', 'g_B', 'g_C'].forEach(u => rep(env, u, 'POLIS'));
  env.clock.now += 121 * 864e5;
  ctx.CacheService.getScriptCache().remove('hot');
  assert.deepStrictEqual(J(ctx.getHotspots('g_X')), []);
  env.clock.now += 60 * 864e5;
  env.session.email = env.session.owner;
  ctx.cleanup({});
  assert.strictEqual(env.sheet('SHEET_HOT').getLastRow(), 1);
});

test('zon: kegagalan merekod zon tidak menggagalkan laporan', () => {
  const env = loadCode(), { ctx } = env;
  ctx.bumpHotspot_ = () => { throw new Error('rosak'); };
  assert.strictEqual(rep(env, 'g_A', 'POLIS').ok, true);
});
