# PRD — Vehicle Contact System (sesuai implementasi / *as-built*)

| | |
|---|---|
| **Versi dokumen** | 1.1 (as-built) |
| **Tanggal** | 18 November 2026 |
| **Rilis yang didokumentasikan** | v1.0.6 (`main` @ `b74c5ba`) |
| **Dasar** | PRD v1.0 Final (17 Nov 2026) — dokumen ini mencatat apa yang **benar-benar dibangun**, termasuk penyimpangan dan tambahan |
| **Dokumen terkait** | [DECISIONS.md](DECISIONS.md) · [ANDROID.md](ANDROID.md) · [TRUENAS.md](TRUENAS.md) · [screenshots/](screenshots/README.md) |

**Legenda status:** ✅ selesai dan teruji · 🟡 sebagian / dengan catatan · ⏳ belum dibuat · 🔬 ada tetapi belum terbukti di lingkungan nyata

---

## 1. Ringkasan produk

Vehicle Contact System memungkinkan siapa pun menghubungi pemilik kendaraan lewat **QR Code** yang ditempel pada kendaraan — **tanpa membuka nomor telepon atau email pemilik**. Pengunjung memindai QR (tanpa aplikasi, tanpa akun) lalu dapat mengirim **laporan + foto**, atau **menelepon lewat internet (WebRTC)**. Pemilik mengelola kendaraan, laporan, dan panggilan lewat **web/PWA** atau **aplikasi Android native**, dan dikabari lewat **WhatsApp** dan **Telegram**.

Platform yang dihasilkan:

| Komponen | Teknologi | Lokasi |
|---|---|---|
| Web + PWA (landing, halaman publik QR, dashboard pemilik, panel admin) | React 18, Vite, TypeScript, Tailwind | `apps/web` |
| API + signaling WebSocket + worker notifikasi | Node 22, Fastify 5, SQLite | `apps/api` |
| Aplikasi Android native (pemilik) | Kotlin, Jetpack Compose, WebRTC | `apps/android` |
| Deploy | Docker (GHCR), Cloudflare Tunnel, Cloudflare Realtime TURN | `Dockerfile`, `docker-compose*.yml` |

## 2. Tujuan dan prinsip

**Tujuan:** mempermudah komunikasi antara masyarakat dan pemilik kendaraan (parkir menghalangi, lampu menyala, darurat) tanpa mengungkap data pribadi; menyediakan catatan laporan/panggilan dan tindak lanjut; mendukung banyak pemilik dengan banyak kendaraan.

**Prinsip yang dipegang dalam implementasi:**
1. *Scan and contact* — pengunjung tidak perlu akun.
2. *Privacy by design* — nomor/email pemilik tidak pernah tampil publik; nomor telepon disimpan terenkripsi; IP hanya disimpan sebagai hash.
3. *Reliable delivery* — laporan selalu tersimpan walau notifikasi gagal (transactional outbox); kegagalan satu kanal tidak menghentikan kanal lain.
4. *Consent first* — panggilan telepon biasa butuh nomor penelepon dan persetujuan eksplisit; tidak ada pengalihan otomatis dari WebRTC ke PSTN.
5. *Abuse resistant* — rate limit berlapis, cooldown, blokir sumber, pelaporan penyalahgunaan.
6. *Honest UX* — UI menjelaskan batasan (mis. panggilan hanya berdering saat aplikasi aktif; email belum terkirim).

## 3. Peran dan hak akses

| Peran | Akses | Catatan implementasi |
|---|---|---|
| **Pengunjung/pelapor** | Halaman publik `/v/:token`, kirim laporan + foto, panggil WebRTC/PSTN, cek status laporan lewat referensi | Tanpa login. Identitas diganti `client_id` acak + hash IP untuk anti-spam |
| **Pemilik** | Kendaraan, QR, laporan, panggilan, notifikasi, pengaturan | Web/PWA dan Android. Otorisasi berbasis kepemilikan: data akun lain mengembalikan **404** |
| **Administrator** | Panel `/admin`: pengguna, kendaraan, laporan, panggilan, integrasi, penyalahgunaan, audit, pengaturan | Peran `SUPER_ADMIN`/`ADMIN`/`MODERATOR`; **MFA TOTP wajib**; dibuat hanya lewat CLI `npm run seed:admin` (belum ada UI pembuatan admin) |

## 4. Cakupan

**Termasuk (✅):** registrasi/login/verifikasi email/reset sandi; multi-kendaraan; QR unik (PNG/SVG, ganti, cabut); halaman publik; laporan + foto (EXIF dibuang); notifikasi WhatsApp/Telegram dengan retry; panggilan WebRTC; adapter PSTN (provider simulasi); dashboard pemilik; panel admin + audit; PWA; aplikasi Android native dengan panggilan layar penuh; email SMTP; CI/CD dan rilis otomatis.

**Belum (⏳):** Web Push (VAPID) di server; provider PSTN nyata; CAPTCHA/Turnstile; malware scan upload; backup terjadwal; penyimpanan objek S3; PostgreSQL/Redis; aplikasi iOS; tes emulator Android; UI pembuatan admin; kebijakan retensi otomatis. (Rincian di bagian 16.)

