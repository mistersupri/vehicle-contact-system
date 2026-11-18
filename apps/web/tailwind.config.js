/** Bahasa visual baru: hero gradien navy→biru, aksen biru, kartu 20px berbingkai tipis, ikon garis (sesuai desain). */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#060C17', 900: '#0A1424', 800: '#0E1D3A', 700: '#12295A' },
        brand: { DEFAULT: '#2B7FE8', dark: '#1A56A8', deep: '#1E5BB8', soft: '#E8F1FF' },
        ink: { DEFAULT: '#0F1A2B', 2: '#1B2A44', 3: '#2B3A57' },
        paper: '#F5F7FB',
        line: '#E6EBF2',
        muted: '#6B7A90',
        mint: { DEFAULT: '#D6F5E5', deep: '#0F9D68', soft: '#EAFBF3' },     // sukses
        coral: { DEFAULT: '#E5484D', soft: '#FDE4E4', deep: '#C93A3F' },    // bahaya
        amber: { DEFAULT: '#F5A524', soft: '#FEF0CC', deep: '#A8650A' },
        sky: { soft: '#E3EEFF', deep: '#2B6CD3' },
        violet: { soft: '#EDE7FF', deep: '#7048E8' },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk Variable"', '"Inter Variable"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl: '14px', '2xl': '16px', '3xl': '20px', '4xl': '32px' },
      boxShadow: {
        card: '0 1px 2px rgba(15,26,43,.04), 0 8px 24px -14px rgba(15,26,43,.10)',
        glow: '0 10px 24px -10px rgba(43,127,232,.65)',
        float: '0 16px 48px -12px rgba(6,12,23,.45)',
      },
      keyframes: {
        ring: { '0%,100%': { transform: 'scale(1)', opacity: '.45' }, '50%': { transform: 'scale(1.55)', opacity: '0' } },
        rise: { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'none' } },
        sheet: { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        wave: { '0%,100%': { transform: 'scaleY(.35)' }, '50%': { transform: 'scaleY(1)' } },
        flash: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.35' } },
      },
      animation: { ring: 'ring 1.8s ease-out infinite', rise: 'rise .35s ease-out both', sheet: 'sheet .3s cubic-bezier(.2,.8,.2,1) both', wave: 'wave 1s ease-in-out infinite', flash: 'flash 1s ease-in-out infinite' },
    },
  },
  plugins: [],
};
