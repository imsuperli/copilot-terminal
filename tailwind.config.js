/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 状态色
        'status-running': '#3b82f6',
        'status-waiting': '#f59e0b',
        'status-completed': '#10b981',
        'status-error': '#ef4444',
        'status-restoring': '#6b7280',

        // 背景色
        'bg-app': '#0a0a0a',
        'bg-card': '#1a1a1a',
        'bg-card-hover': '#2a2a2a',

        // 文字色
        'text-primary': '#e5e5e5',
        'text-secondary': '#a3a3a3',
        'text-disabled': '#737373',

        // 边框色
        'border-subtle': '#2a2a2a',
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
    },
  },
  plugins: [],
};