**Di luar lingkup (sesuai PRD awal):** video, perekaman panggilan, pembayaran, pelacakan lokasi, integrasi kepolisian, ANPR/OCR, reputasi pengemudi.

## 5. Alur utama

### 5.1 Registrasi pemilik
Daftar (nama, email, sandi ≥10 karakter huruf+angka) → server membuat akun `PENDING` dan mengirim **email verifikasi** (SMTP) → klik tautan (berlaku 24 jam, sekali pakai) → akun `ACTIVE` → login. Bila SMTP belum diatur, UI memberi tahu dan **admin dapat memverifikasi manual**. Respons registrasi identik untuk email yang sudah terdaftar (anti-enumerasi).

### 5.2 Pendaftaran kendaraan dan QR
Pemilik mengisi pelat, jenis, merek/model/warna (opsional), dan **nama tampilan publik** → sistem membuat token acak 256-bit → QR mengarah ke `https://<domain>/v/<token>` → unduh PNG/SVG, cetak stiker, bagikan, **ganti** (token lama langsung tidak berlaku) atau **cabut**.

### 5.3 Pengunjung mengirim laporan
Pindai QR → halaman kendaraan → pilih kategori → tulis pesan (≤1.000 karakter) → (opsional) hingga 3 foto, nama, nomor telepon → kirim → tampil **nomor referensi** (`VCS-XXXXXXXXXX`). Di server: laporan + riwayat status + event outbox disimpan dalam **satu transaksi**; worker membuat pengiriman per kanal aktif.

### 5.4 Panggilan WebRTC
Pengunjung menekan *Panggil melalui internet* → izin mikrofon → server memeriksa (kendaraan aktif, pengaturan pemilik, ketersediaan, jam tenang, panggilan aktif, cooldown) → sesi dibuat dan pemilik diberi tahu lewat WebSocket → pemilik menerima/menolak → SDP/ICE dipertukarkan lewat signaling → audio langsung antar-perangkat (STUN/TURN) → durasi dan alasan berakhir tercatat. Tidak dijawab dalam batas dering → *missed call* + notifikasi ke kanal pemilik.

### 5.5 Fallback panggilan
Tidak dijawab, ditolak, sibuk, pemilik offline/jam tenang, koneksi gagal, izin mikrofon ditolak → UI menawarkan **Kirim pesan**. Tidak pernah beralih ke PSTN otomatis.

### 5.6 Panggilan telepon biasa (PSTN)
Pengunjung memasukkan nomor (E.164) dan menyetujui kemungkinan biaya → validasi (consent, awalan negara, batas harian, tidak sibuk) → adapter provider membuat panggilan → status dari webhook (tanda tangan HMAC wajib). Saat ini hanya provider **simulasi**.

### 5.7 Pemilik menerima panggilan di Android
Layanan siaga menjaga WebSocket → panggilan masuk memicu **notifikasi layar penuh** + `CallActivity` di atas layar kunci → Terima/Tolak → audio WebRTC. Lihat bagian 12.

## 6. Persyaratan fungsional (as-built)

### 6.1 Autentikasi dan akun
| ID | Persyaratan | Status | Implementasi |
|---|---|---|---|
| AUTH-01 | Daftar nama/email/sandi | ✅ | Validasi: sandi ≥10 karakter, huruf+angka |
| AUTH-02 | Verifikasi email | ✅ | Token acak sekali pakai, 24 jam; email via SMTP |
| AUTH-03 | Login/logout | ✅ | Cookie `vcs_session` HttpOnly, SameSite=Lax, Secure (production), 30 hari |
| AUTH-04 | Reset sandi | ✅ | Tautan 1 jam, sekali pakai; semua sesi dicabut setelah reset |
| AUTH-05 | Lihat/ubah profil | 🟡 | Ubah nama dan ganti kata sandi; email tidak dapat diubah |
| AUTH-06 | Akhiri sesi/perangkat lain | ✅ | Daftar perangkat + "keluarkan lainnya" (web); `refresh` merotasi token |
| AUTH-07 | MFA admin | ✅ | TOTP (RFC 6238, ±1 jendela); enrol saat login pertama; 5 percobaan, tantangan 5 menit |
| AUTH-08 | Penghapusan akun | 🟡 | Langsung (soft delete, QR dicabut, kanal dimatikan) setelah konfirmasi sandi; belum ada alur retensi/penundaan |

### 6.2 Kendaraan dan QR
| ID | Persyaratan | Status | Implementasi |
|---|---|---|---|
| VEH-01/02 | Banyak kendaraan; tambah/ubah/hapus | ✅ | Hapus = soft delete + QR dicabut; riwayat laporan tetap |
| VEH-03 | Data kendaraan | ✅ | Pelat (huruf besar), jenis (Mobil/Motor/Truk/Bus/Lainnya), merek, model, warna, nama tampilan |
| VEH-04/08/09 | Aktif/nonaktif; nonaktif tidak menerima laporan/panggilan; riwayat tersimpan | ✅ | Halaman publik menampilkan "QR tidak aktif" (HTTP 410 untuk aksi) |
| VEH-05/06/07 | QR unik; unduh PNG/SVG; cabut & buat ulang | ✅ | Hanya satu QR aktif; riwayat QR disimpan (`replaced_by_id`) |
| — | Cetak stiker, bagikan tautan/PNG | ✅ | Tambahan (web & Android) |

