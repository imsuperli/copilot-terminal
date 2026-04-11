/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 状态色
        'status-running': '#16c60c',
        'status-waiting': '#3b78ff',
        'status-completed': '#61d6d6',
        'status-error': '#e74856',
        'status-restoring': '#ffb900',

        // 背景色
        'bg-app': '#0c0c0c',
        'bg-card': '#161616',
        'bg-card-hover': '#232323',
        'bg-hover': '#232323',
        'bg-elevated': '#1c1c1c',

        // 文字色
        'text-primary': '#f2f2f2',
        'text-secondary': '#a1a1a1',
        'text-disabled': '#6a6a6a',

        // 边框色
        'border-subtle': '#323232',
        'border-default': '#454545',

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
