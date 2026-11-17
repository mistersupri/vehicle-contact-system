import type { CapacitorConfig } from '@capacitor/cli';

/**
 * APP_URL (build-time): alamat HTTPS server Vehicle Contact System.
 * Diisi  → aplikasi langsung memuat situs itu (satu origin: cookie sesi & WebSocket tetap bekerja).
 * Kosong → aplikasi menampilkan layar "alamat server" (www/index.html) saat pertama dibuka.
 */
const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');

const config: CapacitorConfig = {
  appId: 'com.vehiclecontact.app',
  appName: 'Vehicle Contact',
  webDir: 'www',
  android: { allowMixedContent: false },
  server: {
    androidScheme: 'https',
    // izinkan navigasi dari layar alamat server ke situs yang dipilih pengguna
    allowNavigation: appUrl ? [new URL(appUrl).host] : ['*'],
    ...(appUrl ? { url: appUrl, cleartext: false } : {}),
  },
};
export default config;