### 6.3 Halaman publik
| ID | Persyaratan | Status |
|---|---|---|
| PUB-01..05 | Tanpa login; pelat, jenis, merek/model, warna, nama tampilan; tanpa telepon/email; tombol laporan & panggilan | ✅ |
| PUB-06 | Tombol PSTN bila diaktifkan dan provider siap | 🟡 (hanya provider simulasi) |
| PUB-07 | Status QR/kendaraan tidak aktif | ✅ (pelat disamarkan) |
| — | Penjelasan privasi, tautan kebijakan privasi, **lapor penyalahgunaan**; `noindex`; `cache-control: no-store` | ✅ |

### 6.4 Laporan dan pesan
| ID | Persyaratan | Status | Implementasi |
|---|---|---|---|
| REP-01/02/04 | Tanpa akun; kategori+pesan wajib; nama/telepon opsional | ✅ | 6 kategori (PARKING, ACCESS, LIGHT, EMERGENCY, DAMAGE, OTHER); admin dapat menambah/menonaktifkan |
| REP-03 | Pesan ≤1.000 karakter | ✅ | Divalidasi klien dan server |
| REP-05/06/07 | ≤3 foto, ≤5 MB, JPG/PNG/WebP | ✅ | |
| REP-08 | Validasi isi file, bukan ekstensi | ✅ | Dibaca dengan `sharp`; file bukan gambar/format lain ditolak |
| REP-09 | Hapus EXIF/GPS | ✅ | Re-encode; teruji memakai foto ber-GPS |
| REP-10 | Thumbnail + object storage | 🟡 | Thumbnail WebP 400px; foto ≤2000px; **disk lokal** (antarmuka `Storage`, siap diganti S3) |
| REP-11/12 | Pemilik melihat detail/foto, mengubah status | ✅ | Foto hanya lewat endpoint terotorisasi |
| REP-13 | Referensi tidak mudah ditebak | ✅ | `VCS-` + 10 karakter acak |
| REP-14 | Rate limit & anti-spam | 🟡 | Lihat 7.3; **CAPTCHA belum** |
| — | Status: `NEW`→`READ`(otomatis saat dibuka)→`IN_PROGRESS`→`RESOLVED`→`ARCHIVED`; setiap perubahan tercatat (riwayat + audit) | ✅ | |
| — | Blokir/buka blokir sumber pelapor per laporan | ✅ | Hash IP; laporan/panggilan berikutnya ditolak (403) |
| — | Status publik terbatas via referensi (`Diterima/Dilihat/Sedang ditangani/Selesai`) | ✅ | |

### 6.5 Notifikasi
| ID | Persyaratan | Status | Implementasi |
|---|---|---|---|
| NOT-01 | Hubungkan WhatsApp | 🟡 | Nomor + kode OTP 6 digit (10 menit, 5 percobaan); pengiriman via Cloud API **teks biasa** — template Meta belum |
| NOT-02 | Hubungkan Telegram | 🟡 | Token sekali pakai 15 menit; `/start <token>` lewat webhook ber-secret; bot sungguhan belum diuji 🔬 |
| NOT-03 | Aktif/nonaktif per kanal | ✅ | |
| NOT-04/09 | Notifikasi laporan baru & panggilan tak terjawab | ✅ | Isi: kendaraan, kategori, pesan (dipotong 300), waktu WIB, referensi, tautan dashboard |
| NOT-05/06/07 | Independen per kanal; status & percobaan tersimpan; retry terukur | ✅ | Outbox → worker (tick 2 dtk); percobaan 0 / 1 / 5 / 15 menit + jitter; maks 4 percobaan; kunci idempotensi `outbox:kanal` |
| NOT-08 | Uji koneksi | ✅ | Tombol "Kirim tes" |
| — | Status pengiriman: `PENDING`, `PROCESSING`, `SENT`, `RETRY_SCHEDULED`, `FAILED` (+ kode galat) | ✅ | Riwayat terlihat pemilik dan admin |
| — | Mode simulasi bila kredensial kosong (log) | ✅ | Tombol demo hanya di non-production |

