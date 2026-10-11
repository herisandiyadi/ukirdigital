import { useEffect } from 'react'
import { X } from 'lucide-react'
import { ReactNode } from 'react'

/**
 * Sidebar versi mobile. Tampil sebagai drawer dari kiri dengan backdrop.
 * Tertutup otomatis saat layar jadi lebar (breakpoint md, 768px) supaya
 * layout desktop tidak menyisakan overlay.
 */
export function MobileDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div
        className="absolute inset-0 bg-arang/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-y-0 left-0 w-64 max-w-[85%] bg-white border-r border-kayu shadow-lg">
        <div className="flex items-center justify-end px-3 pt-3">
          <button
            onClick={onClose}
            aria-label="Tutup menu"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-ampas hover:bg-kayu/30 hover:text-arang"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Header mobile: tombol menu, judul halaman, dan aksi opsional di kanan. */
export function MobileHeader({
  title,
  onMenu,
  right,
}: {
  title: string
  onMenu: () => void
  right?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-30 flex min-h-[44px] items-center gap-3 border-b border-kayu bg-white px-4 py-3 md:hidden">
      <button
        onClick={onMenu}
        aria-label="Buka menu"
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-ampas hover:bg-kayu/30 hover:text-arang"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </button>
      <p className="flex-1 truncate text-sm font-semibold text-arang">{title}</p>
      {right}
    </header>
  )
}
