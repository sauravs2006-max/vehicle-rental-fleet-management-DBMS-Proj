import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: { borderColor: { DEFAULT: "#27272a" } } },   // zinc-800 for every plain `border` / `divide-y`
  plugins: [],
};
export default config;
