# Deploy di TrueNAS (tanpa IP publik) — `vecs.kukode.in`

Arsitektur: **Cloudflare Tunnel** membawa trafik HTTPS/WebSocket ke container `app`; audio panggilan memakai **Cloudflare Realtime TURN**. Tidak ada port yang dibuka di router, tidak perlu Nginx/Let's Encrypt/coturn.

## 1. Siapkan di Cloudflare
1. **Tunnel:** Zero Trust → Networks → Tunnels → *Create tunnel* (Cloudflared). Salin **token** → `TUNNEL_TOKEN`.
   Di tab *Public Hostname*: hostname `vecs.kukode.in`, service **HTTP** → `app:4000`. (WebSocket otomatis didukung.)
2. **TURN:** Dashboard → Realtime → TURN → buat key. Salin **Key ID** dan **API token** → `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`.

## 2. Siapkan di TrueNAS
1. Buat dataset untuk data, mis. `tank/apps/vecs`.
2. Taruh `docker-compose.truenas.yml` dan `.env` (dari `.env.truenas.example`) di satu folder; isi `DATA_PATH`, tiga secret, token tunnel, dan kunci TURN.
3. Image GHCR kemungkinan **private**: login sekali dengan token GitHub (`read:packages`):
   `echo $TOKEN | docker login ghcr.io -u mistersupri --password-stdin` — atau jadikan paket *public* di GitHub → Packages.
4. Jalankan: `docker compose -f docker-compose.truenas.yml up -d` (atau tempel isinya di *Apps → Install via YAML*).

## 2b. Email (SMTP)
Verifikasi email dan reset kata sandi dikirim lewat SMTP. Isi di `.env`:
```
SMTP_HOST=smtp.contoh.com
SMTP_PORT=587          # 587 = STARTTLS · 465 = TLS langsung (set SMTP_SECURE=true)
SMTP_USER=...
SMTP_PASSWORD=...
MAIL_FROM=Vehicle Contact <no-reply@kukode.in>
```
Pilihan penyedia: SMTP dari hosting domain Anda, Brevo, Mailjet, Resend, atau Gmail dengan *App Password* — cek batas kirim gratisnya. Agar email tidak masuk spam, atur SPF/DKIM untuk domain pengirim.
Cek: *Admin → Integrasi → Email (SMTP)* harus *Terkonfigurasi*; daftarkan akun uji dan periksa kotak masuk. Kegagalan kirim muncul di log: `docker compose logs app | grep "\[mail\]"`.

## 3. Buat akun admin
```bash
docker compose -f docker-compose.truenas.yml exec app npm run seed:admin -- email@anda.com "KataSandiKuat123" "Nama"
```
Login di `https://vecs.kukode.in/admin/login`; pindai QR MFA saat login pertama.

## 4. Cek
- `https://vecs.kukode.in/api/v1/health` → `{"status":"ok"}`
- Admin → Integrasi → baris **STUN/TURN** harus berstatus *Cloudflare Realtime TURN*.
- Uji panggilan dengan pemilik dan pengunjung di **jaringan berbeda** (Wi-Fi vs data seluler).

## Catatan
- **Backup:** cukup salin folder `DATA_PATH` (database `vcs.db` + `uploads/`), idealnya lewat snapshot dataset TrueNAS. Simpan juga nilai `ENCRYPTION_KEY`.
- **Pembaruan:** `docker compose -f docker-compose.truenas.yml pull && docker compose -f docker-compose.truenas.yml up -d`.
- **Email:** isi `SMTP_*` dan `MAIL_FROM` di `.env` (lihat bagian *Email* di atas). Tanpa SMTP, pendaftar baru tidak menerima email verifikasi; admin bisa memverifikasi manual di *Admin → Pengguna → Verifikasi manual*.
- Satu instance saja (SQLite + rate limit di memori). Jangan menjalankan lebih dari satu replika.