### 6.6 Panggilan WebRTC
| ID | Persyaratan | Status | Implementasi |
|---|---|---|---|
| CALL-W-01/02 | Tanpa login; pemilik dapat mematikan | ✅ | Plus toggle "terima panggilan anonim" |
| CALL-W-03 | Periksa status kendaraan & ketersediaan | ✅ | Mode `ONLINE` (hanya bila pemilik terhubung), `ALWAYS`, `OFFLINE`; jam tenang (zona waktu) |
| CALL-W-04 | Panggilan masuk di perangkat pemilik | ✅ | Web: saat aplikasi terbuka; **Android: juga saat tertutup/terkunci** |
| CALL-W-05/06 | Terima/tolak/akhiri; audio dua arah | ✅🔬 | Teruji E2E browser (audio palsu); jaringan seluler nyata belum |
| CALL-W-07/08 | Signaling WSS; media tidak lewat WebSocket | ✅ | `/api/v1/call-signaling`, payload maks 64 KB |
| CALL-W-09 | STUN/TURN lintas NAT | 🔬 | Prioritas: **Cloudflare Realtime TURN** → coturn → STUN. Kredensial sementara; cache 4 jam (segarkan tiap 2 jam). Teruji dengan simulasi, belum dengan akun nyata |
| CALL-W-10/11 | Riwayat & durasi; tandai tak terjawab | ✅ | Status `RINGING/ACCEPTED/COMPLETED/MISSED/REJECTED/FAILED` + alasan + `call_events` |
| CALL-W-12 | Tawarkan pesan saat gagal | ✅ | |
| CALL-W-13 | Satu panggilan aktif per kendaraan | ✅ | Diperiksa dan dibuat dalam satu transaksi database (WebRTC); panggilan kedua mendapat `BUSY` |

Parameter bawaan: batas dering **45 dtk** (15–90), durasi maks **10 menit** (60–600), cooldown 30 dtk per penelepon, tanpa rekaman. Token signaling penelepon bertanda tangan HMAC berumur pendek; **setiap pesan memvalidasi keanggotaan sesi**. Panggilan yatim dibereskan saat server restart.

### 6.7 Panggilan PSTN
| ID | Status | Catatan |
|---|---|---|
| CALL-P-01..04 | ✅ | Toggle terpisah; nomor E.164; consent wajib; validasi + batas |
| CALL-P-05 | 🟡 | Adapter `createCall/getCallStatus/endCall/verifyWebhook/normalizeProviderEvent`; **hanya provider `mock`** |
| CALL-P-06 | 🟡 | Penyamaran bergantung provider (belum ada provider nyata) |
| CALL-P-07 | ✅ | Webhook `/webhooks/telephony/events`; **tanda tangan HMAC-SHA256 wajib** |
| CALL-P-08 | ✅ | Fallback ke pesan |
| CALL-P-09 | ✅ | Awalan negara diizinkan (bawaan `+62`), batas harian per kendaraan (5), rate limit |
| — | Verifikasi OTP nomor penelepon | ⏳ | |

### 6.8 Dashboard pemilik (web & Android)
Ringkasan (kartu laporan baru/kendaraan aktif/panggilan tak terjawab, laporan terbaru, grafik 7 hari di web) · Kendaraan · Laporan (filter status; web juga filter kendaraan/kategori/tanggal) · Detail laporan (foto, status, catatan, riwayat, blokir sumber) · Panggilan (riwayat, tak terjawab, status koneksi) · Notifikasi (kanal, tes, riwayat) · Pengaturan (panggilan, jam tenang, profil, keamanan, perangkat, hapus akun di web).

### 6.9 Panel admin (web)
| Fitur | Status |
|---|---|
| Statistik (pengguna, kendaraan, laporan, panggilan, antrean notifikasi, grafik 7 hari) | ✅ |
| Pengguna: cari/filter, tangguhkan/aktifkan, **verifikasi manual** pendaftar `PENDING` | ✅ |
| Kendaraan: cari/filter, tangguhkan/pulihkan, cabut QR | ✅ |
| Laporan: daftar + moderasi status | ✅ |
| Panggilan (metadata saja), penyalahgunaan (rate limit, cooldown, laporan warga), audit log (filter aksi) | ✅ |
| Kategori laporan (tambah/ubah/aktif-nonaktif) | ✅ (tanpa hapus) |
| Integrasi: Telegram, WhatsApp, **Email (SMTP)**, telephony, TURN; antrean dan kegagalan terbaru | ✅ |
| Pengaturan sistem: batas laporan, jendela waktu, cooldown panggilan, batas & awalan PSTN | ✅ (batas foto/ukuran tetap di kode) |
| Halaman detail pengguna/kendaraan terpisah; pembuatan admin lewat UI | ⏳ |

### 6.10 Email (tambahan)
SMTP via `nodemailer` (587 STARTTLS / 465 TLS); email HTML + teks; alamat penerima disamarkan di log; kegagalan tidak membatalkan permintaan (dicatat). Tanpa konfigurasi: development menulis ke log, production memberi peringatan saat start. Belum ada antrean/retry email.

## 7. Persyaratan nonfungsional

