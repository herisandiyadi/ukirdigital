/**
 * Normalisasi nomor telepon ke format E.164 (+628xxxxxxxxxx).
 *
 * Aturan:
 * - buang semua karakter selain digit dan '+'
 * - '0' di depan  -> ganti dengan kode negara Indonesia (62)
 * - '+0...'      -> buang '0' setelah '+'
 * - '62...'      -> tambahkan '+'
 * - '8...'       -> tambahkan '+62'
 *
 * Sumber tunggal untuk normalisasi nomor di frontend: form register,
 * form profil, dan pengiriman WhatsApp harus memakai fungsi yang sama.
 */
export function normalizePhone(raw: string, defaultCountryCode = '62'): string {
  let v = (raw || '').replace(/[^\d+]/g, '')

  if (!v) return ''

  // '+0812...' -> salah ketik yang umum; '0' setelah '+' harus dibuang.
  if (v.startsWith('+')) {
    v = '+' + v.slice(1).replace(/^0+/, '')
    return v
  }

  // '0812...' -> '62812...'
  if (v.startsWith('0')) {
    return '+' + defaultCountryCode + v.replace(/^0+/, '')
  }

  // '62812...' -> '+62812...'
  if (v.length > 10 && v.startsWith(defaultCountryCode)) {
    return '+' + v
  }

  // '812...' -> '+62812...'
  return '+' + defaultCountryCode + v
}

/** Nomor siap kirim: diawali '+' dan minimal 10 digit. */
export function isValidPhone(normalized: string): boolean {
  return /^\+\d{10,20}$/.test(normalized)
}
