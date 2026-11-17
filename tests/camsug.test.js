const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers');

/** "Cadang kamera di sini": pengguna Google mencadang; pemilik menyemak di panel pentadbir. */
const P = { lat: 3.139, lng: 101.687 };

test('cadangan kamera disimpan dalam Sheet dan teks pengguna dilindungi daripada formula', () => {
  const env = loadCode(), { ctx } = env;
  const sh = env.sheet('SHEET_CAMSUG'), orig = sh.appendRow.bind(sh);
  let raw = null;
  sh.appendRow = row => { raw = row.slice(); orig(row); };   // helaian olok-olok membuang awalan ' seperti Sheets, jadi semak baris mentah
  const r = ctx.suggestCamera('g_A', { lat: P.lat, lng: P.lng, name: '=HYPERLINK("x")', note: '+cmd' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(raw[2], "'=HYPERLINK(\"x\")", 'nama tidak dilindungi');
  assert.strictEqual(raw[5], "'+cmd", 'catatan tidak dilindungi');
  const rows = env.sheet('SHEET_CAMSUG').getRange(2, 1, 1, 8).getValues();
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0][1], 'g_A');
});

test('tetamu (a_) tidak boleh mencadang; lokasi tidak sah ditolak', () => {
  const { ctx } = loadCode();
  assert.throws(() => ctx.suggestCamera('a_0123456789abcdef0123', { lat: P.lat, lng: P.lng }), /Log masuk akaun Google/);
  assert.throws(() => ctx.suggestCamera('g_A', { lat: 999, lng: 0 }), /Lokasi tidak sah/);
});

test('cadangan dalam 50 m digabung; pengguna sama tidak boleh mengulang; jauh = baris baharu', () => {
  const env = loadCode(), { ctx } = env;
  ctx.suggestCamera('g_A', { lat: P.lat, lng: P.lng });
  assert.throws(() => ctx.suggestCamera('g_A', { lat: P.lat + 0.0002, lng: P.lng }), /sudah mencadang/);
  assert.strictEqual(ctx.suggestCamera('g_B', { lat: P.lat + 0.0002, lng: P.lng }).merged, true);
  assert.strictEqual(ctx.suggestCamera('g_B', { lat: P.lat + 0.01, lng: P.lng }).merged, false);
  const rows = env.sheet('SHEET_CAMSUG').getRange(2, 1, 2, 8).getValues();
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(Number(rows[0][7]), 2);
});

test('had kadar: seorang maks 10 cadangan setiap 6 jam', () => {
  const { ctx } = loadCode();
  for (let i = 0; i < 10; i++) ctx.suggestCamera('g_A', { lat: P.lat + i * 0.01, lng: P.lng });
  assert.throws(() => ctx.suggestCamera('g_A', { lat: P.lat + 0.5, lng: P.lng }));
});

test('hanya pemilik melihat & membuang cadangan', () => {
  const env = loadCode(), { ctx, session } = env;
  ctx.suggestCamera('g_A', { lat: P.lat, lng: P.lng, name: 'Ali' });
  session.email = 'orang@example.com';
  assert.throws(() => ctx.adminOverview('g_X'), /Tidak dibenarkan/);
  assert.throws(() => ctx.adminResolveCamera('g_X', '0123abcd-0123'), /Tidak dibenarkan/);
  session.email = session.owner;
  const d = ctx.adminOverview('g_X');
  assert.strictEqual(d.camSug.length, 1);
  assert.strictEqual(d.camSug[0].name, 'Ali');
  assert.strictEqual(ctx.adminResolveCamera('g_X', d.camSug[0].id).ok, true);
  assert.strictEqual(ctx.adminOverview('g_X').camSug.length, 0);
  assert.throws(() => ctx.adminResolveCamera('g_X', d.camSug[0].id), /tidak dijumpai/);
});

test('cleanup membuang cadangan lama (> 90 hari)', () => {
  const env = loadCode(), { ctx, clock } = env;
  ctx.suggestCamera('g_A', { lat: P.lat, lng: P.lng });
  clock.now += 91 * 864e5;
  env.session.email = env.session.owner;
  ctx.cleanup({});
  assert.strictEqual(env.sheet('SHEET_CAMSUG').getLastRow(), 1);
});

test('had kadar cadangan: mesej khusus (bukan "Terlalu banyak permintaan" umum)', () => {
  const { ctx } = loadCode();
  for (let i = 0; i < 10; i++) ctx.suggestCamera('g_A', { lat: P.lat + i * 0.01, lng: P.lng });
  assert.throws(() => ctx.suggestCamera('g_A', { lat: P.lat + 0.5, lng: P.lng }), /Terlalu banyak cadangan kamera dihantar/);
});

test('laporan "kamera tiada": disimpan dengan Jenis tiada, digabung ikut id kamera, tidak bercampur dengan cadangan baharu', () => {
  const env = loadCode(), { ctx } = env;
  const G = { lat: P.lat, lng: P.lng, gone: true, camId: 'cam-123' };
  assert.strictEqual(ctx.suggestCamera('g_A', Object.assign({ name: 'Ali' }, G)).merged, false);
  assert.throws(() => ctx.suggestCamera('g_A', G), /sudah melaporkan kamera ini/);
  assert.strictEqual(ctx.suggestCamera('g_B', G).merged, true);                              // orang lain, kamera sama: kira
  assert.strictEqual(ctx.suggestCamera('g_B', Object.assign({}, G, { camId: 'cam--5' })).merged, false);   // id negatif (kamera pemilik)
  assert.strictEqual(ctx.suggestCamera('g_C', { lat: P.lat, lng: P.lng }).merged, false);    // cadangan baharu di tempat sama: baris berasingan
  env.session.email = env.session.owner;
  const d = ctx.adminOverview('g_X').camSug;
  assert.strictEqual(d.length, 3);
  const g = d.find(x => x.note === 'cam-123');
  assert.strictEqual(g.gone, true); assert.strictEqual(g.count, 2);
  assert.strictEqual(d.find(x => !x.gone).count, 1);
});

test('laporan "kamera tiada": id kamera tidak sah ditolak; tetamu ditolak', () => {
  const { ctx } = loadCode();
  for (const bad of ['', 'abc', 'cam-', 'cam-12a', '=cmd', 'cam-1234567890123']) assert.throws(() => ctx.suggestCamera('g_A', { lat: P.lat, lng: P.lng, gone: true, camId: bad }), /Kamera tidak sah/, bad);
  assert.throws(() => ctx.suggestCamera('a_0123456789abcdef0123', { lat: P.lat, lng: P.lng, gone: true, camId: 'cam-1' }), /Log masuk akaun Google/);
});
