import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background-rgb)",
        foreground: "var(--foreground-rgb)",
        brand: {
          blue: "#3b82f6",
          purple: "#a855f7",
          emerald: "#10b981",
          amber: "#f59e0b",
          red: "#ef4444",
        },
        ui: {
          "card-bg": "rgba(255, 255, 255, 0.03)",
          "card-border": "rgba(255, 255, 255, 0.06)",
          "hover-bg": "rgba(255, 255, 255, 0.05)",
          "hover-border": "rgba(255, 255, 255, 0.1)",
          "input-bg": "rgba(0, 0, 0, 0.4)",
          "status-bg": "rgba(255, 255, 255, 0.03)",
        }
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      spacing: {
        'page-safe': '2.5rem',
      }
    },
  },
  plugins: [],
};
export default config;
