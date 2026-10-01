import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#4674F8",
          dark: "#3860D6",
          soft: "#EAF0FE",
        },
        accent: {
          DEFAULT: "#77C285",
          dark: "#5FAE6F",
          soft: "#E8F6EB",
        },
        canvas: "#F7F7F8",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;
