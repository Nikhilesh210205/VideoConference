/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#FF5733',
        dark: {
          100: '#2A2A2A',
          200: '#1A1A1A',
          300: '#0A0A0A',
        },
      },
    },
  },
  plugins: [],
};