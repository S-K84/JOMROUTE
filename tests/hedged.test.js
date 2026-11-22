const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { clientScript } = require('./helpers');

// 22 Nov 2026: kiraan semula laluan tersangkut > 10 s (laluan lama kekal) walaupun panggilan baharu selepas muat semula siap ~3 s.
// call() menunggu 60 s. hedged() menghantar permintaan kedua bila yang pertama belum menjawab dalam `delay` ms.
const s = clientScript('IndexUji.html');
const src = s.match(/function hedged\([^)]*\) \{[\s\S]*?\n\}/)[0];
const ctx = { setTimeout, clearTimeout }; vm.runInNewContext(src + ';this.hedged = hedged;', ctx);
const wait = ms => new Promise(r => setTimeout(r, ms));

test('hedged: jawapan pantas diterima, permintaan kedua tidak dihantar', async () => {
  let n = 0;
  const r = await ctx.hedged(async () => { n++; await wait(5); return 'A'; }, 60);
  assert.strictEqual(r, 'A'); await wait(90); assert.strictEqual(n, 1);
});
test('hedged: pertama tersangkut → kedua dihantar selepas delay dan jawapan kedua (lebih awal) diterima', async () => {
  let n = 0;
  const t0 = Date.now();
  const r = await ctx.hedged(() => { n++; return n === 1 ? wait(400).then(() => 'LAMBAT') : wait(10).then(() => 'CEPAT'); }, 40);
  assert.strictEqual(r, 'CEPAT'); assert.strictEqual(n, 2); assert.ok(Date.now() - t0 < 300);
});
test('hedged: ralat sebelum delay terus ditolak (cth. "Terlalu banyak permintaan"), tiada permintaan kedua', async () => {
  let n = 0;
  await assert.rejects(ctx.hedged(async () => { n++; throw new Error('Terlalu banyak permintaan.'); }, 50), /Terlalu banyak/);
  await wait(80); assert.strictEqual(n, 1);
});
test('hedged: kedua-dua gagal → ditolak; jika satu gagal dan satu berjaya → berjaya', async () => {
  await assert.rejects(ctx.hedged(() => wait(60).then(() => { throw new Error('X'); }), 20), /X/);
  let n = 0;
  const r = await ctx.hedged(() => { n++; return n === 1 ? wait(120).then(() => 'OK') : wait(5).then(() => { throw new Error('gagal kedua'); }); }, 20);
  assert.strictEqual(r, 'OK');
});
for (const f of ['Index.html', 'IndexUji.html']) test(`${f}: planRoute senyap (kiraan semula) menggunakan hedged`, () => {
  assert.match(clientScript(f), /silent \? await hedged\(ask, HEDGE_MS\) : await ask\(\)/);
});
