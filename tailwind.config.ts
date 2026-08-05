import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "lang-zh": "#E74C3C",
        "lang-en": "#3498DB",
        "lang-fr": "#27AE60",
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', '"Noto Sans"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
