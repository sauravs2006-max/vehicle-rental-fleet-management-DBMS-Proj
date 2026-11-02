import type { Config } from "tailwindcss";
const font = ["system-ui", "sans-serif"];   // one font stack, including code blocks
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: { borderColor: { DEFAULT: "#27272a" }, fontFamily: { sans: font, mono: font } } },   // zinc-800 for every plain `border` / `divide-y`
  plugins: [],
};
export default config;
