const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { ROOT } = require('./helpers');

/** Halaman "Privasi & data" menyebut tempoh simpanan: angka mesti sama dengan pemalar sebenar dalam Code.gs. */
const code = fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8');
const num = re => Number((code.match(re) || [])[1]);

for (const file of ['Index.html', 'IndexUji.html']) test(`${file}: teks privasi sepadan dengan pemalar server (kedudukan 3 min, 15 km, statistik 1 tahun, tetapan 180 hari, kamera 90 hari, zon 180 hari)`, () => {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const page = html.slice(html.indexOf('privacy: () => {'), html.indexOf('root: () => ({ title'));
  assert.ok(page.length > 500, 'halaman privasi tiada');
  assert.strictEqual(num(/USER_ACTIVE_SEC: (\d+)/), 180);                     // 3 minit
  assert.strictEqual(num(/NEARBY_USERS_KM: (\d+)/), 15);
  assert.strictEqual(num(/STATS_RETAIN_DAYS: (\d+)/), 365);                   // setahun
  assert.strictEqual(num(/PREFS_RETAIN_DAYS: (\d+)/), 180);
  assert.strictEqual(num(/CAM_SUGG_RETAIN_DAYS: (\d+)/), 90);
  assert.strictEqual(num(/HOT_RETAIN_DAYS = (\d+)/), 180);
  for (const frag of ['15 km', '3 minit', '3 minutes', 'setahun', 'a year', '180 hari', '180 days', '90 hari', '90 days', '~100 m']) assert.ok(page.includes(frag), frag);
  assert.match(code, /SHARE_MAX_MIN: 360/);                                   // perkongsian dipadam sehari selepas tamat (cleanup: 864e5)
  assert.match(code, /pruneSheet_\(sharesSheet_\(\), SHARE_HEADERS\.length, x => new Date\(x\[8\]\)\.getTime\(\) > now - 864e5\)/);
  assert.match(code, /USER_ACTIVE_SEC: 180/);
  assert.match(fs.readFileSync(path.join(ROOT, file), 'utf8'), /toFixed\(2\)/);   // Open-Meteo: titik kasar 2 perpuluhan
});
