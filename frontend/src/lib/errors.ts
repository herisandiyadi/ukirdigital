/**
 * Ubah detail error FastAPI/Pydantic jadi pesan yang bisa dibaca manusia.
 *
 * - detail string          -> dipakai apa adanya
 * - detail array (422)     -> dirangkai per field: "Nomor telepon: harus ..."
 * - error jaringan / lain  -> fallback
 */
export function extractErrorMessage(e: any, fallback = 'Terjadi kesalahan'): string {
  const detail = e?.response?.data?.detail

  if (typeof detail === 'string' && detail.trim()) return detail

  if (Array.isArray(detail) && detail.length > 0) {
    const messages = detail
      .map((item: any) => {
        const field: string = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : ''
        const msg: string = item?.msg || item?.message || ''
        if (!msg) return ''
        // Pydantic menulis "Value error, <pesan>" untuk field_validator.
        const clean = msg.replace(/^Value error,\s*/i, '').replace(/^Field required$/i, 'wajib diisi')
        return field && field !== 'body' ? `${humanizeField(field)}: ${clean}` : clean
      })
      .filter(Boolean)

    if (messages.length) return messages.join('\n')
  }

  if (e?.response?.status === 422) return 'Data yang dikirim tidak valid. Periksa kembali isian Anda.'
  if (e?.code === 'ERR_NETWORK') return 'Tidak dapat menghubungi server. Periksa koneksi Anda.'
  return fallback
}

const FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  username: 'Username',
  password: 'Password',
  full_name: 'Nama lengkap',
  phone_number: 'Nomor telepon',
}

function humanizeField(field: string): string {
  return FIELD_LABELS[field] || field.replace(/_/g, ' ')
}
