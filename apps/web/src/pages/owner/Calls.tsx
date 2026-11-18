import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Headphones, Phone, PhoneCall, PhoneMissed } from 'lucide-react';
import { api } from '../../lib/api';
import { useOwnerCall } from '../../lib/ownerCall';
import type { CallRow } from '../../lib/types';
import { CALL_STATUS_LABEL, cx, fmtDateTime, fmtDuration, timeAgo } from '../../lib/utils';
import { Button, Empty, IconTile, Notice, PageLoader, Pills, StatusBadge } from '../../components/ui';

export default function Calls() {
  const [tab, setTab] = useState<'all' | 'missed'>('all');
  const { socket } = useOwnerCall();
  const q = useQuery({ queryKey: ['calls', tab], queryFn: () => api<{ calls: CallRow[] }>(tab === 'all' ? '/calls/history?limit=50' : '/calls/missed?limit=50'), refetchInterval: 15_000 });
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const online = socket === 'online';

  return (
    <div className="space-y-4 px-4 pt-5 lg:px-0 lg:pt-0">
      <h1 className="font-display text-[30px] font-bold lg:hidden">Panggilan</h1>
      <div className={cx('flex items-center gap-4 rounded-3xl border p-5', online ? 'border-[#BFE3CF] bg-mint-soft' : 'border-line bg-white shadow-card')}>
        <IconTile tone={online ? 'green' : 'blue'}><Headphones /></IconTile>
        <div className="flex-1"><p className="font-display font-bold">{online ? 'Anda online — siap menerima panggilan' : socket === 'connecting' ? 'Menyambungkan…' : 'Anda sedang offline'}</p><p className="text-sm text-muted">{online ? 'Biarkan halaman/aplikasi ini terbuka agar panggilan berdering.' : 'Panggilan tidak akan berdering sampai koneksi pulih.'}</p></div>
      </div>
      {perm === 'default' && <div className="card flex items-center gap-3 p-4"><Bell className="h-5 w-5 text-brand" /><p className="flex-1 text-sm">Aktifkan notifikasi browser agar Anda tahu ada panggilan saat tab di latar belakang.</p><Button size="sm" onClick={async () => setPerm(await Notification.requestPermission())}>Aktifkan</Button></div>}
      <Notice tone="amber">Panggilan internet di web hanya berdering saat tab/aplikasi terbuka. Untuk panggilan layar penuh saat ponsel terkunci, pakai aplikasi Android. Laporan tetap dikabari lewat WhatsApp/Telegram/Email.</Notice>

      <Pills value={tab} onChange={setTab} options={[{ value: 'all', label: 'Semua' }, { value: 'missed', label: 'Tak terjawab' }]} />
      <div className="space-y-3">
        {q.isLoading ? <PageLoader /> : q.data!.calls.length === 0 ? <Empty icon={<PhoneCall />} title={tab === 'missed' ? 'Tidak ada panggilan tak terjawab' : 'Belum ada panggilan'}>Riwayat panggilan beserta durasinya akan tampil di sini.</Empty> : q.data!.calls.map((c) => (
          <div key={c.id} className="flex items-center gap-4 rounded-3xl border border-line/70 bg-white p-4 shadow-card">
            <span className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', c.status === 'MISSED' ? 'bg-coral-soft text-coral-deep' : 'bg-brand-soft text-brand')}>{c.status === 'MISSED' ? <PhoneMissed className="h-5 w-5" /> : c.call_type === 'PSTN' ? <Phone className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}</span>
            <div className="min-w-0 flex-1"><p className="font-display font-bold">{c.plate_number}<span className="ml-2 text-xs font-medium text-muted">{c.call_type === 'PSTN' ? 'Telepon biasa' : 'Internet'}</span></p><p className="text-sm text-muted" title={fmtDateTime(c.started_at)}>{timeAgo(c.started_at)} · {c.duration_seconds != null ? `durasi ${fmtDuration(c.duration_seconds)}` : c.end_reason === 'timeout' ? 'tidak dijawab' : c.end_reason === 'caller_cancelled' ? 'dibatalkan penelepon' : '—'}</p></div>
            <StatusBadge status={c.status} label={CALL_STATUS_LABEL[c.status]} />
          </div>))}
      </div>
    </div>
  );
}
