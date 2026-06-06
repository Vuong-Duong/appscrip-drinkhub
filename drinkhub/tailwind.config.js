/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      screens: {
        // Mobile-first approach
        xs: "320px", // Small phones
        sm: "640px", // Larger phones
        md: "768px", // Tablets
        lg: "1024px", // Desktop
        xl: "1280px", // Large desktop
        pos: "1280px", // POS screen (legacy)
        "pos-sm": "1024px",
      },
      maxWidth: {
        pos: "1280px",
        mobile: "100vw",
      },
      height: {
        "pos-screen": "800px",
        // Safe area aware heights
        "screen-safe": "100dvh",
        "safe-header": "calc(68px + env(safe-area-inset-top))",
        "safe-footer": "calc(80px + env(safe-area-inset-bottom))",
      },
      spacing: {
        safe: {
          top: "env(safe-area-inset-top)",
          right: "env(safe-area-inset-right)",
          bottom: "env(safe-area-inset-bottom)",
          left: "env(safe-area-inset-left)",
        },
      },
      padding: {
        "safe-bottom": "calc(1.25rem + env(safe-area-inset-bottom))",
      },
      fontSize: {
        // Mobile-optimized text sizes
        xs: "0.75rem", // 12px
        sm: "0.875rem", // 14px
        base: "1rem", // 16px
        lg: "1.125rem", // 18px
        xl: "1.25rem", // 20px
        "2xl": "1.5rem", // 24px - reduced from default
        "3xl": ["1.875rem", "2.25rem"], // 30px
        "4xl": ["2rem", "2.5rem"], // 32px - reduced from default
      },
    },
  },
  plugins: [],
};
