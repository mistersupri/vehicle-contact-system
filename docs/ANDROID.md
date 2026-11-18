# Aplikasi Android (native)

Kotlin + Jetpack Compose, **tanpa Firebase/FCM**. Panggilan masuk berdering layar penuh walau aplikasi ditutup atau layar terkunci.

## Cara kerja panggilan masuk
```
Pengunjung memindai QR ──► server (WebSocket signaling) ──► CallService (foreground service) ──► notifikasi layar penuh ──► CallActivity
                                                                  ▲ menjaga 1 koneksi WebSocket tetap hidup (ping 25 dtk, sambung ulang otomatis)
```
- **`CallService`** (foreground service tipe `specialUse`) menjaga koneksi ke `wss://…/api/v1/call-signaling`. Konsekuensinya Android **mewajibkan notifikasi tetap** ("Siap menerima panggilan").
- Saat ada panggilan: notifikasi **layar penuh** (kategori *call*, nada dering berulang, getar) + `CallActivity` yang tampil di atas layar kunci dan menyalakan layar. Tombol **Terima / Tolak** juga ada di notifikasi.
- Setelah diterima: service naik ke tipe `specialUse|microphone`; audio WebRTC langsung antar-perangkat (STUN/TURN Cloudflare yang diberikan server di pesan `call:offer`).
- Logika status panggilan ada di modul **`core`** (`CallReducer`) — Kotlin murni sehingga diuji tanpa perangkat.

## Izin yang diminta (layar *Ringkasan*/*Pengaturan* → kartu "Siapkan penerimaan panggilan")
| Izin | Fungsi |
|---|---|
| Notifikasi (`POST_NOTIFICATIONS`, Android 13+) | Menampilkan panggilan masuk |
| Mikrofon (`RECORD_AUDIO`) | Menjawab panggilan |
| Layar penuh (`USE_FULL_SCREEN_INTENT`, Android 14+: pengguna perlu mengaktifkan di Pengaturan) | Panggilan di atas layar kunci |
| Abaikan optimasi baterai (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) | Agar koneksi siaga tidak dimatikan sistem |
| `FOREGROUND_SERVICE(_SPECIAL_USE/_MICROPHONE)`, `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED` | Layanan siaga, menyalakan layar, aktif lagi setelah restart |

> **Pabrikan tertentu** (Xiaomi, Oppo, Vivo, Huawei, Samsung) punya pengaturan "Mulai otomatis"/"Aplikasi latar belakang" sendiri yang bisa mematikan layanan walau izin baterai diberikan. Aktifkan untuk aplikasi ini. Ini batasan Android, bukan bug aplikasi.

## Layar
Tab bawah: Beranda · Kendaraan · Laporan · Panggilan · Akun. Masuk/Daftar/Lupa sandi · Beranda · Kendaraan (tambah/ubah/QR/bagikan/ganti/cabut) · Laporan (filter, detail, foto, ubah status, riwayat) · Panggilan (riwayat, status koneksi) · Notifikasi (Telegram/WhatsApp/Email) · Akun (siaga, ketersediaan, notifikasi mendesak, jam tenang, keluar). Akun **admin** tetap lewat web (butuh MFA).

## Notifikasi Mendesak (bukan panggilan)
Event `alert:urgent` dari server menampilkan **`AlertActivity`** (layar penuh di atas layar kunci, menyalakan layar) + notifikasi saluran *Notifikasi mendesak* (`CATEGORY_ALARM`, full-screen intent, getar, **tanpa nada dering berulang, tanpa audio/mikrofon/WebRTC**). Tombol *Lihat Laporan* membuka aplikasi; *Tutup* menutup. `alert:dismiss` (laporan sudah ditangani di perangkat lain) menutupnya otomatis. Logika murni ada di `CallReducer` (`ShowAlert`/`DismissAlert`) dan diuji di JVM.

## Build & uji
```bash
cd apps/android
./gradlew :core:test                                  # tanpa Android SDK (JVM murni)
VCS_TEST_URL=http://localhost:4000 ./gradlew :core:test   # + tes kontrak ke server nyata (npm run seed:demo && npm start)
./gradlew :app:assembleDebug                          # butuh Android SDK (ANDROID_HOME)
```
Alamat server bawaan: `-PserverUrl=https://vecs.kukode.in` (di CI dari variabel GitHub `APP_URL`); bisa diubah di layar masuk ("Server").

## Penandatanganan
- Tanpa keystore: APK memakai **kunci debug yang disimpan di repo** (`app/debug.keystore`) — build berbeda tetap bisa saling meng-update tanpa uninstall. Cukup untuk pemasangan manual.
- Rilis resmi: isi secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (opsional). Jangan ganti kunci setelah dibagikan — pengguna harus uninstall.
- **Dari APK Capacitor lama (v1.0.x) ke native:** kunci debug CI lama berbeda, jadi **uninstall dulu** aplikasi lama sebelum memasang yang baru.

## Yang terbukti dan yang belum
**Terbukti (otomatis):** 23 tes `:core` (protokol, reducer panggilan, klien HTTP, cookie) termasuk 2 tes kontrak terhadap server API sungguhan (login, semua endpoint, alur signaling dering→terima→offer/ICE→answer→akhiri); aplikasi **terkompilasi**; CI memeriksa APK memuat izin, service, flag layar-kunci (`showWhenLocked`, `turnScreenOn`), dan pustaka native WebRTC; Lint 0 error.

**Belum terbukti — butuh perangkat sungguhan:** layar penuh di atas layar kunci, perilaku optimasi baterai tiap pabrikan, kualitas audio dan rute (earpiece/speaker/Bluetooth), WebRTC melalui TURN di jaringan seluler, dan UI Compose secara visual. Belum ada tes instrumentasi/emulator.

## Batasan yang diketahui
- Ada notifikasi tetap selama mode siaga aktif (dapat dimatikan di *Pengaturan*, dengan konsekuensi panggilan hanya berdering saat aplikasi terbuka).
- Koneksi siaga memakai sedikit baterai; Android 15 membatasi layanan latar belakang jenis tertentu — `specialUse` dipilih karena tidak dibatasi durasi, tetapi kebijakan Android dapat berubah.
- Debug APK ±54 MB (3 arsitektur CPU + WebRTC, tanpa minify). Rilis dapat dikecilkan dengan ABI split/R8.
- Distribusi Play Store belum disiapkan (izin full-screen-intent dan layanan latar belakang punya aturan kebijakan khusus).
