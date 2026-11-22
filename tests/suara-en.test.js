const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { clientScript } = require('./helpers');

function loadTr(file) {
  const s = clientScript(file);
  const start = s.indexOf('const EN = {'), end = s.indexOf('const I18N_ATTRS');
  const ctx = vm.createContext({});
  vm.runInContext(s.slice(start, end) + '\nuiLang = "en";', ctx);
  return msg => vm.runInContext('tr(' + JSON.stringify(msg) + ')', ctx);
}

// 22 Nov 2026: label oren "📷 Kamera laju · 700 m" kekal BM walaupun app English ("Kamera laju" tiada dalam kamus EN).
for (const f of ['Index.html', 'IndexUji.html']) {
  test(`${f}: label amaran kamera laju diterjemah ke English`, () => {
    const tr = loadTr(f);
    assert.strictEqual(tr('📷 Kamera laju · 700 m'), '📷 Speed camera · 700 m');
    assert.strictEqual(tr('📷 Kamera laju · 1.2 km'), '📷 Speed camera · 1.2 km');
  });
}

// 22 Nov 2026: suara English menyebut "Semenyih" sebagai "semenai". Ejaan fonetik hanya untuk suara English.
const s2 = clientScript('IndexUji.html');
const pron = voiceLang => { const c = { voiceLang }; vm.runInNewContext(
  s2.match(/const PRONOUNCE_EN = [\s\S]*?\];/)[0] + s2.match(/function pronounce\([^)]*\) \{[\s\S]*?\n\}/)[0] + ';this.f = pronounce;', c); return c.f; };
test('sebutan suara English: "Semenyih" dieja fonetik; suara Melayu tidak diubah; perkataan lain tidak disentuh', () => {
  assert.strictEqual(pron('en')('Turn left onto Jalan Banting - Semenyih/B18'), 'Turn left onto Jalan Banting - Semenyeh/B18');
  assert.strictEqual(pron('en')('semenyih'), 'Semenyeh');
  assert.strictEqual(pron('ms')('Belok kiri ke Jalan Banting - Semenyih'), 'Belok kiri ke Jalan Banting - Semenyih');
  assert.strictEqual(pron('en')('Turn right onto Jalan Nilai'), 'Turn right onto Jalan Nilai');
});
test('speak() menggunakan pronounce()', () => {
  assert.match(s2, /new SpeechSynthesisUtterance\(pronounce\(text\)\)/);
});
