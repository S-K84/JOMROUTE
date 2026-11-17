const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { clientScript } = require('./helpers');

const files = ['Index.html', 'IndexUji.html'];
const s = clientScript('IndexUji.html');
const fn = name => s.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0];
const ctx = {};
vm.runInNewContext('const LIMIT_STABLE_MS = 6000, LIMIT_GAP_MS = 60000, OVER_STABLE_MS = 8000, OVER_GAP_MS = 90000;' +
  fn('shouldSayLimit') + fn('shouldWarnSpeeding') + ';this.say = shouldSayLimit; this.warn = shouldWarnSpeeding;', ctx);

const T = 1e6;   // masa sebenar (Date.now) tidak pernah 0
test('suara had laju: tidak disebut bila berkelip; disebut bila kekal >= 6 s; hanya penurunan; selang >= 60 s', () => {
  const st = {};
  // had pertama: tidak disebut serta-merta, disebut selepas kekal 6 s
  st.limSince = T;
  assert.strictEqual(ctx.say(st, 90, T + 3000), false);
  assert.strictEqual(ctx.say(st, 90, T + 6000), true);
  // had berkelip 90 -> 70 -> 90 -> 70: limSince ditetapkan semula setiap kali berubah, tiada sebutan
  let t = T + 10000;
  for (const v of [70, 90, 70, 90, 70]) { st.limSince = t; assert.strictEqual(ctx.say(st, v, t + 3000), false, 'berkelip ' + v); t += 3500; }
  // had 70 kekal 6 s tetapi baru 60 s belum berlalu sejak sebutan lalu (t=6000): ditahan; selepas 60 s disebut
  st.limSince = T + 20000;
  assert.strictEqual(ctx.say(st, 70, T + 26500), false);   // 20.5 s sejak sebutan lalu
  assert.strictEqual(ctx.say(st, 70, T + 66100), true);    // > 60 s
  // kenaikan tidak disebut tetapi diingat; penurunan seterusnya disebut (selepas selang)
  st.limSince = T + 70000;
  assert.strictEqual(ctx.say(st, 90, T + 77000), false);
  assert.strictEqual(st.saidLimit, 90);
  st.limSince = T + 130000;
  assert.strictEqual(ctx.say(st, 60, T + 137000), true);
});

test('suara melebihi had laju: tidak serta-merta; selepas melebihi >= 8 s; ulang paling kerap 90 s; reset bila tidak melebihi', () => {
  const st = {};
  assert.strictEqual(ctx.warn(st, true, T), false);
  assert.strictEqual(ctx.warn(st, true, T + 7000), false);
  assert.strictEqual(ctx.warn(st, true, T + 8000), true);
  for (let t = T + 9000; t < T + 98000; t += 10000) assert.strictEqual(ctx.warn(st, true, t), false, 't=' + (t - T));   // lama: setiap 60 s
  assert.strictEqual(ctx.warn(st, true, T + 98000), true);
  // perlahan seketika (tidak melebihi) -> pemasa melebihi bermula semula
  assert.strictEqual(ctx.warn(st, false, T + 200000), false);
  assert.strictEqual(ctx.warn(st, true, T + 500000), false);   // baru melebihi
  assert.strictEqual(ctx.warn(st, true, T + 508000), true);
});

test('amaran suara had laju guna margin 3 km/j untuk had automatik dan fungsi pengawal (kedua-dua fail)', () => {
  for (const f of files) {
  const s = clientScript(f);
  assert.match(s, /S\.speedLimit === -1 \? 3 : 2/);
  assert.match(s, /shouldWarnSpeeding\(state, overVoice, Date\.now\(\)\)/);
  assert.match(s, /shouldSayLimit\(state, state\.shownLimit, Date\.now\(\)\)/);
  assert.ok(!/> 60000\) \{ state\.speedWarnAt/.test(s), 'amaran 60 s lama masih ada: ' + f);
  assert.match(s, /OVER_GAP_MS = 90000/);
  }
});

test('amaran kamera: kamera berdekatan (< 300 m) disebut sekali sahaja sebagai satu kumpulan', () => {
  const c2 = {};
  vm.runInNewContext('const CAM_GROUP_M = 300;' + fn('nextCamera') + ';this.next = nextCamera;', c2);
  const cams = [{ id: 1, a: 1000 }, { id: 2, a: 1150 }, { id: 3, a: 1290 }, { id: 4, a: 2000 }];
  const al = new Set();
  assert.strictEqual(c2.next(cams, 500, 600, al).id, 1);
  assert.strictEqual(c2.next(cams, 900, 600, al), null);          // 2 & 3 sudah dalam kumpulan
  assert.strictEqual(c2.next(cams, 1500, 600, al).id, 4);         // kamera jauh disebut sendiri
  assert.strictEqual(c2.next(cams, 1900, 600, al), null);
});

test('ago: minit, jam (< 48 jam), kemudian hari', () => {
  const c3 = {};
  vm.runInNewContext(fn('ago') + ';this.ago = ago;', c3);
  const H = 3600e3, now = Date.now();
  assert.strictEqual(c3.ago(now - 5 * 60e3), '5 min lalu');
  assert.strictEqual(c3.ago(now - 5 * H), '5 jam lalu');
  assert.strictEqual(c3.ago(now - 324 * H), '14 hari lalu');
});

