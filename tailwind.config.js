/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      surface: '#FBF9F6',
      'surface-container': '#F3F1EE',
      'surface-container-high': '#ECEAE7',
      'on-surface': '#1C1B19',
      'on-surface-variant': '#5F5E5A',
      outline: '#C8C6C2',
      primary: '#1F4E79',
      error: '#B3261E',
      warning: '#8A5A00',
      success: '#2E6B3F',
    },
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
      mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
    },
    fontSize: {
      11: ['11px', '16px'],
      12: ['12px', '16px'],
      14: ['14px', '20px'],
      16: ['16px', '24px'],
      18: ['18px', '24px'],
      24: ['24px', '32px'],
    },
    fontWeight: { normal: '400', medium: '500', semibold: '600' },
    borderRadius: { none: '0', 8: '8px', 12: '12px', 16: '16px', full: '999px' },
    boxShadow: {
      none: 'none',
      float: '0 8px 24px rgba(28, 27, 25, 0.12), 0 1px 3px rgba(28, 27, 25, 0.08)',
    },
    extend: {
      borderColor: { DEFAULT: '#C8C6C2' },
      transitionTimingFunction: { standard: 'cubic-bezier(0.2, 0, 0, 1)' },
      screens: { wide: '1100px' },
      letterSpacing: { tightest: '-0.02em' },
    },
  },
  plugins: [],
}
