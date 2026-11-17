/** Bahasa visual: monokrom hangat + mint lembut + koral, kartu sangat membulat (terinspirasi referensi desain). */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#101011', 2: '#1C1C1E', 3: '#2B2B2E' },
        paper: '#EEEEEC',
        line: '#E4E4E1',
        muted: '#757571',
        mint: { DEFAULT: '#CDE8DA', deep: '#1E6B4B', soft: '#E6F3EC' },
        coral: { DEFAULT: '#E5645E', soft: '#FBE4E2', deep: '#B03A35' },
        amber: { soft: '#FBEFD2', deep: '#8A5A00' },
        sky: { soft: '#E1ECF7', deep: '#2A5A8C' },
      },
      fontFamily: { sans: ['"Plus Jakarta Sans Variable"', 'system-ui', 'sans-serif'] },
      borderRadius: { '2xl': '20px', '3xl': '28px', '4xl': '36px' },
      boxShadow: {
        card: '0 1px 0 rgba(16,16,17,.04), 0 8px 24px -12px rgba(16,16,17,.12)',
        float: '0 12px 40px -12px rgba(16,16,17,.35)',
      },
      keyframes: {
        ring: { '0%,100%': { transform: 'scale(1)', opacity: '.5' }, '50%': { transform: 'scale(1.5)', opacity: '0' } },
        rise: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'none' } },
        sheet: { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
      },
      animation: { ring: 'ring 1.8s ease-out infinite', rise: 'rise .35s ease-out both', sheet: 'sheet .3s cubic-bezier(.2,.8,.2,1) both' },
    },
  },
  plugins: [],
};
