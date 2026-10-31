/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './stats.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07070b',
          900: '#0b0b10',
          850: '#101018',
          800: '#161620',
        },
        accent: {
          DEFAULT: '#7c9cff',
          soft: 'rgba(124, 156, 255, 0.18)',
          400: '#9db4ff',
          500: '#7c9cff',
          600: '#5f83f5',
        },
      },
      fontFamily: {
        display: ['"Segoe UI Variable Display"', 'Segoe UI', 'system-ui', 'sans-serif'],
        sans: ['"Segoe UI Variable Text"', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      animation: {
        'float-slow': 'float 7s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 4s ease-in-out infinite',
        shimmer: 'shimmer 2.8s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};