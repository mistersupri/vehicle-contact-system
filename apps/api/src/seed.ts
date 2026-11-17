import { all, get, now, run } from './db.ts';
import { encrypt, hashPassword, hmac, newTotpSecret, randomToken, uuid, encrypt as enc } from './lib/security.ts';
import { enqueue } from './lib/notify.ts';
import { publicReference } from './lib/security.ts';
import { publicUrl } from './routes/vehicles.ts';
import { decrypt } from './lib/security.ts';

async function ensureUser(name: string, email: string, password: string) {
  const ex = get<any>('SELECT * FROM users WHERE email=?', email);
  if (ex) return ex.id as string;
  const id = uuid();
  run("INSERT INTO users(id,name,email,password_hash,status,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,'ACTIVE',?,?,?)", id, name, email, await hashPassword(password), now(), now(), now());
  return id;
}
function ensureAdmin(userId: string, role = 'SUPER_ADMIN') {
  if (!get('SELECT 1 FROM admin_users WHERE user_id=?', userId)) {
    run('INSERT INTO admin_users(id,user_id,role,mfa_enabled,totp_secret_encrypted,created_at) VALUES (?,?,?,0,?,?)', uuid(), userId, role, enc(newTotpSecret()), now());
  }
}

const [, , mode, ...args] = process.argv;
if (mode === 'admin') {
  const [email, password, name = 'Administrator'] = args;
  if (!email || !password) { console.error('Pemakaian: npm run seed:admin -- email@contoh.com "KataSandiKuat123" ["Nama"]'); process.exit(1); }
  const id = await ensureUser(name, email.toLowerCase(), password);
  ensureAdmin(id);
  console.log(`Admin dibuat: ${email}\nMFA wajib: saat login pertama, pindai kode QR yang tampil di layar login untuk mendaftarkan aplikasi authenticator.`);
} else if (mode === 'demo') {
  const owner = await ensureUser('Budi Santoso', 'demo@example.com', 'Demo12345!');
  const adminId = await ensureUser('Admin Demo', 'admin@example.com', 'Admin12345!');
  ensureAdmin(adminId);
  if (!get('SELECT 1 FROM vehicles WHERE user_id=?', owner)) {
    const mk = (plate: string, type: string, brand: string, model: string, color: string) => {
      const id = uuid(); const token = randomToken(32);
      run('INSERT INTO vehicles(id,user_id,plate_number,vehicle_type,brand,model,color,owner_display_name,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', id, owner, plate, type, brand, model, color, 'Budi S.', 'ACTIVE', now(), now());
      run('INSERT INTO qr_codes(id,vehicle_id,token_hash,token_encrypted,created_at) VALUES (?,?,?,?,?)', uuid(), id, hmac(token, 'qr'), encrypt(token), now());
      return id;
    };
    const v1 = mk('B 1234 XYZ', 'Mobil', 'Toyota', 'Avanza', 'Putih');
    mk('D 5678 ABC', 'Motor', 'Honda', 'Vario 160', 'Hitam');
    const samples: [string, string, string, string, string][] = [
      ['ACCESS', 'Mobil menghalangi pintu keluar basement, mohon dipindahkan.', 'NEW', 'Rina', '-30'],
      ['LIGHT', 'Lampu depan masih menyala.', 'NEW', '', '-95'],
      ['PARKING', 'Parkir menutup sebagian garasi rumah nomor 12.', 'IN_PROGRESS', 'Pak Dedi', '-1500'],
      ['OTHER', 'Spion kiri terlipat, sudah saya rapikan.', 'RESOLVED', '', '-4000'],
    ];
    for (const [cat, msg, st, who, mins] of samples) {
      const rid = uuid(); const at = new Date(Date.now() + Number(mins) * 60000).toISOString();
      run('INSERT INTO reports(id,public_reference,vehicle_id,category,message,status,reporter_name,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', rid, publicReference('VCS'), v1, cat, msg, st, who || null, at, at);
      run('INSERT INTO report_status_histories(id,report_id,old_status,new_status,note,created_at) VALUES (?,?,?,?,?,?)', uuid(), rid, null, 'NEW', 'Laporan dibuat', at);
    }
  }
  const qr = get<any>('SELECT q.token_encrypted FROM qr_codes q JOIN vehicles v ON v.id=q.vehicle_id WHERE v.user_id=? AND q.revoked_at IS NULL ORDER BY q.created_at LIMIT 1', owner);
  console.log('Data demo siap.\n  Pemilik : demo@example.com / Demo12345!\n  Admin   : admin@example.com / Admin12345!  (MFA: pindai QR saat login pertama)');
  if (qr) console.log(`  Halaman publik kendaraan demo: ${publicUrl(decrypt(qr.token_encrypted))}`);
}
void all; void enqueue;
