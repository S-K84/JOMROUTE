# CLAUDE.md — panduan untuk Claude (dan pembangun) dalam repo JalanKita

JalanKita (nama paparan: **JomRoute**, ikon kereta merah di jalan menuju matahari terbit (dahulu "Jalan Malaysia", ikon Jalur Gemilang); sejak 19 Nov 2026 projek Apps Script & hamparan data dinamakan "JomRoute"; hamparan sandaran masih "JalanKita — Sandaran") ialah aplikasi navigasi & laporan trafik komuniti (ala Waze): **Google Apps Script** (server), **Google Sheets**
(pangkalan data), **Leaflet + OpenStreetMap** (peta). Baca `README.md` untuk gambaran ciri dan tempat data disimpan.

## Pemilik & bahasa
- Pemilik projek **bukan pengaturcara**. Jawab dalam **Bahasa Melayu yang mudah**. Bila dia perlu menekan sesuatu
  (GitHub, Apps Script, telefon), beri langkah demi langkah: apa yang ditekan dan apa yang sepatutnya kelihatan.
- Teks dalam aplikasi, komen kod, mesej commit dan penerangan PR ditulis dalam **BM**.

## Aliran kerja (wajib)
1. Semua perubahan melalui **Pull Request** ke `main`. Jangan commit terus ke `main`.
2. `npm test` mesti lulus sebelum push. CI (`.github/workflows/test.yml`) menjalankannya pada setiap PR.
3. Bila PR di-merge, `.github/workflows/deploy.yml` menjalankan ujian, `clasp push`, kemudian `clasp deploy -i <deployment sedia ada>`.
   Pautan `/exec` kekal sama. Semak keputusan di tab Actions (log patut menunjukkan `Created version N`).
4. **Jangan sekali-kali** suruh pemilik mengubah kod dalam editor Apps Script. Deploy seterusnya akan menimpanya.
   `clasp push` menggantikan semua fail projek Apps Script dengan `Code.gs`, `Index.html` dan `appsscript.json` dari repo
   (`.claspignore`).
5. Naikkan **`APP_VERSION`** (bahagian atas `Code.gs`, format `YYYY.MM.DD-x`) dalam setiap PR yang mengubah kod aplikasi.
   Ia satu-satunya tempat versi ditulis, dan disuntik ke `Index.html` melalui `<?!= versionJson ?>`.
   Pemilik menyemak versi di telefon (menu ☰, bahagian bawah).
