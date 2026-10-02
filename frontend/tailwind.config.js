/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Every colour is a CSS variable so light and dark are one definition each,
        // defined in index.css. Components never hardcode a hex value.
        bg: 'hsl(var(--bg) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        'surface-raised': 'hsl(var(--surface-raised) / <alpha-value>)',
        'surface-sunken': 'hsl(var(--surface-sunken) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        'border-strong': 'hsl(var(--border-strong) / <alpha-value>)',

        ink: 'hsl(var(--ink) / <alpha-value>)',
        'ink-soft': 'hsl(var(--ink-soft) / <alpha-value>)',
        'ink-muted': 'hsl(var(--ink-muted) / <alpha-value>)',

        brand: {
          DEFAULT: 'hsl(var(--brand) / <alpha-value>)',
          hover: 'hsl(var(--brand-hover) / <alpha-value>)',
          soft: 'hsl(var(--brand-soft) / <alpha-value>)',
          ink: 'hsl(var(--brand-ink) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          soft: 'hsl(var(--accent-soft) / <alpha-value>)',
          ink: 'hsl(var(--accent-ink) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          soft: 'hsl(var(--success-soft) / <alpha-value>)',
          ink: 'hsl(var(--success-ink) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'hsl(var(--danger) / <alpha-value>)',
          soft: 'hsl(var(--danger-soft) / <alpha-value>)',
          ink: 'hsl(var(--danger-ink) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
          soft: 'hsl(var(--warning-soft) / <alpha-value>)',
          ink: 'hsl(var(--warning-ink) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // A tighter scale than the default — display sizes get negative tracking so
        // large headings do not look airy.
        'display-xl': ['clamp(2.5rem, 6vw, 4.25rem)', { lineHeight: '1.04', letterSpacing: '-0.035em' }],
        'display-lg': ['clamp(2rem, 4.5vw, 3rem)', { lineHeight: '1.08', letterSpacing: '-0.03em' }],
        'display-md': ['clamp(1.625rem, 3vw, 2.125rem)', { lineHeight: '1.15', letterSpacing: '-0.022em' }],
        'display-sm': ['1.375rem', { lineHeight: '1.25', letterSpacing: '-0.015em' }],
      },
      borderRadius: {
        card: '1.125rem',
        panel: '1.5rem',
      },
      boxShadow: {
        // Layered, low-opacity shadows rather than one dark blur.
        xs: '0 1px 2px -1px hsl(var(--shadow) / 0.10), 0 1px 1px hsl(var(--shadow) / 0.04)',
        sm: '0 2px 4px -2px hsl(var(--shadow) / 0.12), 0 2px 8px -4px hsl(var(--shadow) / 0.08)',
        md: '0 4px 12px -4px hsl(var(--shadow) / 0.14), 0 8px 24px -12px hsl(var(--shadow) / 0.10)',
        lg: '0 12px 28px -8px hsl(var(--shadow) / 0.18), 0 20px 48px -20px hsl(var(--shadow) / 0.14)',
        glow: '0 0 0 1px hsl(var(--brand) / 0.18), 0 8px 24px -8px hsl(var(--brand) / 0.28)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pop-count': {
          '0%': { transform: 'scale(1)' },
          '45%': { transform: 'scale(1.22)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.3s ease-out both',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.22, 1, 0.36, 1) both',
        'pop-count': 'pop-count 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
