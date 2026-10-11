/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Design System v2 (Bengkel). Kuningan hanya untuk aksi utama, fokus, langkah aktif.
        // alias sementara: halaman lama masih memakai primary-*; dipetakan ke kuningan
        primary: { 50: '#F7F3EA', 100: '#EFE6D3', 200: '#D8C7A8', 400: '#A8703A', 500: '#8A4F12', 600: '#7A4410', 700: '#5C3309' },
        serat:    '#F7F3EA',   // latar utama (kertas serat)
        kayu:     '#D8C7A8',   // batas 1px, garis, input
        kuningan: '#8A4F12',   // aksen tunggal
        ampas:    '#5C4A36',   // teks sekunder
        arang:    '#2A2118',   // teks utama
        status: {
          sukses: '#2F5E2A',
          gagal:  '#9A2E1A',
          proses: '#24557A',
        },
      },
      fontFamily: {
        serif: ['"Source Serif 4"', 'Georgia', 'serif'],
        sans:  ['"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '6px',
        kartu: '10px',
      },
    },
  },
  plugins: [],
}
