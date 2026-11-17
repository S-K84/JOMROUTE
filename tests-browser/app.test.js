// Ujian pelayar (Chromium) — dijalankan oleh CI pada setiap PR: npm run test:browser
// Nota: lulus di Chromium TIDAK menjamin Safari iPhone (lihat CLAUDE.md) — saluran uji masih perlu.
const test = require('node:test');
const assert = require('node:assert');
const { open } = require('./harness');

const FILES = ['Index.html', 'IndexUji.html'];
const wait = (page, ms) => page.waitForTimeout(ms);

/** Tetapkan lokasi, rancang laluan & mula navigasi. */
async function startNav(page) {
  await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    state.manualLoc = false;
    setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
    planRoute({ title: 'Ujian', lat: 3.2, lng: 101.7 }); await w(300);
    startNav(); await w(100);
  });
}
/** Memandu ke utara: n bacaan GPS, satu sesaat (masa olok-olok). */
async function drive(page, n, speed) {
  await page.evaluate(async ([n, speed]) => {
    let t = Date.now();
    for (let i = 0; i < n; i++) {
      t += 1000;
      setMe({ lat: state.me.lat + 0.0003, lng: 101.7, heading: 0, speed, t, acc: 5 });
      await new Promise(r => setTimeout(r, 5));
    }
  }, [n, speed]);
}

