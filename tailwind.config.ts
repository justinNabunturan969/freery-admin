import type { Config } from "tailwindcss";
import { sharedPreset } from "./shared/tailwind-preset";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  presets: [sharedPreset as Config],
  plugins: [],
};

export default config;
