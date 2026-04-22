import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          sand: "#f7f1e4",
          amber: "#d6a84f",
          ink: "#12110f",
          moss: "#2a3b31"
        }
      },
      backgroundImage: {
        "lexora-grid":
          "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)"
      },
      backgroundSize: {
        grid: "32px 32px"
      }
    }
  },
  plugins: []
};

export default config;

