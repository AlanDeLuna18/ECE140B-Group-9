import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        leaf: "#2f7d59",
        mint: "#e8f5ee",
        ink: "#1d2733",
      },
    },
  },
  plugins: [],
};

export default config;
