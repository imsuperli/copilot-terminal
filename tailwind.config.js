/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 状态色
        'status-running': 'rgb(var(--success) / <alpha-value>)',
        'status-waiting': 'rgb(var(--primary) / <alpha-value>)',
        'status-completed': 'rgb(var(--info) / <alpha-value>)',
        'status-error': 'rgb(var(--error) / <alpha-value>)',
        'status-restoring': 'rgb(var(--warning) / <alpha-value>)',

        // 背景色
        'bg-app': 'rgb(var(--background) / <alpha-value>)',
        'bg-card': 'rgb(var(--card) / <alpha-value>)',
        'bg-card-hover': 'rgb(var(--accent) / <alpha-value>)',
        'bg-hover': 'rgb(var(--accent) / <alpha-value>)',
        'bg-elevated': 'rgb(var(--secondary) / <alpha-value>)',

        // 文字色
        'text-primary': 'rgb(var(--foreground) / <alpha-value>)',
        'text-secondary': 'rgb(var(--muted-foreground) / <alpha-value>)',
        'text-disabled': 'rgb(var(--muted-foreground) / 0.68)',

        // 边框色
        'border-subtle': 'rgb(var(--border) / <alpha-value>)',
        'border-default': 'rgb(var(--input) / <alpha-value>)',

        // Windows Terminal 风格的 Zinc 色表
        zinc: {
          50: '#fafafa',
          100: '#f2f2f2',
          200: '#e6e6e6',
          300: '#c9c9c9',
          400: '#a0a0a0',
          500: '#7a7a7a',
          600: '#525252',
          700: '#303030',
          800: '#232323',
          900: '#171717',
          950: '#0c0c0c',
          750: '#323238',
        },
      },
      spacing: {
        'unit': '8px',
        'card-padding': '16px',
        'card-gap': '12px',
        'section-gap': '24px',
      },
      borderRadius: {
        'card': '8px',
        'button': '6px',
        'input': '4px',
      },
      animation: {
        'blink': 'blink 1s ease-in-out infinite',
        'breathe': 'breathe 2s ease-in-out infinite',
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        breathe: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
    },
  },
  plugins: [],
};
