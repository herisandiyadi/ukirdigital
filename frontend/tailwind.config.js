/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand: ukir digital
        primary: {
          50:  '#e9fff6',    // very light green
          100: '#c5ffe5',
          500: '#2ECC8A',    // main brand green
          600: '#27AE60',
          700: '#1E8449',
        },
        brand: {
          dark: '#0D1117',   // main background
          gold: '#F0A500',   // accent (cutting path / premium)
        },
      },
    },
  },
  plugins: [],
}
