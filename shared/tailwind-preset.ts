import type { Config } from "tailwindcss";

/**
 * The design system shared by the public website and the admin app.
 *
 * The colours were sampled from the reference screens: a soft gray-green
 * page background, white cards with thin borders, a deep teal primary, and a
 * dark teal for emphasis.
 */
export const sharedPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#1F3243",
          strong: "#142B3A",
          muted: "#5B6E7C",
          faint: "#8A9BA7",
        },
        page: {
          DEFAULT: "#F5F8FA",
          tint: "#EEF6F6",
        },
        line: {
          DEFAULT: "#E3EAED",
          strong: "#C0DCDC",
        },
        brand: {
          50: "#EEF6F6",
          100: "#D9EBEB",
          200: "#B7D7D8",
          300: "#93C2C2",
          400: "#4FA3A6",
          500: "#087E83",
          600: "#066A6F",
          700: "#05565A",
          800: "#04454A",
          900: "#0E2636",
        },
        navy: {
          DEFAULT: "#182F3E",
          soft: "#22384A",
        },
        ferry: {
          1: "#C2611C",
          2: "#7C3AED",
          3: "#0E9F6E",
          4: "#64748B",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(20, 43, 58, 0.04), 0 1px 3px rgba(20, 43, 58, 0.03)",
        lift: "0 8px 24px rgba(20, 43, 58, 0.10)",
        chip: "0 6px 18px rgba(20, 43, 58, 0.08)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      maxWidth: {
        shell: "1180px",
        admin: "1320px",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 240ms ease-out both",
      },
    },
  },
};
