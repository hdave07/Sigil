import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0d0f14",
        accent: "#3547f0",
        green: "#1abc6e",
        orange: "#e67e22",
        red: "#e74c3c",
        purple: "#7c3aed",
        surface: "#f4f4f6",
        border: "#e0e0e4",
      },
    },
  },
  plugins: [],
};

export default config;