for (const file of FILES) {
  test(`${file}: bermula tanpa ralat, dalam BM & English`, async () => {
    const { page, errors, close } = await open(file);
    try {
      assert.strictEqual(await page.evaluate(() => !!document.getElementById('fatal')), false);
      await page.evaluate(() => setVoiceLang('en'));
      await wait(page, 100);
      assert.match(await page.textContent('#home'), /Where to\?/);
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });

  test(`${file}: setiap halaman tetapan & pilihan dibuka tanpa ralat (BM & English)`, async () => {
    const { page, errors, close } = await open(file);
    try {
      const bad = await page.evaluate(async () => {
        const out = [];
        for (const lang of ['ms', 'en']) {
          setVoiceLang(lang);
          const ids = Object.keys(PAGES).concat(Object.keys(CHOICES).map(k => 'choice:' + k));
          for (const id of ids) {
            try { openSet(id); if (!$('setTitle').textContent.trim()) out.push(lang + ':' + id + ' tiada tajuk'); }
            catch (e) { out.push(lang + ':' + id + ' ' + e.message); }
          }
          closeSettings();
          openDrawer(); closeDrawer();
        }
        return out;
      });
      assert.deepStrictEqual(bad, []);
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });

  test(`${file}: navigasi — laluan pada Canvas, banner & panel dikemas kini`, async () => {
    const { page, errors, close } = await open(file);
    try {
      await startNav(page);
      await drive(page, 20, 60);
      const r = await page.evaluate(() => ({
        nav: state.navigating, canvas: state.routeLayers[0].options.renderer === lineRenderer,
        banner: $('navTop').textContent, left: $('navLeft').textContent
      }));
      assert.ok(r.nav && r.canvas);
      assert.match(r.banner, /Jalan Dua/);
      assert.match(r.left, /min/);
      await page.evaluate(() => cancelRoute());
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });

  if (file === 'IndexUji.html') test(`${file}: laluan dipilih ada garisan putih di bawah (jelas di atas jalan merah peta)`, async () => {
    const { page, errors, close } = await open(file);
    try {
      await startNav(page);
      const r = await page.evaluate(() => state.routeLayers.map(l => [l.options.color, l.options.weight]));
      assert.ok(r.some(([c, w]) => c === '#fff' && w > 8), JSON.stringify(r));
      await page.evaluate(() => cancelRoute());
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });

  test(`${file}: lapor pantas → dihantar, kemudian Batal memadam`, async () => {
    const { page, errors, close } = await open(file);
    try {
      await page.evaluate(async () => {
        setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() });
        openReport(); await new Promise(r => setTimeout(r, 30));
        document.querySelector('[data-quick="POLIS"]').click();
      });
      await page.waitForFunction(() => $('askCard').style.display === 'block');
      await page.click('#askYes');
      await page.waitForFunction(() => __calls.includes('deleteMyReport'));
      assert.ok(await page.evaluate(() => __calls.includes('submitReports')));
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });

  test(`${file}: cari sepanjang laluan (server gagal → Overpass dari telefon)`, async () => {
    const { page, errors, close } = await open(file);
    try {
      await startNav(page);
      const text = await page.evaluate(async () => {
        window.__override = { alongRoute: () => { throw new Error('Carian sepanjang laluan tidak tersedia sekarang. Cuba lagi sebentar.'); } };
        window.fetch = url => (/overpass/.test(url)
          ? Promise.resolve({ ok: true, status: 200, json: async () => ({ elements: [{ lat: 3.15, lon: 101.7001, tags: { name: 'Petronas Ujian' } }] }) })
          : /github\.io/.test(url) ? Promise.resolve({ ok: false, status: 404 })      // fail statik belum ada → sandaran
          : new Promise(() => {}));
        searchAlong('fuel');
        for (let i = 0; i < 100 && !/Petronas/.test($('alongList').textContent); i++) await new Promise(r => setTimeout(r, 50));
        return $('alongList').textContent;
      });
      assert.match(text, /Petronas Ujian/);
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });

  test(`${file}: had laju automatik & kamera laju dari OpenStreetMap`, async () => {
    const { page, errors, close } = await open(file);
    try {
      await page.evaluate(() => {
        window.__said = []; window.speak = t => __said.push(t);
        const line = (a, b, n) => Array.from({ length: n }, (_, i) => ({ lat: a[0] + (b[0] - a[0]) * i / (n - 1), lon: a[1] + (b[1] - a[1]) * i / (n - 1) }));
        window.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ elements: [
          { type: 'way', tags: { highway: 'primary', maxspeed: '90' }, geometry: line([3.1, 101.7], [3.2, 101.7], 11) },
          { type: 'node', id: 7, lat: 3.13, lon: 101.7001, tags: { highway: 'speed_camera' } }] }) });
        S.speedLimit = -1;
        if (S.alertTypes.indexOf('KAMERA') < 0) S.alertTypes.push('KAMERA');
      });
      await startNav(page);
      await drive(page, 90, 100);              // kamera di 3.13 (~3.3 km); amaran ≤ 1 km sebelum
      const r = await page.evaluate(() => ({ sign: $('speedSign').textContent, over: $('speedo').classList.contains('over'), said: __said }));
      assert.strictEqual(r.sign, '90');
      assert.ok(r.over);
      assert.ok(r.said.some(x => /Kamera laju/.test(x)), r.said.join(' | '));
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });
}

for (const file of FILES) test(`${file}: anggaran kos minyak pada pilihan laluan & halaman Kongsi JomRoute`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(async () => {
      state.manualLoc = false;
      setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() });
      S.fuelL100 = 7; S.fuelPrice = 2;
      planRoute({ title: 'Ujian', lat: 3.2, lng: 101.7 });
      await new Promise(r => setTimeout(r, 300));
      const card = $('panel').textContent;
      openSet('invite');
      const img = document.querySelector('.qr-box img'), box = document.querySelector('.qr-box');
      const a = img.getBoundingClientRect(), b = box.getBoundingClientRect();
      return { card, qr: img.src || '', fits: a.right <= b.right + 0.5 && a.bottom <= b.bottom + 0.5 };
    });
    assert.match(r.card, /⛽ ~RM 1\.55/);          // 11.1 km × 7 L/100 km × RM 2
    assert.match(decodeURIComponent(r.qr), /create-qr-code.*data=https:\/\/s-k84\.github\.io\/JOMROUTE\/#pasang$/);   // pautan pendek dengan ikon
    assert.ok(r.fits, 'gambar QR terkeluar dari kotak putih');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const [file, row, url] of [['Index.html', 'ujiOn', /\?uji=1$/], ['IndexUji.html', 'ujiOff', /\/exec$/]]) {
  test(`${file}: pemilik boleh bertukar antara versi biasa & versi uji dari menu`, async () => {
    const { page, errors, close } = await open(file);
    try {
      const r = await page.evaluate(row => {
        state.isOwner = true; let opened = null; window.open = u => { opened = u; };
        openDrawer();
        const b = document.querySelector(`#drawerPane [data-do="${row}"]`);
        if (b) b.click();
        const notOwner = (() => { state.isOwner = false; renderDrawer(); return !!document.querySelector('[data-do^="uji"]'); })();
        return { found: !!b, opened, notOwner };
      }, row);
      assert.ok(r.found);
      assert.match(r.opened || '', url);
      assert.strictEqual(r.notOwner, false);          // pengguna biasa tidak nampak butang ini
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });
}

for (const file of FILES) test(`${file}: tekan lama pada peta → Pergi ke sini / Simpan sebagai Rumah (lokasi tepat)`, async () => {
  const { page, errors, close } = await open(file, { hasTouch: true });
  try {
    await page.evaluate(() => { setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); map.setView([3.1, 101.7], 16, { animate: false }); });
    const box = await page.locator('#map').boundingBox();
    const x = box.x + box.width / 2 + 40, y = box.y + 300;
    // tekan lama (≥ 550 ms tanpa bergerak)
    await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
    await page.waitForSelector('.leaflet-popup [data-lp="home"]');
    const expected = await page.evaluate(([x, y]) => { const ll = map.containerPointToLatLng(L.point(x - map.getContainer().getBoundingClientRect().left, y - map.getContainer().getBoundingClientRect().top)); return { lat: ll.lat, lng: ll.lng }; }, [x, y]);
    await page.click('.leaflet-popup [data-lp="home"]');
    const home = await page.evaluate(() => places().home);
    assert.ok(home && Math.abs(home.lat - expected.lat) < 1e-5 && Math.abs(home.lng - expected.lng) < 1e-5, JSON.stringify([home, expected]));
    // tekan sekejap (klik biasa) tidak membuka menu
    await page.mouse.click(x - 80, y + 40); await page.waitForTimeout(900);
    assert.strictEqual(await page.locator('.leaflet-popup [data-lp]').count(), 0);
    assert.strictEqual(await page.locator('.lp-pin').count(), 0);           // pin dibuang bila menu ditutup
    // tekan lama lagi → Pergi ke sini → laluan dirancang
    await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
    await page.click('.leaflet-popup [data-lp="go"]');
    await page.waitForFunction(() => state.dest && state.routes.length > 0);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const file of FILES) test(`${file}: pulang ke Rumah → tawar "Beritahu keluarga" (WhatsApp dengan masa tiba)`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      let opened = ''; window.open = u => { opened = u; };
      S.prayerRemind = false;      // jangan biar kad waktu solat (bergantung pada jam CI) muncul dahulu
      const p = places(); p.home = { title: 'Rumah', lat: 3.2, lng: 101.7 }; savePlaces(p);
      state.manualLoc = false; setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
      planRoute({ title: 'Rumah', lat: 3.2, lng: 101.7 }); await w(300); startNav(); await w(100);
      const card = $('askText').textContent; $('askYes').click();
      return { card, opened: decodeURIComponent(opened) };
    });
    assert.strictEqual(r.card, 'Beritahu keluarga?');
    assert.match(r.opened, /wa\.me.*perjalanan pulang, anggaran tiba/);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const file of FILES) test(`${file}: laluan dengan kemalangan dilaporkan — laluan lain disyorkan ("Elak sesak") & amaran ditunjuk`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const enc = v => { v = Math.round(v * 1e5); v = v < 0 ? ~(v << 1) : v << 1; let o = ''; while (v >= 0x20) { o += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return o + String.fromCharCode(v + 63); };
      const poly = pts => { let s = '', a = 0, b = 0; pts.forEach(([la, lg]) => { s += enc(la - a) + enc(lg - b); a = la; b = lg; }); return s; };
      const main = JSON.parse(JSON.stringify(__route));
      const alt = Object.assign({}, main, { summary: 'Jalan Lencong', durationSec: 700,
        polyline: poly([[3.1, 101.7], [3.1, 101.72], [3.2, 101.72], [3.2, 101.7]]) });
      window.__override = { getRoute: () => [JSON.parse(JSON.stringify(main)), alt] };
      window.__reports = [{ id: 'acc-1', type: 'KEMALANGAN', lat: 3.15, lng: 101.7001, desc: '', name: 'X', up: 1, down: 0, heading: null }];
      state.manualLoc = false; setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
      await refresh();
      planRoute({ title: 'Ujian', lat: 3.2, lng: 101.7 }); await w(300);
      return { sel: state.selRoute, cards: [...document.querySelectorAll('.route-card')].map(c => c.innerText.replace(/\s+/g, ' ')) };
    });
    assert.strictEqual(r.sel, 1, JSON.stringify(r));
    assert.match(r.cards[0], /⚠️ 1 kemalangan/);
    assert.match(r.cards[1], /Elak sesak/);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const file of FILES) test(`${file}: 👍 baharu pada laporan anda → ucapan terima kasih sekali`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      store.set('jk_upseen', '2');
      window.__override = { getProfile: () => ({ points: 30, reports: 2, upReceived: 5, joined: Date.now() }) };
      await loadProfile(); await w(50);
      const first = $('toast').textContent;
      $('toast').textContent = '';
      await loadProfile(); await w(50);
      return { first, second: $('toast').textContent, seen: store.get('jk_upseen') };
    });
    assert.match(r.first, /3 pemandu berterima kasih atas laporan anda \(\+15 mata\)/);
    assert.ok(!/berterima kasih/.test(r.second));
    assert.strictEqual(r.seen, '5');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const file of FILES) test(`${file}: halaman "Tambah ke skrin utama" ada butang ke halaman ikon (GitHub Pages)`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(() => {
      openSet('homescreen');
      const a = document.getElementById('hsInstall');
      return { href: a ? a.href : '', target: a ? a.target : '', text: document.body.innerText };
    });
    assert.strictEqual(r.href, 'https://s-k84.github.io/JOMROUTE/#pasang');
    assert.strictEqual(r.target, '_top');
    assert.match(r.text, /guna Chrome/);
    assert.doesNotMatch(r.text, /iPhone · Safari/);
    // Langkah "Kongsi → Tambah ke Skrin Utama" tidak dipapar dalam aplikasi: jika diikut di sini, ikon jadi huruf "J"
    assert.doesNotMatch(r.text, /Pilih Tambah ke Skrin Utama/);
    assert.match(r.text, /Tekan butang biru dahulu/);
    assert.match(r.text, /ikon jadi huruf “J”/);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const file of FILES) test(`${file}: pulang ke Rumah dalam waktu solat → kad "Beritahu keluarga" dahulu, kemudian kad solat`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      window.open = () => {};
      S.prayerRemind = true;
      const p = places(); p.home = { title: 'Rumah', lat: 3.2, lng: 101.7 }; savePlaces(p);
      state.manualLoc = false; setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
      // Waktu Asar SEKARANG (seperti pemilik: 16:03), bukan bergantung pada jam CI.
      const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
      const now = new Date(), t = {}; PRAYERS.forEach(([k]) => { t[k] = new Date(now.getTime() + 864e5); }); t.asar = now;
      state.prayerCache = { day, lat: 3.1, lng: 101.7, t }; state.prayerSaid = new Set();
      planRoute({ title: 'Rumah', lat: 3.2, lng: 101.7 }); await w(300); startNav(); await w(100);
      const first = $('askText').textContent; $('askNo').click();
      onNavTick(); await w(50);
      return { first, second: $('askText').textContent, shown: $('askCard').style.display };
    });
    assert.strictEqual(r.first, 'Beritahu keluarga?');
    assert.strictEqual(r.second, 'Waktu Asar');
    assert.strictEqual(r.shown, 'block');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const file of FILES) test(`${file}: kad lain sedang dipapar semasa mula ke Rumah → "Beritahu keluarga" menunggu giliran`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      S.prayerRemind = false;
      const p = places(); p.home = { title: 'Rumah', lat: 3.2, lng: 101.7 }; savePlaces(p);
      state.manualLoc = false; setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
      planRoute({ title: 'Rumah', lat: 3.2, lng: 101.7 }); await w(300);
      showAsk({ icon: 'ℹ️', text: 'Kad lain', yes: 'Ya', no: 'Tidak', ms: 60000 });
      startNav(); await w(100);
      const during = $('askText').textContent; $('askNo').click();
      onNavTick(); await w(50);
      return { during, after: $('askText').textContent };
    });
    assert.strictEqual(r.during, 'Kad lain');
    assert.strictEqual(r.after, 'Beritahu keluarga?');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const file of FILES) test(`${file}: cadangan perjalanan — petang hari kerja "Pulang ke rumah?" → terus navigasi; sekali sehari; tiada pada hujung minggu`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const realNow = Date.now;
      const at = iso => { const t = Date.parse(iso); Date.now = () => t; };
      try {
        const p = places(); p.home = { title: 'Rumah', lat: 3.2, lng: 101.7 }; p.work = { title: 'Kerja', lat: 3.0, lng: 101.6 }; savePlaces(p);
        S.prayerRemind = false; S.tripSuggest = true; state.manualLoc = false;
        const kinds = ['2026-11-05T09:30:00Z', '2026-11-05T00:30:00Z', '2026-11-05T05:00:00Z', '2026-11-07T09:30:00Z']
          .map(t => tripSuggestion(Date.parse(t)));                         // Khamis 17:30, Khamis 08:30, Khamis 13:00, Sabtu 17:30
        at('2026-11-07T09:30:00Z'); setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
        const weekend = $('askCard').style.display;
        at('2026-11-05T09:30:00Z'); setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
        const text = $('askText').textContent;
        Date.now = realNow;
        $('askYes').click(); await w(400);
        const nav = { navigating: state.navigating, dest: state.dest && state.dest.title };
        cancelRoute(); hideAsk(); await w(50);
        at('2026-11-05T10:00:00Z'); setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
        const again = $('askCard').style.display, mode = document.body.dataset.mode;
        store.del('jk_trip'); setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
        const nextDay = $('askText').textContent;                            // tanpa rekod "sudah ditanya" → ditanya lagi
        return { kinds, weekend, text, nav, again, mode, nextDay };
      } finally { Date.now = realNow; }
    });
    assert.deepStrictEqual(r.kinds, ['home', 'work', null, null]);
    assert.notStrictEqual(r.weekend, 'block');
    assert.strictEqual(r.text, 'Pulang ke rumah?');
    assert.deepStrictEqual(r.nav, { navigating: true, dest: 'Rumah' });
    assert.strictEqual(r.mode, 'idle');
    assert.notStrictEqual(r.again, 'block');                                // sekali sehari sahaja
    assert.strictEqual(r.nextDay, 'Pulang ke rumah?');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const file of FILES) test(`${file}: jubin peta disimpan dalam telefon — selepas muat semula, kawasan sama tidak dimuat turun lagi`, async () => {
  const { page, errors, tiles, close } = await open(file, null, { tiles: true });
  try {
    await page.waitForFunction(async () => (await (await caches.open('jk-tiles-v1')).keys()).length >= 4, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const first = new Set(tiles.requests);
    await page.reload();
    await page.waitForFunction(() => window.__appStarted === true, null, { timeout: 15000 });
    await page.waitForFunction(() => tileStat.hit >= 4, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const again = tiles.requests.slice(first.size).filter(u => first.has(u));
    const blobs = await page.evaluate(() => [...document.querySelectorAll('.leaflet-tile')].filter(i => i.src.startsWith('blob:')).length);
    assert.deepStrictEqual(again, [], 'jubin yang sudah disimpan dimuat turun semula');
    assert.ok(blobs >= 4, 'jubin tidak dipapar dari simpanan telefon');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});


for (const file of FILES) test(`${file}: peta malam tidak lagi guna CARTO (perlu kunci API) & jubin CARTO lama dibuang dari telefon`, async () => {
  const { page, errors, tiles, close } = await open(file, null, { tiles: true });
  try {
    await page.evaluate(async () => {
      const c = await caches.open('jk-tiles-v1');
      await c.put('https:\/\/a.basemaps.cartocdn.com/dark_all/15/1/1@2x.png', new Response('x', { headers: { 'Content-Type': 'image/png' } }));
    });
    await page.reload();
    await page.waitForFunction(() => window.__appStarted === true, null, { timeout: 15000 });
    await page.evaluate(() => { S.dark = 'always'; applyTheme(); map.setView([3.2, 101.7], 15); });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(async () => ({
      carto: (await (await caches.open('jk-tiles-v1')).keys()).filter(k => /cartocdn/.test(k.url)).length,
      filter: getComputedStyle(document.querySelector('.leaflet-tile-pane')).filter }));
    assert.strictEqual(r.carto, 0, 'jubin CARTO lama masih disimpan');
    assert.ok(!tiles.requests.some(u => /cartocdn/.test(u)), 'masih memuat jubin CARTO');
    assert.match(r.filter, /brightness/);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const file of FILES) test(`${file}: WhatsApp di telefon dibuka terus (whatsapp://, tiada tab kosong); wa.me hanya jika app tidak terbuka`, async () => {
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
  const { page, errors, close } = await open(file, { userAgent: ua });
  try {
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const calls = []; window.open = (u, t) => { calls.push([u.split('?')[0], t]); };
      // 1) app WhatsApp dibuka → halaman tersembunyi → tiada wa.me
      openWhatsApp('hai');
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      await w(WA_FALLBACK_MS + 200);
      const opened = calls.splice(0);
      // 2) app tidak terbuka (halaman kekal kelihatan) → wa.me sebagai sandaran
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      openWhatsApp('hai');
      await w(WA_FALLBACK_MS + 200);
      return { opened, fallback: calls };
    });
    assert.deepStrictEqual(r.opened, [['whatsapp://send', '_top']]);
    assert.deepStrictEqual(r.fallback, [['whatsapp://send', '_top'], ['https://wa.me/', '_blank']]);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const file of FILES) test(`${file}: setiap destinasi yang dinavigasi masuk "Terkini" (bukan Rumah) & "Terkini" dipulihkan dari server`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      S.prayerRemind = false;
      const p = places(); p.home = { title: 'Rumah', lat: 3.2, lng: 101.7 }; p.recent = []; savePlaces(p);
      state.manualLoc = false; setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
      // Destinasi BUKAN dari carian (cth. tekan lama / pautan) → kini tetap dicatat
      planRoute({ title: 'Kedai Ujian', sub: 'Kuantan', lat: 3.15, lng: 101.7 }); await w(300); startNav(); await w(100);
      cancelRoute(); hideAsk(); await w(50);
      planRoute({ title: 'Rumah', lat: 3.2, lng: 101.7 }); await w(300); startNav(); await w(100);
      cancelRoute(); hideAsk(); await w(50);
      const afterNav = places().recent.map(x => x.title);
      const listText = $('recentList').textContent;
      // Telefon kehilangan storan → server memulangkan "Terkini"
      const q = places(); q.recent = []; savePlaces(q);
      applyPrefs({ t: Date.now(), settings: {}, places: { home: q.home, work: null, favs: [], recent: [{ title: 'Dari Server', sub: '', lat: 3.3, lng: 101.8 }] } });
      return { afterNav, listText, restored: places().recent.map(x => x.title), built: buildPrefs().places.recent.length };
    });
    assert.deepStrictEqual(r.afterNav, ['Kedai Ujian']);
    assert.match(r.listText, /Kedai Ujian/);
    assert.deepStrictEqual(r.restored, ['Dari Server']);
    assert.strictEqual(r.built, 1);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const file of ['Index.html', 'IndexUji.html']) {
  test(`${file}: kamera AES diberi amaran walaupun dilapor dari arah bertentangan; laporan lain arah bertentangan senyap`, async () => {
    const { page, errors, close } = await open(file);
    try {
      const r = await page.evaluate(async () => {
        const w = ms => new Promise(r => setTimeout(r, ms));
        const said = []; window.speechSynthesis && (window.speechSynthesis.speak = u => said.push(u.text));
        S.alertTypes = Object.keys(TYPES); state.manualLoc = false; state.alerted = new Set();
        // Memandu ke utara (heading 0); laporan 300 m di hadapan, dilapor oleh pemandu arah selatan (heading 180)
        state.reports = [
          { id: 'cam-x', type: 'KAMERA', lat: 3.1027, lng: 101.7, heading: 180, name: 'A', up: 1, down: 0, time: Date.now() },
          { id: 'pol-x', type: 'POLIS', lat: 3.1027, lng: 101.7001, heading: 180, name: 'B', up: 1, down: 0, time: Date.now() }];
        setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 25, t: Date.now() }); await w(50);
        checkHazards(); await w(50);
        return { alerted: [...state.alerted] };
      });
      assert.ok(r.alerted.includes('cam-x'), 'kamera AES arah bertentangan tidak diberi amaran');
      assert.ok(!r.alerted.includes('pol-x'), 'laporan polis arah bertentangan diberi amaran');
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });
}

for (const file of ['Index.html', 'IndexUji.html']) {
  test(`${file}: kad lokasi muncul sebelum pertanyaan lokasi telefon; GPS hanya bermula selepas pengguna tekan Benarkan`, async () => {
    const { page, errors, close } = await open(file, null, { geoPerm: 'prompt' });
    try {
      await page.evaluate(() => {
        window.__geoCalls = 0;
        const w = navigator.geolocation.watchPosition.bind(navigator.geolocation);
        navigator.geolocation.watchPosition = (a, b, c) => { window.__geoCalls++; return w(a, b, c); };
      });
      await page.waitForSelector('#locModal', { state: 'visible' });
      assert.strictEqual(await page.textContent('#locTitle'), 'Benarkan lokasi');
      assert.strictEqual(await page.evaluate(() => window.__geoCalls), 0, 'GPS dimulakan sebelum pengguna setuju');
      await page.click('#locGo');
      await page.waitForSelector('#locModal', { state: 'hidden' });
      assert.ok(await page.evaluate(() => window.__geoCalls) >= 1, 'GPS tidak bermula selepas tekan Benarkan');
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });
}

for (const file of ['Index.html', 'IndexUji.html']) {
  test(`${file}: lokasi disekat → kad langkah tetapan; lokasi sudah dibenarkan → tiada kad`, async () => {
    let t = await open(file, null, { geoPerm: 'denied' });
    try {
      await t.page.waitForSelector('#locModal', { state: 'visible' });
      assert.strictEqual(await t.page.textContent('#locTitle'), 'Lokasi disekat');
      assert.ok(await t.page.isVisible('#locDenied'));
      await t.page.click('#locManual');
      await t.page.waitForSelector('#locModal', { state: 'hidden' });
      assert.ok(await t.page.evaluate(() => state.manualLoc), 'pilihan peta tidak menetapkan lokasi manual');
      assert.deepStrictEqual(t.errors, []);
    } finally { await t.close(); }
    t = await open(file);
    try {
      await t.page.waitForTimeout(500);
      assert.ok(!(await t.page.isVisible('#locModal')), 'kad lokasi muncul walaupun lokasi sudah dibenarkan');
    } finally { await t.close(); }
  });
}

for (const file of ['Index.html', 'IndexUji.html']) {
  test(`${file}: kad lokasi ditutup sendiri bila pengguna membenarkan lokasi dari tempat lain`, async () => {
    const { page, errors, close } = await open(file, null, { geoPerm: 'prompt' });
    try {
      await page.waitForSelector('#locModal', { state: 'visible' });
      await page.evaluate(() => window.__setGeoPerm('granted'));
      await page.waitForSelector('#locModal', { state: 'hidden' });
      assert.ok(await page.evaluate(() => geoReady));
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });
}

for (const file of ['Index.html', 'IndexUji.html']) {
test(`${file}: lampu isyarat OSM dilukis di atas laluan (bukan yang jauh), dua lorong bersebelahan jadi satu, dan dibuang bila navigasi tamat`, async () => {
  const { page, errors, close } = await open(file);
  try {
    await page.evaluate(() => {
      const line = (a, b, n) => Array.from({ length: n }, (_, i) => ({ lat: a[0] + (b[0] - a[0]) * i / (n - 1), lon: a[1] + (b[1] - a[1]) * i / (n - 1) }));
      window.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ elements: [
        { type: 'way', tags: { highway: 'primary', maxspeed: '90' }, geometry: line([3.1, 101.7], [3.2, 101.7], 11) },
        { type: 'node', id: 11, lat: 3.12, lon: 101.70003, tags: { highway: 'traffic_signals' } },
        { type: 'node', id: 12, lat: 3.12, lon: 101.70012, tags: { highway: 'traffic_signals' } },   // lorong sebelah (~13 m)
        { type: 'node', id: 13, lat: 3.14, lon: 101.7005, tags: { highway: 'traffic_signals' } },    // ~55 m dari laluan: bukan di laluan
        { type: 'node', id: 14, lat: 3.16, lon: 101.70002, tags: { highway: 'traffic_signals' } }] }) });
      S.speedLimit = -1;
      window.__toasts = []; const t0 = window.toast; window.toast = (m, ...a) => { __toasts.push(m); return t0(m, ...a); };
    });
    await startNav(page);
    await drive(page, 90, 30);
    const r = await page.evaluate(() => ({ ids: (state.sigs || []).map(x => x.id), drawn: document.querySelectorAll('.sig').length,
      layers: sigLayer.getLayers().length }));
    assert.deepStrictEqual(r.ids, ['sig-11', 'sig-14']);
    assert.ok(r.drawn >= 1 && r.drawn === r.layers, `lampu dilukis: ${r.drawn}, lapisan: ${r.layers}`);
    await page.evaluate(() => cancelRoute());
    assert.strictEqual(await page.evaluate(() => document.querySelectorAll('.sig').length), 0);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

test(`${file}: lampu isyarat & kamera dibaca dari fail statik walaupun semua pelayan Overpass gagal`, async () => {
  const { page, errors, close } = await open(file);
  try {
    await page.evaluate(() => {
      window.fetch = u => (/titik\.json/.test(String(u))
        ? Promise.resolve({ ok: true, status: 200, json: async () => ({ v: 1, c: [[3.13, 101.70001, 31]],
          s: [[3.12, 101.70003, 11], [3.16, 101.70002, 14], [3.14, 101.7005, 13]] }) })
        : Promise.resolve({ ok: false, status: 504 }));
      S.speedLimit = -1;
    });
    await startNav(page);
    await page.waitForFunction(() => (state.sigs || []).length === 2, null, { timeout: 20000 });
    assert.deepStrictEqual(await page.evaluate(() => [state.sigs.map(x => x.id), state.cams.map(x => x.id)]),
      [['sig-11', 'sig-14'], ['cam-31']]);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

test(`${file}: lampu isyarat & kamera dimuat walaupun pertanyaan jalan ber-had laju gagal (dua pertanyaan berasingan)`, async () => {
  const { page, errors, close } = await open(file);
  try {
    await page.evaluate(() => {
      window.fetch = (u, o) => (/maxspeed/.test(decodeURIComponent(String(o && o.body)))
        ? Promise.resolve({ ok: false, status: 504 })
        : Promise.resolve({ ok: true, status: 200, json: async () => ({ elements: [
          { type: 'node', id: 11, lat: 3.12, lon: 101.70003, tags: { highway: 'traffic_signals' } },
          { type: 'node', id: 14, lat: 3.16, lon: 101.70002, tags: { highway: 'traffic_signals' } }] }) }));
      S.speedLimit = -1;
    });
    await startNav(page);
    await page.waitForFunction(() => (state.sigs || []).length === 2, null, { timeout: 20000 });
    assert.deepStrictEqual(await page.evaluate(() => state.sigs.map(x => x.id)), ['sig-11', 'sig-14']);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});
}

for (const file of FILES) {
  test(`${file}: menu ☰ — pemilik nampak tarikh & bilangan data titik, pengguna biasa tidak; English diterjemah`, async () => {
    const { page, errors, close } = await open(file);
    try {
      await page.evaluate(() => {
        window.fetch = u => (/titik\.json/.test(String(u))
          ? Promise.resolve({ ok: true, status: 200, json: async () => ({ v: 1, t: '2026-11-13', c: [[3, 101, 1], [3, 102, 2]], s: [[3, 101, 3]] }) })
          : Promise.resolve({ ok: false, status: 504 }));
        state.isOwner = true; renderDrawer();
      });
      await page.waitForFunction(() => /Data titik: 2026-11-13 · 2 kamera, 1 lampu isyarat/.test(($('titikInfo') || {}).textContent || ''), null, { timeout: 5000 });
      await page.evaluate(() => { setVoiceLang('en'); renderDrawer(); });
      await page.waitForFunction(() => /Point data: 2026-11-13 · 2 cameras, 1 traffic lights/.test(($('titikInfo') || {}).textContent || ''), null, { timeout: 5000 });
      const other = await page.evaluate(() => { state.isOwner = false; renderDrawer(); return !!$('titikInfo'); });
      assert.strictEqual(other, false);
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });
}

for (const file of ['Index.html', 'IndexUji.html']) {
test(`${file}: had laju jalan dibaca dari fail statik kawasan walaupun semua pelayan Overpass gagal`, async () => {
  const { page, errors, close } = await open(file);
  try {
    await page.evaluate(() => {
      const json = o => Promise.resolve({ ok: true, status: 200, json: async () => o });
      const line = (a, b, n) => Array.from({ length: n }, (_, i) => [a[0] + (b[0] - a[0]) * i / (n - 1), a[1] + (b[1] - a[1]) * i / (n - 1)]).flat();
      window.__hadCalls = [];
      window.fetch = u => {
        u = String(u);
        if (/titik\.json/.test(u)) return json({ v: 1, c: [], s: [] });
        if (/data\/had\//.test(u)) {
          window.__hadCalls.push(u.split('/').pop());
          if (/indeks\.json/.test(u)) return json({ v: 1, k: ['12_406', '9_999'] });
          if (/12_406\.json/.test(u)) return json({ v: 1, w: [[90, line([3.1, 101.7], [3.2, 101.7], 11)], [50, [4.9, 100.1, 4.95, 100.1]]] });
        }
        return Promise.resolve({ ok: false, status: 504 });    // Overpass gagal
      };
      S.speedLimit = -1;
    });
    await startNav(page);
    await page.waitForFunction(() => (state.slInt || []).length >= 1, null, { timeout: 20000 });
    assert.strictEqual(await page.evaluate(() => state.slInt[0].v), 90);
    const calls = await page.evaluate(() => __hadCalls);
    assert.ok(calls.includes('indeks.json') && calls.includes('12_406.json'), calls.join());
    assert.ok(!calls.includes('9_999.json'), 'kawasan di luar laluan tidak sepatutnya dimuat');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});
}

for (const file of ['Index.html', 'IndexUji.html']) {
test(`${file}: menu ☰ — pemilik nampak tarikh & bilangan kawasan data had laju; English diterjemah; pengguna biasa tidak`, async () => {
  const { page, errors, close } = await open(file);
  try {
    await page.evaluate(() => {
      window.fetch = u => (/had\/indeks\.json/.test(String(u))
        ? Promise.resolve({ ok: true, status: 200, json: async () => ({ v: 1, t: '2026-11-14', k: ['12_406', '12_407', '13_406'] }) })
        : /poi\/indeks\.json/.test(String(u))
        ? Promise.resolve({ ok: true, status: 200, json: async () => ({ v: 1, t: '2026-11-14', k: { fuel: ['12_406', '12_407'], food: ['12_406'] } }) })
        : Promise.resolve({ ok: false, status: 404 }));
      state.isOwner = true; renderDrawer();
    });
    await page.waitForFunction(() => /Data had laju: 2026-11-14 · 3 kawasan/.test(($('hadInfo') || {}).textContent || ''), null, { timeout: 5000 });
    await page.waitForFunction(() => /Data tempat: 2026-11-14 · 3 kawasan/.test(($('poiInfo') || {}).textContent || ''), null, { timeout: 5000 });
    await page.evaluate(() => { setVoiceLang('en'); renderDrawer(); });
    await page.waitForFunction(() => /Speed limit data: 2026-11-14 · 3 areas/.test(($('hadInfo') || {}).textContent || ''), null, { timeout: 5000 });
    await page.waitForFunction(() => /Places data: 2026-11-14 · 3 areas/.test(($('poiInfo') || {}).textContent || ''), null, { timeout: 5000 });
    assert.strictEqual(await page.evaluate(() => { state.isOwner = false; renderDrawer(); return !!$('hadInfo'); }), false);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});
}

for (const file of ['Index.html', 'IndexUji.html']) {
test(`${file}: cari sepanjang laluan & berdekatan dari fail statik walaupun server & Overpass gagal`, async () => {
  const { page, errors, close } = await open(file);
  try {
    await startNav(page);
    const r = await page.evaluate(async () => {
      const json = o => Promise.resolve({ ok: true, status: 200, json: async () => o });
      window.__urls = [];
      window.__override = { alongRoute: () => { throw new Error('server gagal'); }, nearbyPlaces: () => { throw new Error('server gagal'); } };
      window.fetch = u => {
        u = String(u); __urls.push(u.replace(/^.*data\/poi\//, ''));
        if (/poi\/indeks\.json/.test(u)) return json({ v: 1, t: '2026-11-14', k: { fuel: ['12_406', '9_999'], atm: ['12_406'] } });
        if (/poi\/fuel\/12_406\.json/.test(u)) return json({ v: 1, p: [[3.15, 101.7001, 'Petronas Statik', 'Petronas · Jalan A'], [4.9, 100.1, 'Jauh', '']] });
        if (/poi\/atm\/12_406\.json/.test(u)) return json({ v: 1, p: [[3.1, 101.7, 'ATM Statik', '']] });
        return Promise.resolve({ ok: false, status: 504 });      // Overpass dll. gagal
      };
      searchAlong('fuel');
      for (let i = 0; i < 100 && !/Petronas Statik/.test($('alongList').textContent); i++) await new Promise(r => setTimeout(r, 50));
      const along = $('alongList').textContent;
      document.querySelector('#searchSheet') && $('searchSheet').classList.add('open');
      nearbySearch('atm');
      for (let i = 0; i < 100 && !/ATM Statik/.test($('searchBody').textContent); i++) await new Promise(r => setTimeout(r, 50));
      return { along, near: $('searchBody').textContent, urls: __urls };
    });
    assert.match(r.along, /Petronas Statik/);
    assert.ok(!/Jauh/.test(r.along));
    assert.match(r.near, /ATM Statik/);
    assert.ok(r.urls.includes('indeks.json') && r.urls.includes('fuel/12_406.json'), r.urls.join());
    assert.ok(!r.urls.includes('fuel/9_999.json'), 'kawasan di luar laluan tidak sepatutnya dimuat');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});
}

for (const file of ['Index.html', 'IndexUji.html']) {
test(`${file}: fail had laju & semua kategori tempat di sepanjang laluan dimuat awal bila navigasi bermula (tanpa carian)`, async () => {
  const { page, errors, close } = await open(file);
  try {
    await page.evaluate(() => {
      const json = o => Promise.resolve({ ok: true, status: 200, json: async () => o });
      window.__urls = [];
      window.fetch = u => {
        u = String(u);
        if (/data\/(had|poi)\//.test(u)) __urls.push(u.replace(/^.*data\//, ''));
        if (/had\/indeks\.json/.test(u)) return json({ v: 1, k: ['12_406', '9_999'] });
        if (/poi\/indeks\.json/.test(u)) return json({ v: 1, k: { fuel: ['12_406'], food: ['12_406', '9_999'], atm: ['9_999'] } });
        if (/had\/12_406\.json/.test(u)) return json({ v: 1, w: [] });
        if (/poi\/(fuel|food)\/12_406\.json/.test(u)) return json({ v: 1, p: [] });
        return Promise.resolve({ ok: false, status: 404 });
      };
      S.speedLimit = -1;
    });
    await startNav(page);
    await page.waitForFunction(() => __urls.includes('poi/food/12_406.json'), null, { timeout: 15000 });
    const urls = await page.evaluate(() => __urls);
    ['had/12_406.json', 'poi/fuel/12_406.json', 'poi/food/12_406.json'].forEach(u => assert.ok(urls.includes(u), u + ' | ' + urls.join()));
    assert.ok(!urls.some(u => /9_999\.json/.test(u)), 'kawasan di luar laluan tidak sepatutnya dimuat');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});
}

for (const file of ['Index.html', 'IndexUji.html']) {
test(`${file}: cari sepanjang laluan berfungsi TANPA liputan selepas muat awal (kes mod kapal terbang)`, async () => {
  const { page, errors, close } = await open(file);
  try {
    await page.evaluate(() => {
      const json = o => Promise.resolve({ ok: true, status: 200, json: async () => o });
      window.fetch = u => {
        u = String(u);
        if (/had\/indeks\.json/.test(u)) return json({ v: 1, k: [] });
        if (/poi\/indeks\.json/.test(u)) return json({ v: 1, k: { fuel: ['12_406'], food: ['12_406'] } });
        if (/poi\/(fuel|food)\/12_406\.json/.test(u)) return json({ v: 1, p: [[3.15, 101.7001, 'Petronas Muat Awal', '']] });
        return Promise.resolve({ ok: false, status: 404 });
      };
    });
    await startNav(page);
    await page.waitForFunction(() => poiOk >= 2, null, { timeout: 15000 });      // muat awal selesai
    const text = await page.evaluate(async () => {
      window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));       // mod kapal terbang
      window.__override = { alongRoute: () => { throw new Error('Failed to fetch'); } };
      searchAlong('fuel');
      for (let i = 0; i < 100 && !/Petronas Muat Awal|Tiada liputan/.test($('alongList').textContent); i++) await new Promise(r => setTimeout(r, 50));
      return $('alongList').textContent;
    });
    assert.match(text, /Petronas Muat Awal/);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});
}

for (const file of ['Index.html', 'IndexUji.html']) {
test(`${file}: amaran suara "melebihi had laju" tidak serta-merta, sekali sahaja (bukan setiap minit); had laju tidak disebut serta-merta`, async () => {
  const { page, errors, close } = await open(file);
  try {
    await page.evaluate(() => {
      window.__said = []; window.speak = t => __said.push(t);
      const line = (a, b, n) => Array.from({ length: n }, (_, i) => ({ lat: a[0] + (b[0] - a[0]) * i / (n - 1), lon: a[1] + (b[1] - a[1]) * i / (n - 1) }));
      window.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ elements: [
        { type: 'way', tags: { highway: 'primary', maxspeed: '90' }, geometry: line([3.1, 101.7], [3.2, 101.7], 11) }] }) });
      S.speedLimit = -1;
    });
    await startNav(page);
    await drive(page, 40, 100);                 // 100 km/j > 90 + 3, tetapi baru beberapa ms sebenar
    const said = () => page.evaluate(() => __said.filter(x => /melebihi/.test(x)).length);
    assert.strictEqual(await said(), 0, 'amaran terlalu awal');
    assert.strictEqual(await page.evaluate(() => $('speedSign').textContent), '90');
    assert.strictEqual(await page.evaluate(() => __said.filter(x => /Had laju/.test(x)).length), 0, 'had laju disebut sebelum kekal 6 s');
    await page.evaluate(() => { state.overSince = Date.now() - 9000; state.limSince = Date.now() - 7000; });   // simulasi: melebihi 9 s, had kekal 7 s
    await drive(page, 3, 100);
    assert.strictEqual(await said(), 1);
    assert.strictEqual(await page.evaluate(() => __said.filter(x => /Had laju/.test(x)).length), 1);
    await page.evaluate(() => { state.speedWarnAt = Date.now() - 61000; });     // lama: 60 s sudah cukup untuk ulang
    await drive(page, 5, 100);
    assert.strictEqual(await said(), 1, 'diulang selepas 61 s');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});
}

// ---- Cadang kamera di sini (saluran uji sahaja dahulu): butang dalam helaian laporan + senarai semakan dalam panel pentadbir
for (const file of FILES) test(`${file}: "Cadang kamera di sini" menghantar lokasi semasa; pemilik nampak & boleh salin/buang cadangan`, async () => {
  const { page, errors, close } = await open(file);
  try {
    await page.evaluate(() => {
      window.__sent = [];
      window.__override = {
        suggestCamera: a => { __sent.push(a[1]); return { ok: true, merged: false }; },
        adminOverview: () => ({ activeUsers: 1, usersHour: 1, reports: 0, reportsDay: 0, shares: 0, byType: {}, quota: [], recent: [], banned: [],
          camSug: [{ id: 'abcdef12-0001', name: 'Ali', lat: 3.1, lng: 101.7, note: '', time: Date.now(), count: 2 }] }),
        adminResolveCamera: () => ({ ok: true })
      };
      setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() });
      openReport();
    });
    await page.click('#btnSuggestCam');
    await page.waitForFunction(() => window.__sent.length === 1);
    const sent = await page.evaluate(() => window.__sent[0]);
    assert.strictEqual(sent.lat, 3.1); assert.strictEqual(sent.lng, 101.7);
    await page.evaluate(() => { state.isOwner = true; openAdmin(); });
    await page.waitForFunction(() => /Cadangan kamera/.test($('adminBody').textContent) && /3\.10000, 101\.70000/.test($('adminBody').textContent));
    assert.match(await page.textContent('#adminBody'), /👥2/);
    await page.click('[data-adm="cdone"]');
    await page.click('[data-adm="cdone"]');   // tekan kedua mengesahkan ("Pasti?")
    await page.waitForFunction(() => __calls.indexOf('adminResolveCamera') >= 0);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

// ---- Bahasa: storan kosong → jangan tunjuk BM dahulu sebelum bertukar ke English (saluran uji)
for (const file of FILES) test(`${file}: storan kosong — skrin ditutup sehingga bahasa dari server diketahui, kemudian English; dibuka juga jika server gagal`, async () => {
  const { page, errors, close } = await open(file);
  const spy = 'new MutationObserver(() => { if (document.getElementById("langWait")) { window.__sawWait = true; window.__waitText = document.getElementById("langWait").textContent; } }).observe(document, { childList: true, subtree: true });';
  try {
    // 1) server berjaya dengan English: penutup pernah wujud, kemudian dibuka dan teks sudah English
    await page.addInitScript(spy + 'localStorage.clear(); window.__override = { loadPrefs: () => ({ t: 1, name: "Ali", voice: "en", settings: {} }) };');
    await page.reload();
    await page.waitForFunction(() => window.__appStarted === true);
    await page.waitForFunction(() => !document.getElementById('langWait'), null, { timeout: 3000 });
    assert.strictEqual(await page.evaluate(() => window.__sawWait === true), true, 'skrin tidak ditutup');
    assert.strictEqual(await page.evaluate(() => window.__waitText), 'JomRoute');
    assert.strictEqual(await page.evaluate(() => document.getElementById('locTitle').textContent), 'Allow location');
    // 2) server gagal: skrin tetap dibuka (tidak tersekat)
    await page.addInitScript('localStorage.clear(); window.__override = { loadPrefs: () => { throw new Error("gagal"); } };');
    await page.reload();
    await page.waitForFunction(() => window.__appStarted === true);
    await page.waitForFunction(() => !document.getElementById('langWait'), null, { timeout: 6000 });
    // 3) storan ada bahasa: tiada penutup langsung
    await page.addInitScript('localStorage.setItem("jk_voice", "en"); window.__sawWait = false;');
    await page.reload();
    await page.waitForFunction(() => window.__appStarted === true);
    await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => window.__sawWait === true), false);
  } finally { await close(); }
});

// ---- Mesej WhatsApp mengikut bahasa tetapan (saluran uji)
for (const file of FILES) test(`${file}: mesej WhatsApp ikut bahasa tetapan (English / BM)`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const out = await page.evaluate(() => {
      const got = [];
      window.openWhatsApp = t => got.push(t);
      setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now(), acc: 12 });
      voiceLang = 'en'; sosShare(); shareMyLocation();
      voiceLang = 'ms'; sosShare();
      return got;
    });
    assert.match(out[0], /EMERGENCY — I need help/);
    assert.match(out[1], /I am here/);
    assert.doesNotMatch(out[0] + out[1], /KECEMASAN|Saya di sini|Buka dengan/);
    assert.match(out[2], /KECEMASAN — saya perlukan bantuan/);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

// ---- Tekan lama pada peta → "Pergi ke sini": "Terkini" menyimpan nama jalan walaupun jawapannya lewat (saluran uji)
for (const file of FILES) test(`${file}: tekan lama → Pergi ke sini terus selepas itu — Terkini menyimpan nama jalan, bukan "Lokasi dipilih"`, async () => {
  const { page, errors, close } = await open(file);
  try {
    await page.evaluate(() => {
      window.__override = { whereAmI: () => ({ road: 'Jalan Ujian' }) };
      setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() });
      onLongPress({ lat: 3.2, lng: 101.7 });
      document.querySelector('[data-lp="go"]').click();   // sebelum jawapan server sampai
    });
    await page.waitForFunction(() => (places().recent || []).length > 0, null, { timeout: 5000 });
    assert.strictEqual(await page.evaluate(() => places().recent[0].title), 'Jalan Ujian');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

// ---- Amaran cuaca menunggu kad soalan ("Beritahu keluarga?") hilang: tidak bertindih (saluran uji)
for (const file of FILES) test(`${file}: amaran ribut tidak muncul semasa kad soalan dipaparkan; muncul selepas kad hilang`, async () => {
  const { page, errors, close } = await open(file);
  try {
    await startNav(page);
    const shown = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const hourly = { hourly: { time: [new Date(Date.now() - 3600e3).toISOString().slice(0, 16)], precipitation: [0], weather_code: [95] } };
      window.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => [hourly, hourly, hourly, hourly] });
      const r = state.routes[state.selRoute];
      const reset = () => { state.rainAt = 0; state.rainSaid = null; state.rainBusy = false; state.rainRoute = null; $('toast').style.display = 'none'; };
      reset(); showAsk({ icon: '🏠', text: 'Soalan', sub: '', yes: 'Ya', no: 'Tidak', ms: 60000 });
      checkRain(r, 0); await w(300);
      const during = $('toast').style.display === 'block';
      hideAsk(); checkRain(r, 0); await w(300);
      return { during, after: $('toast').style.display === 'block' && /Ribut petir/.test($('toast').textContent) };
    });
    assert.strictEqual(shown.during, false, 'amaran bertindih dengan kad soalan');
    assert.strictEqual(shown.after, true, 'amaran tidak muncul selepas kad hilang');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

// ---- Menu ☰: bahagian "Pemilik" di bawah, selepas Tetapan; pengguna biasa tidak nampak (saluran uji)
for (const file of FILES) test(`${file}: menu ☰ — Panel pentadbir dalam bahagian "Pemilik" selepas Tetapan; bukan pemilik tiada bahagian itu`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(() => {
      state.isOwner = true; renderDrawer();
      const t = $('drawerPane').textContent, own = {
        label: t.indexOf('Pemilik'), settings: t.indexOf('Tetapan'), admin: t.indexOf('Panel pentadbir'), invite: t.indexOf('Kongsi JomRoute') };
      state.isOwner = false; renderDrawer();
      return { own, user: { label: $('drawerPane').textContent.indexOf('Pemilik'), admin: $('drawerPane').textContent.indexOf('Panel pentadbir') } };
    });
    assert.ok(r.own.settings > 0 && r.own.label > r.own.settings && r.own.admin > r.own.label, JSON.stringify(r.own));
    assert.ok(r.own.invite < r.own.settings, 'Kongsi JomRoute patut sebelum Tetapan');
    assert.deepStrictEqual(r.user, { label: -1, admin: -1 });
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

// ---- Menu ☰: ikon garisan (SVG) untuk semua baris kecuali SOS & Mood yang kekal emoji (saluran uji)
for (const file of FILES) test(`${file}: menu ☰ guna ikon garisan SVG; SOS dan Mood kekal emoji`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(() => {
      state.isOwner = true; renderDrawer();
      const rows = [...document.querySelectorAll('#drawerPane .srow')].filter(x => x.querySelector('.sic'));
      return rows.map(x => ({ svg: !!x.querySelector('.sic svg'), txt: x.querySelector('.sic').textContent.trim() }));
    });
    assert.strictEqual(r.length, 13);
    assert.strictEqual(r.filter(x => x.svg).length, 11, JSON.stringify(r));
    assert.strictEqual(r.filter(x => !x.svg).length, 2);          // SOS dan Mood
    assert.ok(r.filter(x => !x.svg).some(x => x.txt === '🆘'));
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

// ---- Skrin tetapan: semua ikon baris guna SVG garisan, tiada emoji (saluran uji)
for (const file of FILES) test(`${file}: semua halaman tetapan guna ikon garisan SVG pada baris berikon`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const bad = await page.evaluate(() => {
      const out = [];
      Object.keys(PAGES).filter(k => !['repTypes', 'alertTypes', 'mood', 'audio'].includes(k)).forEach(k => {   // jenis laporan, mood & pautan audio kekal
        const box = document.createElement('div'); box.innerHTML = PAGES[k]().html;
        box.querySelectorAll('.sic').forEach(e => { if (!e.querySelector('svg')) out.push(k + ':' + e.textContent.trim()); });
      });
      return out;
    });
    assert.deepStrictEqual(bad, []);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

// ---- Selepas melepasi kamera yang diamaran: kad "Kamera tadi masih ada?"; "Tiada" dihantar kepada pemilik (saluran uji)
for (const file of FILES) test(`${file}: kad "Kamera tadi masih ada?" selepas melepasi kamera; "Tiada" lapor ke server; tidak ditanya lagi dalam 7 hari`, async () => {
  const { page, errors, close } = await open(file);
  try {
    await startNav(page);
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(x => setTimeout(x, ms));
      window.__sent = []; window.__override = { suggestCamera: a => { __sent.push(a[1]); return { ok: true }; } };
      localStorage.removeItem('jk_camasked'); hideAsk();
      const add = () => state.camPass = [{ id: 'cam-77', a: 1000, lat: 3.15, lng: 101.7, navId: state.navId }];
      add(); checkCamGone(1050);                                    // belum 80 m
      const early = $('askCard').style.display === 'block';
      checkCamGone(1100);
      const shown = $('askCard').style.display === 'block' && /Kamera tadi masih ada/.test($('askText').textContent);
      $('askNo').click(); await w(100);
      hideAsk(); add(); checkCamGone(1200);                         // tanya lagi dalam 7 hari: tidak
      return { early, shown, again: $('askCard').style.display === 'block', sent: __sent };
    });
    assert.strictEqual(r.early, false); assert.strictEqual(r.shown, true); assert.strictEqual(r.again, false);
    assert.strictEqual(r.sent.length, 1);
    assert.strictEqual(r.sent[0].gone, true); assert.strictEqual(r.sent[0].camId, 'cam-77');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

// ---- Panel pentadbir: butang Terima pada cadangan kamera baharu (bukan laporan "tiada") (saluran uji)
for (const file of FILES) test(`${file}: panel pentadbir — butang Terima hanya pada cadangan baharu; tekan dua kali memanggil adminAcceptCamera`, async () => {
  const { page, errors, close } = await open(file);
  try {
    await page.evaluate(() => {
      window.__acc = [];
      window.__override = {
        adminOverview: () => ({ activeUsers: 1, usersHour: 1, reports: 0, reportsDay: 0, shares: 0, byType: {}, quota: [], recent: [], banned: [],
          camSug: [{ id: 'abcdef12-0001', name: 'Ali', lat: 3.1, lng: 101.7, note: '', time: Date.now(), count: 1, gone: false },
                   { id: 'abcdef12-0002', name: 'Ali', lat: 3.2, lng: 101.7, note: 'cam-5', time: Date.now(), count: 1, gone: true }] }),
        adminAcceptCamera: a => { __acc.push(a[1]); return { ok: true }; }
      };
      state.isOwner = true; openAdmin();
    });
    await page.waitForFunction(() => /Cadangan kamera/.test($('adminBody').textContent) && $('adminBody').querySelector('[data-adm="caccept"]'));
    assert.strictEqual(await page.evaluate(() => $('adminBody').querySelectorAll('[data-adm="caccept"]').length), 1);
    await page.click('[data-adm="caccept"]');
    await page.click('[data-adm="caccept"]');   // tekan kedua mengesahkan ("Pasti?")
    await page.waitForFunction(() => window.__acc.length === 1);
    assert.strictEqual(await page.evaluate(() => window.__acc[0]), 'abcdef12-0001');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

// ---- Zon kerap ada polis/kamera: amaran suara sekali, hanya di hadapan, ikut tetapan jenis amaran (saluran uji)
for (const file of FILES) test(`${file}: zon kerap ada polis — diamaran sekali di hadapan; tidak bila di belakang, perlahan, jenis dimatikan atau laporan semasa sudah ada`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(() => {
      const me = { lat: 3.1, lng: 101.7, heading: 0, speed: 60 };
      const shown = () => $('toast').style.display === 'block' && /Kawasan sering ada polis/.test($('toast').textContent);
      const run = (extra, mut) => {
        $('toast').style.display = 'none'; state.hotSaid = {}; state.reports = [];
        state.hot = [Object.assign({ lat: 3.1036, lng: 101.7, type: 'P' }, extra || {})];   // ~400 m utara
        if (mut) mut(); checkHotspots(Object.assign({}, me, (mut && mut.me) || {}), true); return shown();
      };
      const out = {};
      out.depan = run();
      checkHotspots(me, true); $('toast').style.display = 'none'; checkHotspots(me, true);
      out.sekaliSahaja = shown();                                                           // 30 minit: tidak diulang
      out.belakang = run({ lat: 3.0964 });
      state.hot = [{ lat: 3.1036, lng: 101.7, type: 'P' }]; state.hotSaid = {}; $('toast').style.display = 'none'; checkHotspots(Object.assign({}, me, { speed: 10 }), true);
      out.perlahan = shown();
      const old = S.alertTypes.slice(); S.alertTypes = S.alertTypes.filter(x => x !== 'POLIS'); out.dimatikan = run(); S.alertTypes = old;
      out.laporanSemasa = run({}, () => { state.reports = [{ type: 'POLIS', lat: 3.1034, lng: 101.7 }]; });
      return out;
    });
    assert.deepStrictEqual(r, { depan: true, sekaliSahaja: false, belakang: false, perlahan: false, dimatikan: false, laporanSemasa: false });
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

// ---- Halaman "Privasi & data" dalam Tetapan (saluran uji)
for (const file of FILES) test(`${file}: Tetapan ada "Privasi & data" (BM & English); mod halimunan dan pautan padam data ada di dalamnya`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(() => {
      const out = {};
      out.root = PAGES.root().html.includes('Privasi &amp; data') || PAGES.root().html.includes('Privasi & data');
      voiceLang = 'ms'; const ms = PAGES.privacy(); out.ms = ms.html.includes('dikaburkan ~100 m') && ms.html.includes('data-toggle="hidden"') && ms.html.includes('data-go="account"');
      voiceLang = 'en'; const en = PAGES.privacy(); out.en = en.html.includes('blurred to ~100 m') && !/dikaburkan/.test(en.html);
      return out;
    });
    assert.deepStrictEqual(r, { root: true, ms: true, en: true });
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});