### 7.1 Keamanan dan privasi
| Area | Implementasi |
|---|---|
| Kata sandi | Argon2id; login tidak membocorkan keberadaan email (waktu & pesan sama) |
| Sesi | Cookie HttpOnly/SameSite=Lax/Secure; token di DB hanya sebagai HMAC; revoke massal |
| CSRF | Header kustom `x-requested-with: vcs` wajib pada semua request pengubah (kecuali webhook) |
| Otorisasi | Berbasis kepemilikan di semua endpoint kendaraan/laporan/panggilan (404 untuk milik orang lain); admin per peran |
| Token QR | 256-bit CSPRNG; pencarian via HMAC-SHA256; **disalin terenkripsi AES-256-GCM** agar bisa diunduh ulang (penyimpangan dari "hash saja") |
| Data sensitif | Nomor telepon (pelapor, pemilik, PSTN) dan tujuan notifikasi terenkripsi AES-256-GCM; tidak ditulis ke log; IP hanya hash |
| Upload | Validasi isi, ukuran, jumlah; nama acak; di luar folder publik; EXIF dibuang; akses lewat endpoint terotorisasi |
| WebRTC | WSS (di balik TLS), token signaling pendek, validasi keanggotaan tiap pesan, kredensial TURN sementara, DTLS-SRTP bawaan WebRTC, tanpa rekaman |
| Webhook | WhatsApp (X-Hub-Signature-256), Telegram (secret token), telephony (HMAC) diverifikasi |
| Header | `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`; halaman publik `noindex` |
| Production | Server **menolak start** bila `SESSION_SECRET`/`TOKEN_HASH_SECRET`/`ENCRYPTION_KEY` kosong |
| Audit | Login/logout/gagal, perubahan kendaraan/QR/laporan/kanal/pengaturan, aksi admin, event telephony |

### 7.2 Format galat
`{"error":{"code","message","request_id","fields"?}}`; 404 JSON untuk endpoint tak dikenal.

### 7.3 Rate limit dan anti-penyalahgunaan
Global 300/menit/IP · login & registrasi 10/10 menit · halaman publik 60/menit · unggah foto 20/10 menit (+30 foto yatim/jam per kendaraan) · laporan 10/10 menit/IP **dan** 5/10 menit/kendaraan (dapat diatur admin) **dan** jeda 2 laporan/menit/sumber · panggilan 6/10 menit/IP + cooldown 30 dtk · PSTN 3/10 menit/IP + 5/hari/kendaraan · verifikasi WhatsApp 10/10 menit. Kejadian dicatat di `abuse_events`. Batas disimpan **di memori** (satu instance).

### 7.4 Performa, ketersediaan, kompatibilitas
- **Performa:** tidak diukur (target LCP 2,5 dtk dan p95 500 ms dari PRD awal **belum dibuktikan**). Halaman publik memuat paket JS terpisah (kode dashboard/admin dimuat malas); foto diperkecil dan thumbnail dibuat.
- **Ketersediaan:** satu instance; tanpa HA. Backup otomatis **belum** (salin folder data; snapshot dataset TrueNAS disarankan).
- **Kompatibilitas:** browser modern (Android/iOS/desktop); PWA dapat dipasang; WebRTC butuh HTTPS + izin mikrofon; Android 8.0+ (API 26).
- **Aksesibilitas/bahasa:** Bahasa Indonesia; status memakai label teks (bukan hanya warna); atribut ARIA pada dialog/tab/status; **belum diaudit** formal.

## 8. Arsitektur (as-built)

```
 Pengunjung (browser, tanpa akun)         Pemilik: Web/PWA  ·  Android native
        │ HTTPS                                   │ HTTPS + WSS (cookie sesi)
        ▼                                         ▼
 ┌─────────────── Cloudflare Tunnel (tanpa IP publik) ───────────────┐
 │  Container "app" (Node 22, 1 proses)                              │
 │   • Fastify REST /api/v1  • WebSocket signaling  • file SPA       │
 │   • Worker notifikasi (outbox, retry)  • penyimpanan foto lokal   │
 │   • SQLite (WAL) + /data/uploads  ◄── volume persisten (TrueNAS)  │
 └───────────────────────────────────────────────────────────────────┘
      │ REST kredensial TURN        │ Cloud API / Bot API / SMTP
      ▼                             ▼
 Cloudflare Realtime TURN      WhatsApp · Telegram · Email
 (audio WebRTC langsung antar-perangkat; relay hanya bila perlu)
```

**Modular monolith** — modul: `auth`, `vehicles`/`qr`, `public`, `reports`, `notifications`, `calls` (+ signaling & telephony), `admin`, `audit`, `storage`, `mail`, `ice`.

### Penyimpangan dari stack PRD awal
| PRD awal | As-built | Alasan / jalur migrasi |
|---|---|---|
| PostgreSQL + Prisma | **SQLite** (`node:sqlite`), SQL langsung | Tanpa layanan eksternal; skema mengikuti PRD §9. Migrasi: pindahkan `db.ts` ke Prisma/pg |
| Redis + BullMQ | Outbox di tabel + worker in-process; rate limit di memori | Semantik sama; untuk >1 instance perlu Redis |
| S3 | Disk lokal di balik antarmuka `Storage` | Ganti implementasi dengan S3 SDK |
| shadcn/ui | Komponen sendiri (Tailwind) | Gaya khusus sesuai referensi desain |
| Nginx + coturn | Cloudflare Tunnel + Cloudflare Realtime TURN (Nginx/coturn tersedia sebagai opsi di `infra/`) | Deploy tanpa IP publik |
| Aplikasi native di luar lingkup | **Aplikasi Android native** dibangun | Kebutuhan panggilan saat aplikasi tertutup |
| Argon2id/bcrypt | Argon2id | Sesuai |

## 9. Model data

