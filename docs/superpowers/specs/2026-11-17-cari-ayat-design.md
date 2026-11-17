# Carian ayat bebas (ala "Ask Maps", versi kata kunci)

Tarikh: 17 Nov 2026. Saiz: perubahan kecil (klien sahaja, `IndexUji.html` dahulu).

## Niat
Pemilik mahu menaip ayat ringkas seperti "tandas dekat" atau "minyak di hadapan" dalam kotak carian dan terus mendapat senarai tempat,
tanpa memilih kategori satu demi satu. Terinspirasi Ask Maps (Google). Untuk kegunaan sendiri dahulu, digunakan **sebelum bertolak sambil
menaip** (mikrofon ditolak dalam app Apps Script, dan menaip semasa memandu tidak selamat).

## Matlamat
- Ayat BM / English yang hanya mengandungi **satu kategori** (+ perkataan pengisi) terus membuka carian sedia ada:
  - lalai: **berdekatan** (`nearbySearch`, 8 km dari lokasi semasa);
  - ada perkataan "depan / hadapan / sepanjang laluan / ahead / along" **dan** sedang bernavigasi: carian **di hadapan sepanjang laluan** (`searchAlong`).
- Kategori yang sedia ada sahaja: minyak, R&R, masjid/surau, tandas, makan, ATM, caj EV, stesen tren, stesen bas.
- Percuma, tiada API luar, tiada lokasi atau teks dihantar kepada pihak ketiga, tiada perubahan server.

## Bukan matlamat (versi pertama)
- Syarat bercantum ("R&R yang ada surau dan makan"): tiada data sepadan untuk disemak dengan jujur. Jika perlu, versi lain.
- Ulasan, waktu buka, penarafan (data tiada).
- Gemini / AI. Boleh disambung kemudian sebagai penterjemah ayat (Pendekatan B) jika kata kunci terasa terlalu kaku.
- Suara (mikrofon ditolak).

## Anti-matlamat (dianggap gagal walaupun berfungsi)
- **Merampas carian nama tempat.** "Masjid Sultan Ahmad Shah", "Surau Nur Hidayah", "Petronas Dengkil" mesti kekal carian nama seperti sekarang.
- Teka-teki yang senyap: ayat yang tak difahami jatuh ke carian nama (tingkah laku lama), bukan keputusan yang mengelirukan.

## Kekangan
- Hanya `IndexUji.html` (saluran uji), disahkan di telefon sebelum disalin ke `Index.html`.
- Teks baharu yang kelihatan perlu terjemahan EN (`EN`); komen BM; ujian mesti gagal pada kod lama.
- Tiada panggilan server baharu (jika ada, mesti ikut peraturan keselamatan CLAUDE.md).

## Pendekatan yang dipertimbangkan
- **A. Kata kunci (dipilih oleh pemilik):** padanan perkataan kepada 9 kategori sedia ada. Percuma, peribadi, cepat; kaku bagi ayat pelik.
- B. Gemini sebagai penterjemah ayat: faham ayat bebas, tetapi perlu kunci API, had kadar dan semakan syarat percuma Google; data tetap terhad.
- C. Ask Maps penuh (Gemini + Google Places): kaya tetapi Places berbayar dan berkuota; tidak sesuai.

## Keputusan reka bentuk (cadangan saya; pemilik boleh ubah)
1. **Fungsi tulen `parseCariAyat(teks)`** memulangkan `{ cat, ahead }` atau `null`. Mudah diuji tanpa pelayar.
2. **Padanan hanya jika SEMUA perkataan dikenali**: selepas membuang perkataan pengisi (dekat, berdekatan, di, yang, ada, cari, mana, tempat, near, nearest,
   find, me, the, a, nearby) dan perkataan hala ("depan", "hadapan", "laluan", "sepanjang", "ahead", "along"), semua perkataan yang tinggal mestilah sinonim satu kategori
   yang sama. Ada perkataan tak dikenali atau lebih dari satu kategori → `null` → carian nama lama.
3. **Sinonim (contoh awal, boleh ditambah):** minyak/petrol/pam/fuel/gas; r&r/rnr/rehat/hentian/rest; masjid/surau/solat/mosque/musolla; tandas/toilet/washroom/restroom;
   makan/makanan/kedai makan/restoran/kafe/cafe/food/lapar; atm/mesin; ev/caj/cas/charging; tren/keretapi/lrt/mrt/train; bas/bus.
4. **Titik pencetus:** dalam `doSearch()`, selepas semakan pautan lokasi dan sebelum `searchPlaces`. Tiada perubahan pada kotak carian lain.
5. **Arah "di hadapan"** hanya bila `state.navigating`; jika tidak bernavigasi, perkataan itu diabaikan dan carian berdekatan digunakan.
   Hasil "di hadapan" dipaparkan dengan membuka modal "Cari di sepanjang laluan" pada kategori itu (kod sedia ada), bukan paparan baharu.
6. **Tiada lokasi** (`state.me` kosong): tingkah laku `nearbySearch` sedia ada (toast "Lokasi anda belum diketahui").

## Diserahkan kepada pembina
Senarai sinonim akhir dan perkataan pengisi; penempatan tepat panggilan dalam `doSearch`; teks hint (jika ada) dan terjemahannya; nama ujian.
