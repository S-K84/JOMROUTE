const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { clientScript } = require('./helpers');

// Rujukan RASMI: e-solat.gov.my (JAKIM) zon NGS03 (Seremban, Port Dickson), November 2026, diambil 21 Nov 2026.
// Susunan: [subuh, zohor, asar, maghrib, isyak]. Pengesahan bebas: app iman (21 Nov) sama dengan baris 21.
// Dahulu Subuh dikira 20° → 7-8 minit lebih awal daripada JAKIM setiap hari ("masuk waktu Subuh" disebut sebelum waktu sebenar).
const JAKIM = {
  1: ["05:46", "12:58", "16:18", "18:58", "20:09"],
  2: ["05:46", "12:58", "16:18", "18:58", "20:09"],
  3: ["05:46", "12:58", "16:18", "18:58", "20:09"],
  4: ["05:46", "12:58", "16:19", "18:58", "20:09"],
  5: ["05:45", "12:58", "16:19", "18:58", "20:09"],
  6: ["05:45", "12:58", "16:19", "18:58", "20:09"],
  7: ["05:45", "12:58", "16:19", "18:58", "20:09"],
  8: ["05:45", "12:58", "16:19", "18:58", "20:09"],
  9: ["05:46", "12:59", "16:20", "18:58", "20:10"],
  10: ["05:46", "12:59", "16:20", "18:58", "20:10"],
  11: ["05:46", "12:59", "16:20", "18:58", "20:10"],
  12: ["05:46", "12:59", "16:20", "18:58", "20:10"],
  13: ["05:46", "12:59", "16:21", "18:58", "20:10"],
  14: ["05:46", "12:59", "16:21", "18:58", "20:11"],
  15: ["05:46", "12:59", "16:21", "18:58", "20:11"],
  16: ["05:46", "12:59", "16:22", "18:58", "20:11"],
  17: ["05:46", "13:00", "16:22", "18:59", "20:11"],
  18: ["05:46", "13:00", "16:22", "18:59", "20:12"],
  19: ["05:46", "13:00", "16:22", "18:59", "20:12"],
  20: ["05:47", "13:00", "16:23", "18:59", "20:12"],
  21: ["05:47", "13:01", "16:23", "18:59", "20:12"],
  22: ["05:47", "13:01", "16:23", "19:00", "20:13"],
  23: ["05:47", "13:01", "16:24", "19:00", "20:13"],
  24: ["05:47", "13:01", "16:24", "19:00", "20:13"],
  25: ["05:48", "13:02", "16:25", "19:00", "20:14"],
  26: ["05:48", "13:02", "16:25", "19:01", "20:14"],
  27: ["05:48", "13:02", "16:25", "19:01", "20:15"],
  28: ["05:48", "13:03", "16:26", "19:01", "20:15"],
  29: ["05:49", "13:03", "16:26", "19:01", "20:15"],
  30: ["05:49", "13:03", "16:27", "19:02", "20:16"]
};
const KEYS = ['subuh', 'zohor', 'asar', 'maghrib', 'isyak'];
const min = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const myTime = d => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(11, 16);

for (const f of ['Index.html', 'IndexUji.html']) {
  test(`${f}: waktu solat dalam 2 minit daripada jadual rasmi JAKIM (zon NGS03, AEON Nilai) untuk setiap hari November 2026`, () => {
    const src = clientScript(f).match(/function prayerTimes\([^)]*\) \{[\s\S]*?\n\}/)[0];
    const c = {}; vm.runInNewContext(src + ';this.f = prayerTimes;', c);
    const bad = [];
    for (const [d, row] of Object.entries(JAKIM)) {
      const t = c.f(new Date(2026, 10, Number(d)), 2.8157, 101.797);
      KEYS.forEach((k, i) => {
        const diff = min(myTime(t[k])) - min(row[i]);
        if (Math.abs(diff) > 2) bad.push(`${d} Nov ${k}: app ${myTime(t[k])} vs JAKIM ${row[i]} (${diff} minit)`);
      });
    }
    assert.deepStrictEqual(bad, [], f + ' ' + bad.slice(0, 5).join('; '));
  });
}
