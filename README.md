# NotchClone — Website

Landing page showcase untuk **NotchClone**, Windows Dynamic Island / notch overlay
untuk GTA San Andreas (SA-MP / open.mp).

Dibangun dengan **Vite + Tailwind CSS** (single-page, statis). Bahasa content: **Indonesia**.

## Struktur

```
website/
├── index.html            # Halaman landing utama
├── stats.html            # Halaman Statistik Player (leaderboard publik)
├── package.json
├── vite.config.js        # Multi-page (index + stats)
├── tailwind.config.js
├── postcss.config.js
├── src/
│   ├── main.js           # Entry landing + reveal-on-scroll
│   ├── stats.js          # UI leaderboard (fetch server, render per section)
│   ├── style.css         # Tailwind directives + animasi notch demo
│   ├── stats.css         # Gaya kartu & baris leaderboard
│   └── lib/
│       └── analyze.js    # Parser & agregasi data (pure, tanpa dependency)
└── .gitignore
```

## Halaman Statistik Player

`stats.html` adalah **leaderboard publik** untuk semua karakter yang diunggah
lewat aplikasi desktop (`Settings → Stats → Upload your character`). Halaman
membaca backend NotchClone:

1. `GET /api/characters` — daftar karakter publik.
2. `GET /api/characters/:slug` — snapshot file lengkap satu karakter.

Halaman ini berupa **tabel statistik**, bukan kartu:

- Tab section: **Job, Activity, Mechanic, Farmer, Truck, Taxi, Sidejob**.
- Chip detail per job: mis. Activity → Fishing / Forager / …, Sidejob → Miner /
  Baggage / …, Farmer → per tanaman.
- Klik judul kolom untuk mengurutkan (naik/turun).
- Kotak cari memfilter nama karakter.
- Maksimal **50 baris per halaman** (pilihan 10/25/50) dengan pager.

Rincian item otomatis menjadi kolom tersendiri: **miner → Gold, Diamond, Iron,
Silver**, **fishing → Laut, Sungai, Lake**, **farmer → per tanaman**, dan
**taxi → penumpang / delivery / bonus / duty / batal**. Setiap angka dihitung di
browser (`src/lib/analyze.js`), urutan & pagination di `src/lib/table.js`.
Tidak ada drag & drop atau file lokal di halaman ini.

### Konfigurasi server statistik

```bash
# website/.env.local (development) atau Environment Variable di Vercel
VITE_STATS_API_URL=https://notch-api.<domain-kamu>
```

Bila variabel ini kosong, build memakai URL produksi bawaan di `src/stats.js`.
CORS di backend mengizinkan origin mana pun untuk pembacaan; endpoint unggah
tetap memerlukan token dan hanya dipakai aplikasi desktop.

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