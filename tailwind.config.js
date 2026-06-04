/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Noto Sans KR', 'sans-serif'] },
      colors: {
        indigo: { DEFAULT: '#4F46E5', light: '#6366F1', dark: '#3730A3' },
        coral:  { DEFAULT: '#F97316', light: '#FB923C' },
        navy:   '#1E1B4B',
      },
    },
  },
  plugins: [],
}
