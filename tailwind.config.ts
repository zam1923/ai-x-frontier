import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/src/**/*.{ts,tsx}", "./client/index.html"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Space Grotesk", "Helvetica Neue", "sans-serif"],
        mono: ["Space Mono", "Courier New", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Custom neon palette
        neon: {
          cyan: "#00D4FF",
          magenta: "#FF3CAC",
          purple: "#784BA0",
          gold: "#FFB347",
        },
        space: {
          950: "hsl(220, 20%, 5%)",
          900: "hsl(220, 18%, 8%)",
          800: "hsl(220, 15%, 12%)",
          700: "hsl(220, 15%, 18%)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "neon-cyan": "0 0 20px rgba(0, 212, 255, 0.4)",
        "neon-magenta": "0 0 20px rgba(255, 60, 172, 0.4)",
        "neon-sm": "0 0 8px rgba(0, 212, 255, 0.3)",
        "glass": "0 8px 32px rgba(0,0,0,0.4)",
      },
      animation: {
        "fade-slide": "fade-slide-up 0.4s ease-out both",
        "pulse-neon": "pulse-neon 2s ease-in-out infinite",
      },
      backgroundImage: {
        "gradient-neon": "linear-gradient(135deg, #00D4FF, #784BA0, #FF3CAC)",
        "gradient-heat": "linear-gradient(90deg, #00D4FF, #784BA0, #FF3CAC)",
        "gradient-radial-cyan": "radial-gradient(circle at 50% 50%, rgba(0,212,255,0.08) 0%, transparent 70%)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
