import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Headphones, Phone, PhoneCall, PhoneMissed } from 'lucide-react';
import { api } from '../../lib/api';
import { useOwnerCall } from '../../lib/ownerCall';
import type { CallRow } from '../../lib/types';
import { CALL_STATUS_LABEL, cx, fmtDateTime, fmtDuration, timeAgo } from '../../lib/utils';
import { Button, Empty, Notice, PageHeader, PageLoader, Pills, StatusBadge } from '../../components/ui';

export default function Calls() {
  const [tab, setTab] = useState<'all' | 'missed'>('all');
  const { socket } = useOwnerCall();
  const q = useQuery({ queryKey: ['calls', tab], queryFn: () => api<{ calls: CallRow[] }>(tab === 'all' ? '/calls/history?limit=50' : '/calls/missed?limit=50'), refetchInterval: 15_000 });
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const online = socket === 'online';

  return (
    <div>
      <PageHeader eyebrow="Panggilan dari pemindai QR" title="Panggilan" />
      <div className={cx('mb-4 flex items-center gap-4 rounded-3xl p-5', online ? 'bg-mint' : 'bg-white shadow-card')}>
        <span className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-full', online ? 'bg-white/70' : 'bg-paper')}><Headphones className="h-5 w-5" /></span>
        <div className="flex-1"><p className="font-bold">{online ? 'Anda online — siap menerima panggilan' : socket === 'connecting' ? 'Menyambungkan…' : 'Anda sedang offline'}</p><p className="text-sm text-ink/60">{online ? 'Biarkan halaman/aplikasi ini terbuka agar panggilan berdering.' : 'Panggilan tidak akan berdering sampai koneksi pulih.'}</p></div>
      </div>
      {perm === 'default' && <div className="mb-4 flex items-center gap-3 rounded-3xl bg-white p-4 shadow-card"><Bell className="h-5 w-5" /><p className="flex-1 text-sm">Aktifkan notifikasi browser agar Anda tahu ada panggilan saat tab berada di latar belakang.</p><Button size="sm" onClick={async () => setPerm(await Notification.requestPermission())}>Aktifkan</Button></div>}
      <div className="mb-5"><Notice tone="amber">Panggilan internet hanya berdering saat aplikasi/browser terbuka. Browser dan sistem operasi dapat membatasi aktivitas latar belakang — untuk laporan, Anda tetap dikabari lewat WhatsApp/Telegram.</Notice></div>

      <Pills value={tab} onChange={setTab} options={[{ value: 'all', label: 'Semua' }, { value: 'missed', label: 'Tak terjawab' }]} />
      <div className="mt-3 space-y-2.5">
        {q.isLoading ? <PageLoader /> : q.data!.calls.length === 0 ? <Empty icon={<PhoneCall />} title={tab === 'missed' ? 'Tidak ada panggilan tak terjawab' : 'Belum ada panggilan'}>Riwayat panggilan beserta durasinya akan tampil di sini.</Empty> : q.data!.calls.map((c) => (
          <div key={c.id} className={cx('flex items-center gap-4 rounded-3xl p-4', c.status === 'MISSED' ? 'bg-coral-soft' : 'bg-white shadow-card')}>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/80">{c.status === 'MISSED' ? <PhoneMissed className="h-5 w-5 text-coral-deep" /> : c.call_type === 'PSTN' ? <Phone className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}</span>
            <div className="min-w-0 flex-1"><p className="font-bold">{c.plate_number}<span className="ml-2 text-xs font-medium text-muted">{c.call_type === 'PSTN' ? 'Telepon biasa' : 'Internet'}</span></p><p className="text-sm text-muted" title={fmtDateTime(c.started_at)}>{timeAgo(c.started_at)} · {c.duration_seconds != null ? `durasi ${fmtDuration(c.duration_seconds)}` : c.end_reason === 'timeout' ? 'tidak dijawab' : c.end_reason === 'caller_cancelled' ? 'dibatalkan penelepon' : '—'}</p></div>
            <StatusBadge status={c.status} label={CALL_STATUS_LABEL[c.status]} />
          </div>))}
      </div>
    </div>
  );
}
