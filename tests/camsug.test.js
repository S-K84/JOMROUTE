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

test('terima cadangan: masuk KameraDiterima, cadangan dibuang, cache dikemas kini, semua pengguna (termasuk tetamu) boleh membaca', () => {
  const env = loadCode(), { ctx } = env;
  assert.strictEqual(JSON.stringify(ctx.getAcceptedCameras('a_0123456789abcdef0123')), '[]');   // tetamu boleh membaca; cache kosong disimpan
  ctx.suggestCamera('g_A', { lat: P.lat, lng: P.lng, name: 'Ali', note: 'Depan sekolah' });
  env.session.email = env.session.owner;
  const id = ctx.adminOverview('g_X').camSug[0].id;
  assert.strictEqual(ctx.adminAcceptCamera('g_X', id).ok, true);
  assert.strictEqual(ctx.adminOverview('g_X').camSug.length, 0);
  const list = ctx.getAcceptedCameras('a_0123456789abcdef0123');                                 // cache lama dibuang
  assert.strictEqual(list.length, 1);
  assert.ok(Math.abs(list[0][0] - P.lat) < 1e-9 && Math.abs(list[0][1] - P.lng) < 1e-9);
  assert.match(String(list[0][2]), /^-\d{7,10}$/);                                              // id negatif besar: sepadan dengan /^cam--?\d{1,12}$/ di server
  assert.strictEqual(env.sheet('SHEET_CAMOK').getRange(2, 4, 1, 1).getValues()[0][0], 'Depan sekolah');
  assert.throws(() => ctx.adminAcceptCamera('g_X', id), /Cadangan tidak dijumpai/);               // sudah diterima
});

test('terima cadangan: hanya pemilik; laporan "tiada" tidak boleh diterima; had senarai', () => {
  const env = loadCode(), { ctx } = env;
  ctx.suggestCamera('g_A', { lat: P.lat, lng: P.lng });
  ctx.suggestCamera('g_B', { lat: P.lat + 0.1, lng: P.lng, gone: true, camId: 'cam-5' });
  assert.throws(() => ctx.adminAcceptCamera('g_X', '0123abcd-0123'), /Tidak dibenarkan/);
  env.session.email = env.session.owner;
  const d = ctx.adminOverview('g_X').camSug;
  assert.throws(() => ctx.adminAcceptCamera('g_X', d.find(x => x.gone).id), /Cadangan tidak dijumpai/);
  assert.throws(() => ctx.adminAcceptCamera('g_X', 'bukan-id!'), /Cadangan tidak dijumpai/);
  require('vm').runInContext('CONFIG.MAX_CAM_OK = 0', ctx);
  assert.throws(() => ctx.adminAcceptCamera('g_X', d.find(x => !x.gone).id), /Senarai kamera diterima penuh/);
});

const gone = (ctx, who, camId) => ctx.suggestCamera(who, { lat: P.lat, lng: P.lng, gone: true, camId });

test('buang kamera: laporan "tiada" bagi kamera OSM → id disembunyikan untuk semua pengguna, laporan dipadam', () => {
  const env = loadCode(), { ctx } = env;
  gone(ctx, 'g_A', 'cam-123');
  env.session.email = env.session.owner;
  const id = ctx.adminOverview('g_X').camSug[0].id;
  assert.deepStrictEqual(J2(ctx.getHiddenCameras('a_0123456789abcdef0123')), []);          // tetamu boleh membaca (cache kosong)
  assert.strictEqual(ctx.adminRemoveCamera('g_X', id).hidden, true);
  assert.deepStrictEqual(J2(ctx.getHiddenCameras('a_0123456789abcdef0123')), [123]);         // cache dibuang & dikemas kini
  assert.strictEqual(ctx.adminOverview('g_X').camSug.length, 0);
  assert.throws(() => ctx.adminRemoveCamera('g_X', id), /Cadangan tidak dijumpai/);
  gone(ctx, 'g_B', 'cam-123'); env.clock.now += 61000;
  const id2 = ctx.adminOverview('g_X').camSug[0].id;
  ctx.adminRemoveCamera('g_X', id2);                                                         // sudah disembunyikan: tiada baris pendua
  assert.strictEqual(env.sheet('SHEET_CAMHIDE').getLastRow(), 2);
});

test('buang kamera: kamera yang pernah diterima pemilik dibuang dari KameraDiterima (bukan disembunyikan)', () => {
  const env = loadCode(), { ctx } = env;
  ctx.suggestCamera('g_A', { lat: P.lat, lng: P.lng, name: 'Ali' });
  env.session.email = env.session.owner;
  ctx.adminAcceptCamera('g_X', ctx.adminOverview('g_X').camSug[0].id);
  const accepted = J2(ctx.getAcceptedCameras('g_X'));
  assert.strictEqual(accepted.length, 1);
  gone(ctx, 'g_B', 'cam-' + accepted[0][2]);
  const id = ctx.adminOverview('g_X').camSug[0].id;
  assert.strictEqual(ctx.adminRemoveCamera('g_X', id).hidden, false);
  assert.deepStrictEqual(J2(ctx.getAcceptedCameras('g_X')), []);
  assert.deepStrictEqual(J2(ctx.getHiddenCameras('g_X')), []);
});

test('buang kamera: hanya pemilik, hanya laporan "tiada", dan had senarai', () => {
  const env = loadCode(), { ctx } = env;
  ctx.suggestCamera('g_A', { lat: P.lat, lng: P.lng });          // cadangan baharu (bukan "tiada")
  gone(ctx, 'g_B', 'cam-9');
  assert.throws(() => ctx.adminRemoveCamera('g_X', '0123abcd-0123'), /Tidak dibenarkan/);
  env.session.email = env.session.owner;
  const d = ctx.adminOverview('g_X').camSug;
  assert.throws(() => ctx.adminRemoveCamera('g_X', d.find(x => !x.gone).id), /Cadangan tidak dijumpai/);
  require('vm').runInContext('CONFIG.MAX_CAM_HIDE = 0', ctx);
  assert.throws(() => ctx.adminRemoveCamera('g_X', d.find(x => x.gone).id), /Senarai kamera disembunyikan penuh/);
});
const J2 = v => JSON.parse(JSON.stringify(v));
