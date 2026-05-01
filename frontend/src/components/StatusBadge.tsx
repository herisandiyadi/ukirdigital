import clsx from 'clsx'
import type { ConversionStatus } from '@/types'

const MAP: Record<ConversionStatus, { label: string; cls: string }> = {
  pending:    { label: 'Menunggu',   cls: 'bg-yellow-100 text-yellow-800' },
  processing: { label: 'Memproses', cls: 'bg-blue-100 text-blue-800' },
  completed:  { label: 'Selesai',   cls: 'bg-green-100 text-green-800' },
  failed:     { label: 'Gagal',     cls: 'bg-red-100 text-red-800' },
}

export function StatusBadge({ status }: { status: ConversionStatus }) {
  const { label, cls } = MAP[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' }
  return <span className={clsx('badge', cls)}>{label}</span>
}
