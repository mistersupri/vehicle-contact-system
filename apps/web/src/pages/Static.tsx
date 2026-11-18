import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { Logo } from '../components/Logo';
import { Button, ErrorNote, Field, LinkButton, Notice, Textarea } from '../components/ui';

function Doc({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-5 py-6">
      <div className="flex items-center justify-between"><Logo light={false} /><Link to={-1 as any} onClick={(e) => { e.preventDefault(); history.length > 1 ? history.back() : (location.href = '/'); }} className="inline-flex items-center gap-1.5 text-sm font-semibold"><ArrowLeft className="h-4 w-4" />Kembali</Link></div>
      <h1 className="mt-10 font-display text-4xl font-bold">{title}</h1>
      <div className="mt-6 space-y-4 text-[15.5px] leading-relaxed text-ink/80 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </div>
  );
}

export function Privacy() {
  return (
    <Doc title="Kebijakan privasi">
      <Notice tone="amber">Dokumen ini adalah <b>draf operasional</b> yang menjelaskan perilaku sistem. Teks hukum final (dasar pemrosesan data, retensi, hak subjek data) harus ditetapkan penyelenggara sebelum peluncuran produksi.</Notice>
      <h2>Data yang tampil di halaman publik</h2>
      <p>Pelat nomor, jenis kendaraan, merek/model/warna (jika diisi), dan nama tampilan pemilik. <b>Nomor telepon dan email pemilik tidak pernah ditampilkan.</b></p>
      <h2>Data pelapor</h2>
      <ul><li>Nama dan nomor telepon pelapor bersifat opsional; nomor disimpan terenkripsi dan hanya dapat dilihat pemilik kendaraan.</li><li>Alamat IP tidak disimpan mentah — hanya hash untuk mencegah spam.</li><li>Foto dibersihkan dari metadata (termasuk GPS) sebelum disimpan, dan hanya dapat diakses pemilik.</li></ul>
      <h2>Panggilan</h2>
      <ul><li>Panggilan internet tidak direkam. Hanya waktu, durasi, dan status yang dicatat.</li><li>Untuk panggilan telepon biasa, nomor Anda dipakai hanya untuk menyambungkan panggilan dan disimpan terenkripsi.</li></ul>
      <h2>Pemilik kendaraan</h2>
      <p>Data akun (nama, email) dipakai untuk autentikasi dan komunikasi. Kata sandi disimpan sebagai hash. Anda dapat meminta penghapusan akun; laporan dan log audit dapat dipertahankan untuk periode retensi yang ditetapkan.</p>
      <h2>Penyalahgunaan</h2>
      <p>Layanan memakai pembatasan frekuensi dan pemblokiran sumber. Anda dapat <Link className="font-semibold underline" to="/penyalahgunaan">melaporkan penyalahgunaan</Link> kapan saja.</p>
    </Doc>
  );
}

export function Abuse() {
  const [sp] = useSearchParams(); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [error, setError] = useState('');
  return (
    <Doc title="Laporkan penyalahgunaan">
      <p>Gunakan formulir ini jika QR/halaman kendaraan dipakai untuk spam, pelecehan, atau penipuan. Tim administrator akan meninjau laporan Anda.</p>
      {done ? <Notice>Terima kasih. Laporan Anda sudah diterima untuk ditinjau.</Notice> : (
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(''); try { await api('/public/abuse-reports', { body: { vehicle_token: sp.get('t') ?? undefined, message: msg } }); setDone(true); } catch (er) { setError(errMsg(er)); } finally { setBusy(false); } }}>
          <Field label="Apa yang terjadi?"><Textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={1000} placeholder="Jelaskan masalahnya…" /></Field>
          <ErrorNote>{error}</ErrorNote><Button type="submit" size="lg" loading={busy} disabled={msg.trim().length < 5}>Kirim laporan</Button>
        </form>)}
    </Doc>
  );
}

export function NotFound() {
  return <div className="grid min-h-dvh place-items-center px-6 text-center"><div><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-brand-soft text-brand"><Compass className="h-9 w-9" /></div><h1 className="mt-6 font-display text-4xl font-bold">Halaman tidak ditemukan</h1><p className="mt-2 text-muted">Tautan yang Anda buka tidak ada atau sudah dipindahkan.</p><LinkButton to="/" className="mt-6">Ke beranda</LinkButton></div></div>;
}
