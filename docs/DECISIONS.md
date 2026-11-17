# Keputusan implementasi & penyimpangan dari PRD

Dokumen ini jujur tentang **apa yang sudah ada, apa yang disederhanakan, dan apa yang belum**.

## Penyimpangan dari stack PRD (dan alasannya)
| PRD | Yang dibangun | Alasan / jalur migrasi |
|---|---|---|
| PostgreSQL + Prisma | SQLite bawaan Node (`node:sqlite`), SQL langsung di `apps/api/src/db.ts` | Bisa langsung jalan tanpa layanan eksternal. Skema mengikuti §9 PRD (snake_case, UUID, soft delete). Migrasi: pindahkan `db.ts` ke Prisma/pg; query terpusat di rute. |
| Redis + BullMQ | Transactional outbox di tabel + worker in-process (`lib/notify.ts`) dengan retry 0/1/5/15 menit + jitter, klaim atomik, idempotency key | Semantik sama (outbox, retry, idempotensi). Rate limit memakai penyimpanan memori `@fastify/rate-limit` (tunggal-proses). Untuk >1 instance pakai Redis. |
| S3-compatible storage | Antarmuka `Storage` (`lib/storage.ts`) dengan implementasi disk lokal | Ganti implementasi dengan S3 SDK. Berkas tidak berada di folder publik; hanya lewat endpoint terotorisasi. |
| shadcn/ui | Komponen sendiri (`components/ui.tsx`) di atas Tailwind | Gaya khusus mengikuti referensi desain. |
| Upload via signed URL | Upload multipart ke API, validasi + sharp | Validasi isi file (bukan ekstensi), buang EXIF, thumbnail. |
| Argon2id/bcrypt | Argon2id (`@node-rs/argon2`) | Sesuai. |
| QR: simpan hash saja | Simpan **HMAC hash** (untuk pencarian) **+ token terenkripsi AES-256-GCM** | Diperlukan agar PRD VEH-06 (unduh ulang QR) bisa dipenuhi. Kunci `ENCRYPTION_KEY` melindunginya; tanpa kunci token tidak terbaca dari dump DB. |

## TURN
Prioritas server ICE (`apps/api/src/lib/ice.ts`): Cloudflare Realtime TURN → coturn sendiri → STUN saja. Kredensial Cloudflare diminta server lewat REST (TTL 4 jam, diperbarui tiap 2 jam, permintaan bersamaan digabung) dan tidak pernah memuat token API ke frontend. Bila Cloudflare gagal, panggilan tetap dibuat dengan STUN. **Terverifikasi hanya dengan simulasi (tes otomatis)**; belum diuji terhadap akun Cloudflare sungguhan karena butuh TURN key Anda — lakukan uji panggilan lintas jaringan seluler setelah kunci diisi.

## Belum diimplementasikan / perlu keputusan
- **Web Push** untuk panggilan saat tab tertutup: handler `push` ada di `public/sw.js`, tapi pengiriman VAPID di server belum dibuat. Saat ini panggilan berdering selama aplikasi/browser terbuka (UI menjelaskan batasan ini, PRD §13.2). Disarankan evaluasi aplikasi native/push-call pada fase lanjut.
- **PSTN produksi**: hanya antarmuka adapter + provider `mock`. Provider nyata (Twilio/Telnyx/SIP lokal) wajib proof of concept (nomor DID Indonesia, masking, regulasi, biaya) sebelum diaktifkan. Verifikasi OTP nomor penelepon (`/calls/:id/pstn/verify`) belum dibuat; yang ada: consent, validasi E.164, allowlist awalan negara, batas harian per kendaraan, rate limit, verifikasi HMAC webhook.
- **CAPTCHA/Turnstile adaptif**, **malware scanning** upload, **fingerprint perangkat**: belum. Anti-spam saat ini: rate limit per kendaraan/IP/sumber, cooldown, blokir sumber, `abuse_events`.
- **Email**: belum ada SMTP; tautan verifikasi/reset ditulis ke log (mode dev juga dikembalikan di respons API; **tidak di production**).
- **WhatsApp**: kirim pesan teks via Cloud API. Di luar jendela 24 jam Meta mewajibkan *template* yang disetujui — belum dibuat. Telegram: webhook `/start <token>` (set `setWebhook` dengan `secret_token`).
- Kebijakan privasi di `/privasi` adalah **draf operasional**, bukan teks hukum.
- Rekaman audit/retensi otomatis dan backup terjadwal: belum (lihat PRD §14.5).

## Keamanan yang sudah ada (teruji di `apps/api/test`)
Hash Argon2id; sesi cookie HttpOnly/SameSite + header CSRF kustom; otorisasi kepemilikan (404 untuk milik orang lain); QR 256-bit, dapat dicabut; nomor telepon terenkripsi AES-GCM & tidak dilog; EXIF/GPS dibuang; MIME divalidasi dari isi; rate limit; MFA TOTP wajib untuk admin; audit log; signaling WSS dengan token pendek & validasi keanggotaan tiap pesan; kredensial TURN sementara (HMAC); webhook telephony/WhatsApp/Telegram diverifikasi.
