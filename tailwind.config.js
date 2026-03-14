export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        page:      'var(--color-page)',
        card:      'var(--color-card)',
        surface:   'var(--color-surface)',
        primary:   'var(--color-primary)',
        light:     'var(--color-light)',
        secondary: 'var(--color-secondary)',
        tertiary:  'var(--color-tertiary)',

        accent: {
          DEFAULT: 'var(--color-accent)',
          15: 'var(--color-accent-15)',
          10: 'var(--color-accent-10)',
          30: 'var(--color-accent-30)',
        },

        status: {
          success: '#22C55E',
          warning: '#FACC15',
          error: '#EF4444',
          info: '#3B82F6',
        },

        border: {
          DEFAULT: 'var(--color-border)',
          accent: 'var(--color-accent)',
        }
      },
      fontFamily: {
        sans: ['JetBrains Mono', 'monospace'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Space Grotesk', 'sans-serif'],
      },
      borderRadius: {
        'none': '0px',
        'sm': '0px',
        DEFAULT: '0px',
        'md': '0px',
        'lg': '0px',
        'xl': '0px',
        '2xl': '0px',
        '3xl': '0px',
        'full': '0px',
      },
      letterSpacing: {
        tighter: '-1px',
        tight: '0.5px',
        normal: '0',
        wide: '1px',
        wider: '2px',
        widest: '3px',
      }
    }
  },
  plugins: [],
}
