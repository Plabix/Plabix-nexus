import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f6ff",
          100: "#e3ebff",
          500: "#3b5bfd",
          600: "#2f47d6",
          700: "#2537a8",
          900: "#141c4d",
        },
      },
    },
  },
  plugins: [],
};
export default config;