`users`, `sessions`, `email_verifications`, `password_resets`, `mfa_challenges`, `admin_users` · `vehicles`, `qr_codes` · `reports`, `report_attachments`, `report_status_histories`, `report_categories`, `blocked_sources` · `notification_channels`, `channel_link_tokens`, `outbox`, `notification_deliveries` · `calls`, `call_events`, `call_settings`, `telephony_sessions` · `audit_logs`, `abuse_events`, `system_settings`.

Konvensi: UUID, `snake_case`, waktu ISO-8601 UTC, soft delete (`deleted_at`) untuk pengguna/kendaraan. Perbedaan dari rancangan PRD: tabel `call_participants` dan `push_subscriptions` tidak dibuat (peserta dicatat di `calls`; Web Push belum ada); ditambah `mfa_challenges`, `channel_link_tokens`, `outbox`, `blocked_sources`, `report_categories`, `system_settings`; `qr_codes` memuat `token_encrypted`.

## 10. API

Basis `/api/v1`. Semua pengubah data wajib header CSRF (kecuali `/webhooks/*`).

| Grup | Endpoint |
|---|---|
| Auth | `POST /auth/register · login · logout · refresh · verify-email · resend-verification · forgot-password · reset-password · change-password · delete-account · mfa/verify` · `GET/PATCH /auth/me` · `GET /auth/sessions` · `POST /auth/sessions/revoke-others` |
| Kendaraan & QR | `GET/POST /vehicles` · `GET/PATCH/DELETE /vehicles/:id` · `POST /vehicles/:id/activate · deactivate · qr/regenerate · qr/revoke` · `GET /vehicles/:id/qr?format=png\|svg` |
| Publik | `GET /public/vehicles/:token` · `POST /public/vehicles/:token/uploads · reports` · `GET /public/reports/:reference` · `POST /public/calls · calls/pstn · abuse-reports` |
| Laporan | `GET /reports` · `GET /reports/:id` · `PATCH /reports/:id/status` · `POST /reports/:id/archive` · `GET /reports/:id/history` · `POST/DELETE /reports/:id/block-source` · `GET /attachments/:id[?thumb=1]` · `GET /dashboard/summary` |
| Notifikasi | `GET /notifications/channels · deliveries` · `PATCH /notifications/channels/:id` · `POST /notifications/telegram/connect · disconnect` · `POST /notifications/whatsapp/connect · verify` · `POST /notifications/test` (+ `telegram/simulate` hanya non-production) |
| Panggilan | `GET /calls/history · missed · :id` · `POST /calls/:id/accept · reject · end · cancel` · `GET/PATCH /call-settings` |
| Webhook | `GET/POST /webhooks/whatsapp` · `POST /webhooks/telegram · telephony/events` |
| Admin | `GET /admin/metrics · users · vehicles · reports · calls · abuse · categories · integrations · audit-logs · settings` · `PATCH /admin/users/:id/status · vehicles/:id/status · reports/:id/status · settings` · `PUT /admin/categories/:code` · `POST /admin/vehicles/:id/revoke-qr` |
| Sistem | `GET /health` |

### Protokol signaling (`/api/v1/call-signaling`)
Pemilik: cookie sesi. Penelepon: `?token=` bertanda tangan. Server→klien: `hello`, `call:invite`, `call:ringing`, `call:accept`, `call:reject`, `call:timeout`, `call:cancelled`, `call:taken`, `call:offer` (+ `ice_servers`), `call:answer`, `call:ice-candidate`, `call:end`, `call:error`. Klien→server: `call:accept`, `call:reject`, `call:end`, `call:offer`, `call:answer`, `call:ice-candidate`. Penelepon yang tersambung setelah panggilan berakhir tetap menerima alasan akurat.

## 11. Desain UI/UX

- **Bahasa visual:** monokrom hangat (`#101011`, `#EEEEEC`), mint (`#CDE8DA`) untuk sorotan/aksi utama, koral (`#E5645E`) untuk tolak/darurat; kartu sangat membulat; tab berbentuk pil; kartu gelap untuk elemen utama; font Plus Jakarta Sans — terinspirasi referensi desain aplikasi rapat yang diberikan.
- **Mobile-first** untuk halaman publik; dashboard responsif (sidebar desktop, navigasi bawah mobile).
- **Inventaris layar:** 86 tangkapan layar (desktop+mobile) mencakup landing, autentikasi, halaman publik (aktif, offline, tidak aktif, nonaktif, tidak dikenal), formulir laporan (kosong, validasi, terisi, sukses), panggilan (memanggil, terhubung, selesai, ditolak), seluruh dashboard pemilik dan panel admin — lihat [screenshots/README.md](screenshots/README.md).
- **PWA:** manifest (`start_url` `/app`), service worker men-cache shell (API tidak pernah di-cache); handler `push` ada tetapi pengiriman VAPID belum.

## 12. Aplikasi Android native

Ringkas — detail di [ANDROID.md](ANDROID.md).

