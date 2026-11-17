# Vehicle Contact System

Hubungi pemilik kendaraan lewat **QR Code** — tanpa membuka nomor pribadi. Pengunjung memindai QR, lalu mengirim **laporan + foto** atau **menelepon lewat internet (WebRTC)** tanpa akun. Pemilik mengelola semuanya lewat dashboard (web/PWA) dan dikabari via WhatsApp/Telegram. Berdasarkan `Vehicle Contact System — PRD v1.0`.

* **Web/PWA** (`apps/web`): React + Vite + TypeScript + Tailwind. Landing, halaman publik `/v/:token`, dashboard pemilik `/app`, panel admin `/admin`. Dapat dipasang (manifest + service worker).
* **API** (`apps/api`): Node 22 + Fastify, REST `/api/v1`, signaling WebSocket `/api/v1/call-signaling`, worker notifikasi (outbox + retry).
* Desain: monokrom hangat, kartu membulat besar, aksen mint & koral, tab pil — terinspirasi referensi yang Anda berikan.

## Menjalankan (pengembangan)
Butuh Node ≥ 22.13.
```bash
npm install
npm run seed:demo        # data contoh: pemilik, admin, 2 kendaraan, laporan
npm run dev              # web http://localhost:5173  ·  api http://localhost:4000
```
Akun demo: `demo@example.com` / `Demo12345!` (pemilik) dan `admin@example.com` / `Admin12345!` (admin, **MFA**: pindai QR di layar login pertama dengan aplikasi authenticator).
Tanpa SMTP/WhatsApp/Telegram, sistem berjalan **mode simulasi** (email & pesan ditulis ke log; tombol demo tersedia di halaman Notifikasi).

Admin sungguhan: `npm run seed:admin -- email@anda.com "KataSandiKuat123" "Nama"`.

## Produksi
```bash
cp .env.example .env     # isi rahasia; APP_URL = domain HTTPS Anda
docker compose up -d --build
```
`npm run build && npm start` menyajikan web + API dari satu proses (restart server setelah rebuild). HTTPS wajib (mikrofon/WebRTC). Siapkan **TURN** agar panggilan jalan di jaringan seluler. Tanpa IP publik: pakai **Cloudflare Realtime TURN** (isi `CLOUDFLARE_TURN_KEY_ID` dan `CLOUDFLARE_TURN_API_TOKEN`; kredensial sementara diambil server, cache 2 jam). Alternatif: coturn sendiri (`infra/coturn`).

## Pengujian
```bash
npm test            # 9 tes integrasi API (auth, otorisasi, foto/EXIF, outbox+retry, WebRTC signaling, PSTN, MFA admin)
npm run typecheck
```
Alur penuh juga telah diuji di browser nyata (Chromium, dua konteks: pemilik & pengunjung) termasuk panggilan WebRTC tersambung dan fallback pesan.

## Penting: cakupan & penyimpangan
Baca **[docs/DECISIONS.md](docs/DECISIONS.md)**: SQLite menggantikan PostgreSQL/Redis/S3 untuk kemudahan menjalankan (dengan jalur migrasi), Web Push & PSTN produksi belum aktif, dan daftar lengkap yang belum dibuat.
