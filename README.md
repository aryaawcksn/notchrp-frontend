# NotchClone — Website

Landing page showcase untuk **NotchClone**, Windows Dynamic Island / notch overlay
untuk GTA San Andreas (SA-MP / open.mp).

Dibangun dengan **Vite + Tailwind CSS** (single-page, statis). Bahasa content: **Indonesia**.

## Struktur

```
website/
├── index.html            # Halaman landing utama
├── stats.html            # Halaman Statistik Player (upload & rekap aktivitas)
├── package.json
├── vite.config.js        # Multi-page (index + stats)
├── tailwind.config.js
├── postcss.config.js
├── src/
│   ├── main.js           # Entry landing + reveal-on-scroll
│   ├── stats.js          # UI halaman statistik (upload, render, contoh data)
│   ├── style.css         # Tailwind directives + animasi notch demo
│   ├── stats.css         # Gaya chart & chip karakter
│   └── lib/
│       └── analyze.js    # Parser & agregasi data (pure, tanpa dependency)
└── .gitignore
```

## Halaman Statistik Player

`stats.html` menampilkan rekap aktivitas per karakter (mis. *"Fishing — 10 ikan ·
$100"*) dari dua sumber:

1. **Server statistik** — karakter yang diunggah aplikasi desktop lewat
   `Settings → Statistik → Upload sekarang` dibaca dari backend NotchClone
   (`GET /api/characters`, `GET /api/characters/:slug`). Aktif bila
   `VITE_STATS_API_URL` di-set saat build.
2. **File lokal** — drag & drop file JSON NotchClone (`activity.json`,
   `farmer.json`, `sidejob.json`, `mechanic.json`, `taxi.json`, `ledger.json`,
   `money.json`, `playtime.json`), atau tempel satu objek JSON manual. File ini
   dibaca di browser dan tidak dikirim ke mana pun.

Fitur lain: **Muat Contoh Data** (2 karakter demo), **multi-karakter** dengan
chip pemilih, dan tabel perbandingan antar karakter.

### Konfigurasi server statistik

```bash
# website/.env.local (development) atau Environment Variable di Vercel
VITE_STATS_API_URL=https://notch-api.<domain-kamu>
```

Kosongkan variabel ini untuk mode lokal murni (tanpa panel server). CORS di
backend mengizinkan origin mana pun untuk pembacaan; endpoint unggah tetap
memerlukan token dan hanya dipakai aplikasi desktop.

Logika agregasi di `src/lib/analyze.js` meniru tracker NotchClone
(`activity.js` / `sidejob.js` / `farmer.js` / `mechanic.js` / `taxi.js` /
`ledger.js` / `playtime.js`) sehingga angkanya konsisten dengan overlay.

## Menjalankan

```bash
cd website
npm install
npm run dev        # development server (http://localhost:5173)
```

## Build produksi

```bash
npm run build      # output statis ke dist/
npm run preview    # pratinjau hasil build
```

Hasil build (`dist/`) berisi dua halaman (`index.html` + `stats.html`) dan
bersifat statis dengan `base: './'`, sehingga bisa dibuka dari folder manapun
atau di-deploy ke GitHub Pages / Vercel / Netlify tanpa update path.

## Menyesuaikan konten

- Teks, section, dan mockup notch semuanya ada di `index.html`.
- Teks halaman statistik ada di `stats.html` dan `src/stats.js`.
- Warna aksen & font dikonfigurasi di `tailwind.config.js`.
- Animasi demo notch (equalizer, hover-expand) ada di `src/style.css`.