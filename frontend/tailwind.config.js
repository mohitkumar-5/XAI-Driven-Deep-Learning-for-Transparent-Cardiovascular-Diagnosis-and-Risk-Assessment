/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: '#090d16',
        darkCard: '#111827',
        borderLine: 'rgba(255, 255, 255, 0.08)',
        textMuted: '#94a3b8',
        brandCyan: '#00d4ff',
        brandRed: '#ff3b5c',
        brandPurple: '#a855f7',
        brandAmber: '#f59e0b',
      }
    },
  },
  plugins: [],
}