test('kamera: laporan pengguna "Kamera AES" dalam 300 m dari kamera OSM yang sudah diamaran tidak diamaran dua kali (dan sebaliknya)', () => {
  const s2 = clientScript('IndexUji.html');
  const f = name => s2.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0];
  const c = { state: {}, CAM_GROUP_M: 300 };
  vm.runInNewContext('const CAM_GROUP_M = 300; const state = this.state;' + f('dist') + f('nearAlertedCam') + f('noteCamAlert') +
    ';this.near = nearAlertedCam; this.note = noteCamAlert;', c);
  const cam = { lat: 3.1, lng: 101.7 };
  assert.strictEqual(c.near(cam), false);                         // belum ada amaran
  c.note(cam);
  assert.strictEqual(c.near({ lat: 3.1005, lng: 101.7 }), true);   // ~55 m: tempat sama
  assert.strictEqual(c.near({ lat: 3.105, lng: 101.7 }), false);   // ~555 m: kamera lain
  c.note({});                                                      // tiada koordinat: diabaikan
  assert.strictEqual(c.state.camAlerts.length, 1);
  for (let i = 0; i < 60; i++) c.note({ lat: 4 + i, lng: 101 });
  assert.strictEqual(c.state.camAlerts.length, 50);                // had 50
});

test('kamera: checkHazards & checkCameras guna nearAlertedCam / noteCamAlert; routeCameras membawa koordinat', () => {
  const s2 = clientScript('IndexUji.html');
  assert.match(s2, /if \(r\.type === 'KAMERA'\) \{ if \(nearAlertedCam\(r\)\) return; noteCamAlert\(r\); \}/);
  assert.match(s2, /cam\.lat != null && nearAlertedCam\(cam\)/);
  assert.match(s2, /id: 'cam-' \+ el\.id, lat: el\.lat, lng: el\.lon/);
});

test('kamera: checkCameras merekod kamera yang diamaran untuk soalan "masih ada?", dan checkCamGone dipanggil bersama', () => {
  const s2 = clientScript('IndexUji.html');
  assert.match(s2, /\(state\.camPass = state\.camPass \|\| \[\]\)\.push\(\{ id: cam\.id, a: cam\.a, lat: cam\.lat, lng: cam\.lng, navId: state\.navId \}\)/);
  assert.match(s2, /checkCameras\(along\); checkCamGone\(along\);/);
});

test('kamera diterima pemilik (state.camOk) digabung dengan titik.json untuk kamera di atas laluan', () => {
  const s2 = clientScript('IndexUji.html');
  const f = name => s2.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0];
  const c = { state: { camOk: [[3.2, 101.7, -1000001], [9, 9, -1000002]] } };
  vm.runInNewContext('const state = this.state;' + f('titikElements') + ';this.f = titikElements;', c);
  const out = c.f({ c: [[3.1, 101.7, 11]], s: [] }, ['3,101,3.5,102']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(out.map(e => e.id))), [11, -1000001]);   // kamera di luar kotak dibuang
  assert.ok(out.every(e => e.tags.highway === 'speed_camera'));
  assert.deepStrictEqual(c.f({ c: [], s: [] }, ['3,101,3.5,102']).length, 1);
});

test('kamera diterima: loadAcceptedCams dipanggil sebaik token ada dan hanya menerima id negatif', () => {
  const s2 = clientScript('IndexUji.html');
  assert.match(s2, /token = s\.token; store\.set\('jk_token', token\);\n  loadAcceptedCams\(\);/);
  assert.match(s2, /call\('getAcceptedCameras', token\)/);
  assert.match(s2, /p\[2\] < 0\)\.slice\(0, 300\)/);
});

test('laporan suara: kata kunci BM & English → jenis laporan (maks 3; tidak dikenali → kosong)', () => {
  const s2 = clientScript('IndexUji.html');
  const m = s2.match(/const VOICE_REPORT_KEYS = \[[\s\S]*?\];\n\/\*\* Teks yang disebut[\s\S]*?\n\}/)[0];
  const c = { TYPES: { KEMALANGAN: 1, KAMERA: 1, POLIS: 1, BANJIR: 1, LUBANG: 1, KERJA_JALAN: 1, KENDERAAN_ROSAK: 1, SESAK: 1, BAHAYA: 1 } };
  vm.runInNewContext(m + ';this.f = voiceReportTypes;', c);
  const t = x => JSON.parse(JSON.stringify(c.f(x)));
  assert.deepStrictEqual(t('ada polis di depan'), ['POLIS']);
  assert.deepStrictEqual(t('Kemalangan teruk'), ['KEMALANGAN']);
  assert.deepStrictEqual(t('ada sekatan polis dan kemalangan'), ['KEMALANGAN', 'POLIS']);
  assert.deepStrictEqual(t('traffic jam ahead'), ['SESAK']);
  assert.deepStrictEqual(t('speed camera'), ['KAMERA']);
  assert.deepStrictEqual(t('banjir kilat'), ['BANJIR']);
  assert.deepStrictEqual(t('pothole on the road'), ['LUBANG']);
  assert.deepStrictEqual(t('kereta rosak tepi jalan'), ['KENDERAAN_ROSAK']);
  assert.deepStrictEqual(t('kerja jalan lorong kiri'), ['KERJA_JALAN']);
  assert.deepStrictEqual(t('kemalangan polis banjir sesak bahaya'), ['KEMALANGAN', 'POLIS', 'BANJIR']);   // maks 3
  assert.deepStrictEqual(t('halo apa khabar'), []);
  assert.deepStrictEqual(t(''), []);
  assert.deepStrictEqual(t(null), []);
  assert.deepStrictEqual(t('jalan sempit'), []);                     // "jam" di dalam perkataan lain tidak dipadankan
});