| Aspek | Implementasi |
|---|---|
| Teknologi | Kotlin 2.0, Jetpack Compose (Material 3), OkHttp, kotlinx.serialization, Coil, `stream-webrtc-android`; minSdk 26, targetSdk 35 |
| Struktur | `:core` (Kotlin murni: model, klien API, signaling, `CallReducer`, backoff, cookie jar) + `:app` (UI & platform) |
| Panggilan tanpa FCM | `CallService` (foreground service `specialUse`) menjaga WebSocket (ping 25 dtk, sambung ulang eksponensial 1–15 dtk, segera saat jaringan pulih); aktif lagi setelah boot/pembaruan |
| Panggilan masuk | Notifikasi layar penuh kategori *call* (nada dering berulang, getar), `CallActivity` di atas layar kunci + layar menyala, tombol Terima/Tolak; tipe service naik ke `microphone` saat panggilan berlangsung |
| UI panggilan | Masuk, menyambung, berlangsung (timer, bisukan, speaker), selesai |
| Izin | Notifikasi, mikrofon, layar penuh (Android 14+), pengecualian baterai; kartu kesiapan di Ringkasan dan Pengaturan |
| Layar | Masuk/daftar/lupa sandi, Ringkasan, Kendaraan (+QR), Laporan (+detail), Panggilan, Notifikasi, Pengaturan. Admin tetap di web |
| Server bawaan | `https://vecs.kukode.in` (dari `-PserverUrl`/variabel `APP_URL`); dapat diubah di layar masuk |
| Penandatanganan | Kunci debug di repo (build saling meng-update); keystore rilis via GitHub Secrets (opsional) |

## 13. Konfigurasi dan deployment

**Variabel lingkungan** (lihat `.env.example`, `.env.truenas.example`): `NODE_ENV`, `PORT`, `APP_URL`, `TRUST_PROXY`, `DATA_DIR`, `DB_FILE` · rahasia `SESSION_SECRET`, `TOKEN_HASH_SECRET`, `ENCRYPTION_KEY` (wajib di production; **jangan diganti** setelah ada data) · TURN `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` (atau `WEBRTC_TURN_URL`/`WEBRTC_TURN_SECRET`, `WEBRTC_STUN_URL`) · email `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` · `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` · `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` · `TELEPHONY_PROVIDER` (`none`/`mock`), `TELEPHONY_WEBHOOK_SECRET` · `RETRY_SCHEDULE`, `SESSION_TTL_DAYS`, `WORKER_INTERVAL_MS`.

**Deployment target (TrueNAS, `vecs.kukode.in`):** `docker-compose.truenas.yml` = container `app` (image `ghcr.io/mistersupri/vehicle-contact-system`) + `cloudflared`; data di dataset persisten (`DATA_PATH` → `/data`); tanpa port dibuka, tanpa Nginx/coturn. Alternatif VPS ber-IP publik: `docker-compose.yml` (Nginx + coturn opsional). Panduan: [TRUENAS.md](TRUENAS.md).

## 14. CI/CD dan rilis

| Workflow | Pemicu | Isi |
|---|---|---|
| `release.yml` | push ke `main` (+ manual) | **Uji & build web** (typecheck, 16 tes API) → **Publish image ke GHCR** → **Build APK native** (+ tes `:core`) → **GitHub Release** `v1.0.<nomor run>` dengan APK. Publish & Release hanya di `main` |
| `android-ci.yml` | push yang mengubah `apps/android/**` | Tes `:core`, build APK debug, **verifikasi isi APK** (izin, service, flag layar kunci, WebRTC native), Android Lint (informasi) |

APK ditandatangani debug bila keystore belum diatur. `APP_URL` (variabel GitHub) menentukan server bawaan APK.

## 15. Pengujian dan verifikasi

| Lapisan | Cakupan | Status |
|---|---|---|
| API (`apps/api/test`) | **16 tes**: auth+CSRF, laporan end-to-end & otorisasi kepemilikan, rate limit, foto/EXIF, outbox+retry, signaling WebRTC lewat WebSocket nyata, PSTN+webhook, MFA admin, format galat, Cloudflare TURN (simulasi), **email via server SMTP nyata** | ✅ |
| Android `:core` | **23 tes**: protokol signaling, `CallReducer`, backoff, klien HTTP (MockWebServer), cookie jar, + **2 tes kontrak terhadap server API sungguhan** (semua endpoint, alur dering→terima→offer/ICE→answer→akhiri) | ✅ |
| Android `:app` | Terkompilasi di CI; verifikasi isi APK otomatis; Lint 0 error | ✅ |
| E2E browser (Chromium, dua konteks) | Login, laporan+foto, panggilan WebRTC tersambung, tolak→fallback, MFA admin, mobile — **dijalankan manual** (skrip tidak disimpan di repo); hasilnya terdokumentasi lewat 86 tangkapan layar | 🟡 |
| Perangkat Android nyata | Layar penuh di atas layar kunci, optimasi baterai, audio, TURN di jaringan seluler | ⏳ **belum diuji** |
| Beban, performa (LCP/p95), pentest, aksesibilitas formal | — | ⏳ |

## 16. Keterbatasan, risiko, dan utang teknis

