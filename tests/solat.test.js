const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { clientScript } = require('./helpers');

// Rujukan: app iman (JAKIM, Malaysia, Port Dickson/Seremban), 21 Nov 2026, diambil di AEON Nilai (pemilik, tangkap skrin).
// Dahulu Subuh dikira 20° → 05:39 (lebih awal 8 minit daripada JAKIM 05:47): "masuk waktu Subuh" disebut sebelum waktu sebenar.
const JAKIM = { subuh: '05:47', zohor: '13:01', asar: '16:23', maghrib: '18:59', isyak: '20:12' };
const min = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const myTime = d => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(11, 16);

for (const f of ['Index.html', 'IndexUji.html']) {
  test(`${f}: waktu solat dalam 2 minit daripada jadual JAKIM (AEON Nilai, 21 Nov 2026), Subuh tidak lebih awal`, () => {
    const s = clientScript(f);
    const src = s.match(/function prayerTimes\([^)]*\) \{[\s\S]*?\n\}/)[0];
    const c = {}; vm.runInNewContext(src + ';this.f = prayerTimes;', c);
    const t = c.f(new Date(2026, 10, 21), 2.8157, 101.797);
    for (const k of Object.keys(JAKIM)) {
      const d = min(myTime(t[k])) - min(JAKIM[k]);
      assert.ok(Math.abs(d) <= 2, `${f} ${k}: app ${myTime(t[k])} vs JAKIM ${JAKIM[k]} (beza ${d} minit)`);
    }
    assert.ok(min(myTime(t.subuh)) >= min(JAKIM.subuh) - 2, 'Subuh tidak boleh jauh lebih awal daripada JAKIM');
  });
}
