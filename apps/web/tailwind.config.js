/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "felt-dark": "#0a1f11",
        "felt-green": "#16512e",
        "felt-light": "#a8c7b5",
        gold: {
          300: "#f0d060",
          400: "#d4af37",
          500: "#b8962e",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