6. Tambah ujian dalam `tests/` untuk setiap pembaikan atau ciri baharu, dan pastikan ujian itu **gagal pada kod lama**.
7. **Saluran uji** untuk perubahan klien yang berisiko: letak kod baharu dalam `IndexUji.html`, merge, kemudian pemilik buka
   `.../exec?uji=1` di telefon (hanya pemilik; versi ditanda "(uji)"). Bila sudah disahkan di telefon sebenar, salin ke
   `Index.html` dalam PR berasingan. Lulus ujian Chromium/Node **tidak** menjamin Safari iPhone berfungsi (lihat PR #5/#6).

## Keselamatan
- **Jangan minta** isi `.clasprc.json` atau nilai secret GitHub (`CLASPRC_JSON`, `SCRIPT_ID`, `DEPLOYMENT_ID` dalam
  environment `apps-script`). Script ID dan Deployment ID tidak sensitif.
- Dalam `Code.gs`, **setiap fungsi tanpa `_` di hujung boleh dipanggil oleh sesiapa** melalui `google.script.run`.
  Fungsi dalaman mesti berakhir dengan `_`. Setiap fungsi awam untuk pengguna bermula dengan `verify_(token)`, dan fungsi
  pentadbir dengan `requireOwner_(token)`. `setup()` dan `cleanup()` menyemak `isOwner_()` / `isRealTrigger_()`.
- Input pengguna yang ditulis ke Sheet mesti melalui `cell_()` / `protectCell_()`, untuk menghalang suntikan formula `= + - @`.
- **Tetamu (ID `a_…`, tanpa log masuk Google) hanya MELIHAT.** ID `a_` boleh dicipta tanpa had, jadi fungsi yang menulis
  atau menggunakan had global (laluan, laporan, undi, carian, kongsi) mesti guna `requireGoogle_(verify_(token))`. Fungsi
  latar (lokasi, `whereAmI`, `savePrefs`) senyap untuk tetamu (`isGuest_`). Diuji oleh `tests/guest.test.js`.
- Data ke dalam `<script>` dalam templat mesti melalui `jsonForScript_()`. Dalam klien, teks pengguna ke HTML mesti melalui
  `esc()`, atau guna `textContent`.
- URL luaran (UrlFetch) mestilah senarai TETAP, tidak boleh datang dari pengguna (SSRF). Pautan lokasi disemak oleh `allowedLink_()`.

## Struktur kod
| Bahagian | Di mana | Nota |
|---|---|---|
| Konfigurasi & had kadar | `CONFIG` (atas `Code.gs`) | `CONFIG.LIMITS`: `[maks, tetingkap_saat]`; kunci `G_` = global |
| Had kadar | `rateLimitAll_`, `rlKey_` | Tetingkap tetap: nombor tetingkap ada dalam kunci cache. Semak semua had dahulu, baru tolak. |
| Kunci skrip | `lock_()` | `tryLock` + mesej "Sistem sibuk". Jangan guna `waitLock`. |
| Identiti | `getSession`, `verify_`, `sign_`, `tokenId_` | Token `id.HMAC`. ID `g_…` dari `Session.getTemporaryActiveUserKey()`, yang **dirotasi setiap 30 hari** → `migrationOffer_` / `migrateData`, `carryBan_` |
| Laporan | `submitReports`, `voteReport`, `getReports_`, `rebuildReports_` | Cache laporan **dibina semula selepas setiap penulisan** (pecahan < 100 KB). Laporan sama (≤200 m, arah ±60°) digabung sebagai 👍 (`findDuplicate_`). |
| Lokasi pengguna | `updateLocation`, `getActiveUsers_` | **CacheService sahaja**, bukan Sheet: `u_<id>` (180 s), indeks sel `uc_<i>_<j>` (~22 km), `u_all` |
| Laluan | `getRoute` | Servis Maps Apps Script. > `ROUTE_MAX_KM_` → mesej "semak GPS/VPN" tanpa memanggil Google. |
| Penyelenggaraan | `cleanup` (pencetus setiap jam) | Buang laporan luput, data pengguna 180 hari, statistik 365 hari, kongsi tamat. |
| Klien | `Index.html` (satu fail) | Peta, navigasi, suara (`speak` + `VOICE_PRIO`), tetapan, i18n (`EN`, `EN_RULES`, `tr`) |

## Perangkap yang pernah berlaku
- **`CacheService.put` menetapkan semula tempoh luput.** Jangan guna satu kunci yang ditulis semula sebagai pembilang tetingkap,
  kerana ia tidak akan reset (pepijat lama: pengguna disekat selepas ~3 jam).
- Nilai cache maks **100 KB**, dan tempoh maks **6 jam**. Pecahkan data besar; jangan potong di tengah pasangan surrogate (emoji).
- Setiap `google.script.run` ialah satu pelaksanaan Apps Script atas akaun pemilik (had ~30 serentak). Kurangkan panggilan
  yang kerap; panggilan klien ada had masa 60 s (`call()` dalam `Index.html`).
- `google.script.run` memberi mesej ralat berawalan `"Error: "`; `call()` membuangnya. Mesej `"Lock timeout"` bukan ralat rangkaian.
- **Setiap mesej ralat server baharu mesti ada terjemahan** dalam `EN` (`Index.html`). `tests/i18n.test.js` akan gagal jika tiada.
- Peraturan `EN_RULES` disemak sebelum pemecahan `' · '`. Jangan tulis corak yang menelan seluruh baris (contoh `^oleh (.+)$`).
- Teks paparan ditulis dalam BM dalam kod; terjemahan English berlaku pada DOM (MutationObserver). Teks dinamik perlukan corak dalam `EN_RULES`.
- **Google membuang komen JS sebelum menghantar halaman**, dan pembuang itu mudah keliru. Bila keliru, `//` dalam teks
  (cth. `'https://maps…'`) dianggap komen dan baki baris dipadam → `SyntaxError: Unexpected EOF` di iPhone (punca PR #5).
  Peraturan: dalam skrip, `//` dan `/*` hanya sebagai permulaan komen; dalam teks tulis `'https:\/\/…'`. Diuji oleh
  `tests/client.test.js`.
- Pelayan percuma (Overpass, Photon) sering menyekat server Google → carian sepanjang laluan & had laju dibuat dari
  TELEFON (kotak kecil, pelayan ditanya serentak), server hanya cuba Photon sekali.
- **Halaman kosong sejurus selepas deploy (13 Nov 2026, 2026.11.13-b):** app biasa jadi putih kosong di iPhone 2 minit selepas deploy,
  ditarik balik (PR #73). Kod yang SAMA, diletak dalam `IndexUji.html`, berfungsi di telefon yang sama, dan apabila disalin semula ke
  `Index.html` (PR #75) ia berfungsi juga selepas pemilik menunggu ~5 minit. Puncanya tidak dipastikan (disyaki kemas kini belum sampai
  ke telefon). Selepas deploy, minta pemilik tunggu ~5 minit dan tutup app sepenuhnya sebelum menganggapnya rosak.
  Jangan tarik balik terus jika kod yang sama sudah berfungsi di saluran uji.
- **PR #5 (2026.11.04-b) gagal di Safari iPhone** dengan `SyntaxError: Unexpected EOF (baris 1946)` walaupun lulus semua ujian
  dan sah dalam V8/acorn/esprima/QuickJS; ditarik balik dalam PR #6. Skrin ralat kini memaparkan diagnostik (panjang & hujung
  skrip yang diterima pelayar) untuk siasatan melalui saluran uji.
- **Had 200 versi Apps Script (19 Nov 2026):** setiap `clasp deploy` mencipta satu versi, dan satu projek hanya boleh ada 200. Bila penuh, langkah `deploy` gagal dengan
  "Cannot create more versions: Script has reached the limit of 200 versions" (`clasp push` sudah berjaya, tetapi `/exec` kekal pada versi lama; ujian tetap hijau).
  Pemilik padam versi lama di Apps Script (Project history, ikon jam; versi 1-60 dipadam 19 Nov, tinggal ~140). **Jangan padam versi yang digunakan deployment** (semak Deploy → Manage deployments;
  deployment aktif ialah "GitHub <komit>"). Kemudian GitHub Actions → larian yang gagal → Re-run failed jobs. Kadar 28 Okt-19 Nov ≈ 7 versi sehari, jadi **kelompokkan perubahan**
  dalam satu PR dan jangan salin ke app biasa terlalu kerap. Setiap merge ke `main` (termasuk PR dokumen sahaja dan komit data oleh bot) menjalankan deploy dan menggunakan satu versi.
- **Projek Apps Script pernah masuk Sampah (19 Nov 2026):** projek (terikat hamparan data; hamparan turut masuk Sampah) didapati dalam Sampah. App terus berjalan tetapi pencetus `cleanup` (dan sandaran mingguan)
  berhenti sejak 11 Nov. Dipulihkan dengan "Take out of trash" → "Restore project", kemudian `setup()` dijalankan semula (selamat diulang: ia membaca `SHEET_ID`, mengekalkan `TOKEN_SECRET`, dan memasang semula pencetus
  setiap jam); pencetus berjalan semula. Jika "Last run" pencetus di `script.google.com/home/triggers` lama, semak juga Sampah. Item Sampah luput kekal selepas lebih kurang 30 hari (tempoh tepat tidak pasti).
- **Mencari projek Apps Script yang betul:** ia terikat pada hamparan DATA ("JomRoute"), bukan hamparan "JalanKita — Sandaran" (hanya sandaran mingguan dalam Drive pemilik). Menekan Extensions → Apps Script
  dari hamparan lain mencipta projek KOSONG baharu: jangan guna. Cara paling cepat: `script.google.com/home/triggers` (baris `cleanup` membuka projek yang betul).
- **Kotak kebenaran lokasi iPhone:** muncul dari Chrome untuk alamat `...script.googleusercontent.com` (bukan kod JomRoute). Tetapan Chrome → Location = While Using the App sudah betul pada telefon pemilik;
  "Allow" sekali biasanya cukup.

## Ujian
```bash
npm test
```
- `npm test`: Node 20+, tanpa pakej tambahan. `tests/helpers.js` memuatkan `Code.gs` dalam `vm` dengan olok-olok `CacheService`
  (meniru tempoh luput & had 100 KB), `SpreadsheetApp` (`FakeSheet`), `LockService`, `PropertiesService`, `Session`,
  `Utilities` (HMAC sebenar) dan `Maps` (dalam ujian laluan).
- `loadCode()` menggantikan `verify_` (token = id). Ujian yang memerlukan token sebenar guna `ctx.verify_ = ctx.realVerify_`.
- `clientScript()` memulangkan skrip utama `Index.html` dengan tag templat diganti, untuk semakan sintaks dan ujian i18n.
- **Ujian pelayar**: `npm run test:browser` (`tests-browser/`, Playwright + Leaflet dari `devDependencies`, servis Apps Script
  olok-olok dalam `harness.js`). CI menjalankannya pada setiap PR (`browser` dalam `test.yml`). Ujian ini membuka
  `Index.html` dan `IndexUji.html`: permulaan BM/English, semua halaman tetapan, navigasi, lapor pantas, carian sepanjang
  laluan, had laju & kamera. Tambah ujian di sini untuk ciri klien baharu. Lulus di Chromium ≠ lulus di Safari iPhone.

## Keputusan yang sudah dibuat
- **Ikon skrin utama iPhone:** Apps Script tidak boleh menetapkan `apple-touch-icon`, jadi halaman pembuka `docs/index.html`
  (GitHub Pages, `https://s-k84.github.io/JOMROUTE/`) memberi ikon dan terus lompat ke `/exec`. `#pasang` memaparkan
  langkah pasang. Tambah ke skrin utama dari **Chrome** iPhone (Safari tidak dapat membuka web app Apps Script ini).
- **Jubin peta:** `tile.openstreetmap.org` (siang & malam). Malam: jubin OSM **dimalapkan** (`body.dark-map .leaflet-tile-pane`),
  bukan `invert` (jalan jadi hitam). CARTO kini memerlukan kunci API (jubin "API KEY REQUIRED", Nov 2026) — jangan guna
  tanpa akaun. MapTiler/Stadia (perlu akaun & kunci) ditangguh sehingga pemilik memutuskan.
- **Tulisan peta terbalik semasa peta berputar:** jubin OSM ialah gambar raster (tulisan dicetak dalam gambar), jadi ia berputar bersama
  peta (leaflet-rotate). Pemilik memilih KEKALKAN (A): butang kompas menetapkan peta tetap utara jika tulisan terbalik mengganggu.
  Peta vektor (MapLibre + OpenFreeMap, percuma tanpa kunci, tulisan sentiasa tegak) ditangguh; ia menukar enjin peta, jadi perlu
  melalui saluran uji dan ujian di iPhone.
- **Lampu isyarat & kamera laju:** pertanyaan Overpass dari telefon tidak boleh diharap (13 Nov 2026, versi uji 2026.11.07-f: 5 pelayan
  tamat masa walaupun pertanyaan kecil). Kini `.github/workflows/had-bulanan.yml` (`scripts/ambil_titik.py`, dari fail Geofabrik, bukan Overpass) mengambil semua titik
  Malaysia sebulan sekali ke `docs/data/titik.json` (GitHub Pages; kamera = `highway=speed_camera` atau `enforcement=maxspeed/average_speed`); klien membacanya dahulu (`loadTitik`), Overpass hanya sandaran.
  Kamera tambahan oleh pemilik: `data/kamera-tambahan.csv` (`lat,lng,nama`) digabung oleh `ambil_titik.py` (id negatif; yang < 30 m dari kamera OSM diabaikan).
  Selepas fail itu diubah (melalui PR), pemilik tekan Run workflow pada tugas bulanan supaya `titik.json` dikemas kini.
  Ini satu-satunya pengecualian "jangan commit terus ke `main`": bot hanya menyimpan fail data itu (bukan kod, tiada deploy). Jalan
  ber-`maxspeed` (had laju): tugas yang sama (`scripts/ambil_had.py`) memuat turun fail OSM Malaysia penuh dari Geofabrik
  (BUKAN Overpass: 13-14 Nov 2026 Overpass ambil 25-260 s setiap kawasan 0.25° → ~14 jam, dihentikan GitHub selepas 5.5 jam) dan menyimpan
  kawasan 0.25° ke `docs/data/had/<i>_<j>.json` + `indeks.json` (bot juga commit terus ke `main`, fail data sahaja); klien memuat hanya kawasan di
  sekitar laluan (`loadHad`), Overpass sandaran. Jalan di dalam pulau Singapura dibuang (`in_singapore`; kawasan itu 4.4 MB sendirian, bukan sasaran JomRoute). Ujian Python: `tests/py/test_ambil_had.py` (dijalankan oleh `npm test`).
  Had laju hanya ada di jalan yang OSM ada tanda `maxspeed`.
  Cadangan kamera pengguna: `suggestCamera` → Sheet `CadanganKamera` (dicipta malas oleh `camSugSheet_`), disemak pemilik dalam panel pentadbir (`adminOverview().camSug`, `adminResolveCamera`); pemilik menyalin baris CSV ke `kamera-tambahan.csv` melalui PR. Atau pemilik tekan "Terima" (`adminAcceptCamera` → Sheet `KameraDiterima`, dibaca semua pengguna melalui `getAcceptedCameras`, digabung dalam `titikElements` melalui `state.camOk`; ID `-(1000000+rand)`; app biasa 2026.11.17-d). Had kadar `camSug` mesti tetingkap <= 21600 s (cache maks 6 jam). Diuji oleh `tests/camsug.test.js`.
  Tempat (minyak, R&R, masjid, tandas, makan, ATM, caj EV, stesen) untuk "Cari sepanjang laluan" & "Berdekatan": `scripts/ambil_poi.py` (tugas bulanan yang sama)
  → `docs/data/poi/<kategori>/<i>_<j>.json`; klien `loadPoi` dahulu (tamat masa 4 s), kemudian server/Overpass/Photon sebagai sandaran. Kategori dalam
  `ambil_poi.py` mesti sama dengan `ALONG_Q` (diuji).
  Tugas bulanan (satu sahaja: `had-bulanan.yml`) membuka **isu GitHub** bila gagal (langkah `if: failure()`); uji dengan Run workflow + tanda `ujian_gagal`. Menu ☰ pemilik
  juga memaparkan tarikh data. GitHub mematikan tugas berjadual selepas 60 hari tanpa aktiviti repo: jika tarikh dalam menu lama, semak tab Actions.
- **Suara had laju (14 Nov 2026, aduan "terlalu kerap"):** "melebihi had laju" hanya selepas melebihi >= 8 s berterusan, ulang paling kerap 90 s, dan margin 3 km/j bila had
  automatik (OSM tidak tepat sepenuhnya; papan di skrin kekal 2 km/j). Sebutan had baharu hanya bila kekal >= 6 s, hanya PENURUNAN (kenaikan diingat sahaja), >= 60 s sejak sebutan lalu
  (`shouldWarnSpeeding`, `shouldSayLimit`; diuji oleh `tests/suara.test.js`). Kamera berturut-turut: kamera OSM dalam 300 m dikumpul (`nextCamera`); laporan pengguna "Kamera AES" dalam 300 m dari kamera yang sudah diamaran juga tidak diamaran lagi (`nearAlertedCam`, `noteCamAlert`; 2026.11.16-i, disalin ke app biasa 2026.11.16-j). Selepas melepasi kamera yang diamaran, kad "Kamera tadi masih ada?" (`checkCamGone`; 2026.11.17-b) menghantar laporan "tiada" ke Sheet `CadanganKamera` (Jenis `tiada`).
- **Zon kerap ada polis/kamera (17 Nov 2026):** `bumpHotspot_` (dalam kunci `submitReports`) → Sheet `ZonRawan`; `getHotspots` memulangkan zon dengan >= `HOTSPOT_MIN_USERS` pengguna berbeza; klien `checkHotspots` (dipanggil dari `checkHazards`). Tidak menambah kamera ke `titik.json`. Diuji oleh `tests/hotspot.test.js`. Disalin ke app biasa 2026.11.17-f (pemilik memilih salin sebelum ada zon sebenar untuk diuji di jalan).
- **Mercu tanda suara (17 Nov 2026, saluran uji 2026.11.17-p, app biasa 2026.11.17-q):** arahan 300 m ditambah ", berhampiran <nama>" bila stesen minyak/masjid bernama (data POI sedia ada, `landmarkFor`/`loadLandmarks`) dalam 40 m dari titik belok. Senyap jika data tiada. Disalin ke app biasa atas permintaan pemilik. **Disahkan di jalan 18 Nov 2026** (saluran uji 2026.11.18-e, app biasa 2026.11.18-f). Pembaikan: data POI menyimpan "Masjid / surau" / "Stesen minyak" bila OSM tiada nama (2,128 daripada 10,709 tempat), jadi `landmarkFor` mengabaikan nama am itu. Tidak disebut bila: laluan pendek (arahan 300 m perlu langkah > 400 m), atau tempat > 40 m dari belokan. Rakaman skrin iPhone tidak menangkap suara app (audio senyap), jadi hidupkan mikrofon semasa uji. Mod jimat bateri & import kamera AES JPJ dilangkau (iPhone tiada API bateri; senarai JPJ tiada koordinat).
- **Bahasa bila storan kosong (17 Nov 2026, saluran uji 2026.11.17-r, app biasa 2026.11.17-s):** iPhone kadang membuang storan, jadi `jk_voice` tiada. Skrin penutup `langWait` hanya 4 s; jika server `loadPrefs` lebih lambat, BM terpapar dahulu. Kini bahasa ditekaan dari `navigator.language` (bukan ms/id → English). Server tetap menentukan bahasa sebenar bila sampai.  Disalin ke app biasa atas permintaan pemilik.
- **Saiz teks Besar (18 Nov 2026, saluran uji 2026.11.18-a, app biasa 2026.11.18-b):** (1) `applyPrefs` tidak memanggil `applySetting('textSize')`, jadi bila storan telefon dibuang dan tetapan datang dari server, `big-text` tidak dipakai; (2) `body.big-text` menggunakan `zoom:1.18`, yang membesarkan lebar laci ☰ (86vw → 101vw) sehingga menutup seluruh skrin dan tiada ruang peta untuk disentuh bagi menutupnya; lebar laci dalam mod Besar kini `min(72vw,305px)`. Diuji oleh ujian pelayar.
- **Buang kamera salah (17 Nov 2026):** `adminRemoveCamera` (laporan "tiada" → buang dari `KameraDiterima` jika pernah diterima, selain itu id masuk Sheet `KameraSembunyi`); klien menapis `state.camHide` dalam `titikElements`. Id kamera dalam `titik.json` ialah `p[2]` (positif = OSM, negatif kecil = `kamera-tambahan.csv`, negatif besar = diterima pemilik). App biasa 2026.11.17-o.
- **Carian tempat & Google Places (18 Nov 2026):** `searchPlaces` cuba Photon (OSM) dahulu; Google Geocoder (alamat/jalan sahaja, BUKAN nama tempat) juga ditanya bila hasil < 3 atau tiada hasil yang mengandungi semua perkataan carian (`coversQuery_`, app biasa 2026.11.18-h; kunci cache `sp2_`). Klinik/pejabat yang tiada dalam OSM (cth. Klinik Kesihatan Beserah, Maritim Negeri Terengganu) tidak dijumpai mengikut nama. **Pemilik memutuskan TIDAK mengaktifkan `PLACES_API_KEY`** (takut risiko kos; Text Search Pro: 5,000 percuma sebulan, kemudian ~USD 32 setiap 1,000; had app `G_places` 60 setiap 6 jam ≈ 240 sehari ≈ 7,200 sebulan, jadi boleh melebihi kuota percuma). Jangan cadangkan Places lagi melainkan pemilik bertanya. Cara guna: tampal pautan Google Maps (Kongsi → Salin pautan) dalam kotak carian; klien memaparkan petua itu bila tiada hasil yang sepadan (`noFullMatch`, saluran uji 2026.11.18-j). Pilihan percuma yang belum dibina: `tempat-tambahan.csv` (nama, lat, lng) seperti `kamera-tambahan.csv`.
- **Halaman terpotong di kanan pada Android (18 Nov 2026, belum berulang):** punca tidak diketahui; skrin Android kemudian nampak normal tanpa tetapan diubah. Menu ☰ saluran uji (pemilik) memaparkan baris "Skrin: lebar …, halaman …, skala …" dan `noteSkrin` mencatat pada telefon (`jk_skrin`) bila halaman lebih lebar daripada skrin atau dizum. Bila ia berulang, minta pemilik tangkap baris itu dari `?uji=1`. Jangan ubah kod berdasarkan tekaan.
- **Ujian pelayar tidak boleh berjalan tanpa `node_modules`:** `npm ci` dahulu (tanpa itu ujian pelayar tamat masa pada `waitForFunction`, nampak seperti kod rosak). `scripts/__pycache__` dalam repo berubah bila ujian Python dijalankan; jangan commit perubahannya.
- **ID 30 hari:** pindah data perlu pengesahan pengguna ("Pulihkan data anda?"), kerana pelayar boleh dikongsi oleh akaun Google
  lain. Sekatan dipindah automatik. Data dipindah, bukan disalin.
- **Deploy:** `@google/clasp@2.4.2` dipin. `clasp login` pemilik juga guna versi ini (format `.clasprc.json` berbeza antara versi).
