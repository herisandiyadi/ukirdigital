import clsx from 'clsx'
import type { ConversionStatus } from '@/types'

const MAP: Record<ConversionStatus, { label: string; cls: string; icon: string }> = {
  pending:    { label: 'Menunggu',   cls: 'badge-netral', icon: '○' },
  processing: { label: 'Memproses', cls: 'badge-proses', icon: '◐' },
  completed:  { label: 'Selesai',   cls: 'badge-sukses', icon: '✓' },
  failed:     { label: 'Gagal',     cls: 'badge-gagal',  icon: '✕' },
}

export function StatusBadge({ status }: { status: ConversionStatus }) {
  const { label, cls, icon } = MAP[status] ?? { label: status, cls: 'badge-netral', icon: '•' }
  return <span className={clsx('badge', cls)}><span aria-hidden="true">{icon}</span>{label}</span>
}