| # | Hal | Dampak / catatan |
|---|---|---|
| 1 | Satu instance (SQLite, rate limit memori, worker in-process) | Tidak untuk >1 replika; migrasi ke Postgres+Redis bila perlu |
| 2 | Foto di disk lokal; **tidak ada pembersihan unggahan yatim** (foto yang diunggah tetapi laporan tidak jadi) | Penggunaan disk bertambah pelan; perlu job pembersih |
| 3 | Tanpa backup otomatis dan kebijakan retensi | Gunakan snapshot dataset; tetapkan retensi sebelum produksi publik |
| 4 | Web Push belum ada | Panggilan di web/PWA hanya berdering saat tab/aplikasi aktif; solusi: aplikasi Android |
| 5 | PSTN hanya simulasi; OTP nomor penelepon belum ada | Wajib proof of concept provider sebelum diaktifkan |
| 6 | CAPTCHA/Turnstile, malware scan upload belum | Mitigasi: rate limit berlapis, blokir sumber |
| 7 | WhatsApp: tanpa template Meta (di luar jendela 24 jam pesan bisa ditolak); Telegram bot nyata belum diuji | 🔬 |
| 8 | Cloudflare TURN belum diuji dengan akun/jaringan seluler nyata | 🔬 |
| 9 | Email tanpa antrean/retry | Pengguna dapat meminta kirim ulang |
| 10 | Android: butuh notifikasi tetap; pabrikan tertentu dapat mematikan layanan; APK debug 54 MB tanpa minify; Play Store belum disiapkan | Lihat ANDROID.md |
| 11 | Dokumen kebijakan privasi (`/privasi`) adalah **draf operasional**, bukan teks hukum | Perlu finalisasi legal |
| 12 | Penghapusan akun langsung (soft delete); tidak ada ekspor data | Sesuaikan dengan regulasi data pribadi |
| 13 | Satu bahasa (Indonesia); tanpa i18n | |
| 14 | Admin hanya dibuat lewat CLI; tanpa daftar sesi admin | |

## 17. Usulan peta jalan

1. **Uji perangkat Android nyata** + perbaikan (prioritas tertinggi).
2. Backup terjadwal + pembersih unggahan yatim + kebijakan retensi.
3. Provider PSTN nyata (proof of concept) atau keputusan menunda.
4. Web Push (VAPID) untuk PWA; template WhatsApp.
5. Postgres/Redis/S3 bila beban atau kebutuhan HA muncul.
6. Antrean email, CAPTCHA adaptif, audit aksesibilitas, ukur performa.
7. Distribusi Android (ABI split/R8, keystore rilis, kebijakan Play Store), aplikasi iOS bila dibutuhkan.

---

## Lampiran A — Pelacakan terhadap PRD v1.0

| Bagian PRD v1.0 | Status |
|---|---|
| §5.1 AUTH-01..08 | ✅ ×6, 🟡 ×2 (AUTH-05, AUTH-08) |
| §5.2 VEH-01..09 | ✅ semua |
| §5.3 PUB-01..07 | ✅ ×6, 🟡 PUB-06 |
| §5.4 REP-01..14 | ✅ ×12, 🟡 REP-10, REP-14 |
| §5.5 NOT-01..09 | ✅ ×7, 🟡 NOT-01, NOT-02 |
| §5.6 CALL-W-01..13 | ✅ ×12, 🔬 CALL-W-09 (sebagian 🔬 pada 05/06) |
| §5.7 CALL-P-01..09 | ✅ ×7, 🟡 ×2 (P-05, P-06); verifikasi OTP nomor penelepon ⏳ (di luar daftar ID) |
| §5.8 Dashboard pemilik | ✅ |
| §5.9 Dashboard admin | ✅ dengan catatan 6.9 |
| §6 Nonfungsional | Keamanan ✅ · performa/ketersediaan ⏳ · aksesibilitas 🟡 |
| §7 Keamanan | ✅ (CAPTCHA, malware scan ⏳) |
| §8–9 Arsitektur & DB | 🟡 disederhanakan (SQLite, tanpa Redis/S3) |
| §10 API | ✅ ditambah endpoint (sesi, abuse, call-settings, dashboard, admin) |
| §11 UI/UX | ✅ |
| §12 Notifikasi/jobs | ✅ |
| §13 Panggilan & telephony | ✅ WebRTC · 🟡 PSTN |
| §14 Deployment | 🟡 diganti Cloudflare Tunnel/TrueNAS; backup ⏳ |
| §15 Observabilitas | 🟡 log terstruktur dengan `request_id`; metrik/uptime monitoring eksternal ⏳ |
| §16 Acceptance criteria | Terpenuhi untuk akun, laporan, notifikasi (simulasi), WebRTC (E2E browser), keamanan; PSTN nyata & uji jaringan seluler ⏳ |

**Tambahan di luar PRD v1.0:** aplikasi Android native (panggilan layar penuh tanpa Firebase), integrasi Cloudflare Realtime TURN, pengiriman email SMTP, verifikasi manual oleh admin, pelaporan penyalahgunaan publik, blokir sumber, PWA, CI/CD dengan rilis otomatis, deployment TrueNAS, dokumentasi tangkapan layar.
