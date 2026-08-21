import type { Config } from 'tailwindcss';

/**
 * Corporate-bank palette built on CSS-variable design tokens so the whole
 * console themes light/dark from one place (see globals.css `:root` / `.dark`).
 *
 * - `brand`  — indigo, the brand primary in both themes.
 * - `violet` / `cyan` — the futuristic gradient companions (aurora accents).
 * - `ink.*`  — foreground text ramp, wired to `--fg*` tokens (theme-aware).
 * - `canvas` / `surface` / `line` — semantic neutrals, wired to tokens.
 *
 * Colors are declared as `rgb(var(--x) / <alpha-value>)` so opacity modifiers
 * (e.g. `bg-surface/60`, `ring-brand-500/30`) keep working.
 */
const token = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        violet: {
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
        },
        cyan: {
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
        },
        accent: {
          // emerald — the shared "money / success" accent (matches the app)
          50: '#ecfdf5',
          100: '#d1fae5',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        // Semantic neutrals (theme-aware via tokens)
        canvas: token('--canvas'),
        surface: {
          DEFAULT: token('--surface'),
          2: token('--surface-2'),
        },
        glass: token('--glass'),
        line: {
          DEFAULT: token('--line'),
          soft: token('--line-soft'),
        },
        // Foreground ramp — aliases so existing `text-ink*` classes theme-aware.
        ink: {
          DEFAULT: token('--fg'),
          soft: token('--fg-soft'),
          muted: token('--fg-muted'),
          faint: token('--fg-faint'),
          line: token('--line'), // fixes historical `border-ink-line` usage
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        pop: '0 10px 30px -10px rgb(15 23 42 / 0.25)',
        lift: '0 2px 4px -1px rgb(15 23 42 / 0.06), 0 18px 40px -12px rgb(30 27 75 / 0.22)',
        // Futuristic glows — indigo/violet halos for interactive & hero elements.
        glow: '0 0 0 1px rgb(99 102 241 / 0.18), 0 8px 30px -6px rgb(99 102 241 / 0.35)',
        'glow-lg': '0 0 0 1px rgb(124 58 237 / 0.20), 0 20px 60px -12px rgb(99 102 241 / 0.45)',
        'glow-cyan': '0 0 0 1px rgb(34 211 238 / 0.20), 0 10px 40px -8px rgb(34 211 238 / 0.30)',
        'inner-top': 'inset 0 1px 0 0 rgb(255 255 255 / 0.06)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #4f46e5 0%, #6366f1 45%, #7c3aed 100%)',
        'brand-sheen':
          'linear-gradient(135deg, #4f46e5 0%, #6366f1 40%, #8b5cf6 75%, #22d3ee 130%)',
        'accent-glow':
          'radial-gradient(60% 60% at 50% 0%, rgb(99 70 229 / 0.20) 0%, transparent 70%)',
        // Ambient aurora — layered radial blobs used as the page backdrop.
        aurora:
          'radial-gradient(40% 55% at 12% 8%, rgb(99 102 241 / 0.22) 0%, transparent 60%), radial-gradient(45% 55% at 88% 4%, rgb(124 58 237 / 0.18) 0%, transparent 55%), radial-gradient(50% 55% at 70% 95%, rgb(34 211 238 / 0.12) 0%, transparent 60%)',
        sheen:
          'linear-gradient(105deg, transparent 20%, rgb(255 255 255 / 0.35) 50%, transparent 80%)',
        'grid-fade':
          'linear-gradient(to right, rgb(148 163 184 / 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184 / 0.08) 1px, transparent 1px)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        sheen: {
          '0%': { transform: 'translateX(-120%) skewX(-12deg)' },
          '60%,100%': { transform: 'translateX(220%) skewX(-12deg)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        'aurora-drift': {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(0,-3%,0) scale(1.06)' },
        },
        'pulse-glow': {
          '0%,100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        'gradient-x': {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'slide-up': 'slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scale-in 0.18s ease-out',
        float: 'float 8s ease-in-out infinite',
        'aurora-drift': 'aurora-drift 18s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 4s ease-in-out infinite',
        'gradient-x': 'gradient-x 6s ease infinite',
      },
    },
  },
  plugins: [],
};

export default config;
