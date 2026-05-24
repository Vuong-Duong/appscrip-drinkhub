/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      screens: {
        pos: "1280px", // Màn hình POS chính
        "pos-sm": "1024px",
      },
      maxWidth: {
        pos: "1280px",
      },
      height: {
        "pos-screen": "800px",
      },
    },
  },
  plugins: [],
};
