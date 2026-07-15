import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // Requested palette (22223b / 4a4e69 / 9a8c98 / c9ada7 / f2e9e4) —
        // dark plum-navy through to warm cream. Status hues (green/orange/red)
        // are muted to sit in the same family rather than clashing with it;
        // `border`/`hairline`/`zebra` are white-mixed derivations of the
        // palette's dusty-rose/cream tones, not new invented hues.
        ink: "#22223b",
        accent: "#4a4e69",
        // Distinct from accent — reserved specifically for delegation/lineage
        // indicators (parent ↔ child agents), so that relationship reads as
        // its own visual category, not a primary action. Used verbatim as a
        // background/border tint; `lineageText` is the same hue mixed darker
        // for small solid text, where #9a8c98 itself falls under 3.2:1
        // contrast on white (fails AA — this doesn't).
        lineage: "#9a8c98",
        lineageText: "#645c6e",
        rose: "#c9ada7",
        green: "#3f7d52",
        orange: "#bb6d4a",
        red: "#a34a42",
        surface: "#f2e9e4",
        border: "#e9dedc",
        hairline: "#f4efee",
        zebra: "#f8f4f1",
      },
      boxShadow: {
        emphasis: "0 2px 12px -4px rgba(34, 34, 59, 0.14)",
      },
    },
  },
  plugins: [],
};

export default config;
