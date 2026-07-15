import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

export const primaTheme = defineTheme({
  name: "prima",
  extends: neutralTheme,
  color: {
    accent: "#ed2428",
    neutralStyle: "neutral",
    contrast: "standard"
  },
  typography: {
    scale: { base: 14, ratio: 1.18 },
    body: {
      family: "Figtree",
      fallbacks: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    },
    heading: {
      family: "Figtree",
      fallbacks: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      weights: { 2: "bold", 3: "bold", 4: "bold" }
    },
    code: {
      family: "ui-monospace",
      fallbacks: '"SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
    }
  },
  radius: { base: 4, multiplier: 0.9 },
  motion: { fast: 120, medium: 280, slow: 680, ratio: 0.75 },
  tokens: {
    "--color-accent": ["#ed2428", "#ff6b70"],
    "--color-accent-muted": ["#ffe7e8", "#5d1f22"],
    "--color-on-accent": ["#ffffff", "#171717"],
    "--color-background-body": ["#f5f5f6", "#171717"],
    "--color-background-surface": ["#ffffff", "#262626"],
    "--color-background-card": ["#ffffff", "#1f1f1f"],
    "--color-background-muted": ["#f1f1f2", "#202020"],
    "--color-text-accent": ["#c91d21", "#ff8b8f"],
    "--color-icon-accent": ["#ed2428", "#ff6b70"],
    "--color-border": ["#e7e7e8", "#ffffff1a"],
    "--color-border-emphasized": ["#cfcfd2", "#5a5a60"],
    "--color-error": ["#c91d21", "#ff7d82"],
    "--color-error-muted": ["#ffe2e3", "#ff7d8233"],
    "--color-background-red": ["#ffe2e3", "#ff7d8233"],
    "--color-border-red": ["#ed2428", "#ff6b70"],
    "--color-icon-red": ["#ed2428", "#ff6b70"],
    "--color-text-red": ["#9e1518", "#ffb6b9"]
  },
  components: {
    button: {
      base: {
        borderRadius: "var(--radius-element)",
        fontWeight: "var(--font-weight-semibold)"
      },
      "variant:primary": {
        backgroundColor: "var(--color-accent)",
        color: "var(--color-on-accent)"
      },
      "variant:destructive": {
        backgroundColor: "var(--color-error)",
        color: "var(--color-on-error)"
      }
    },
    card: {
      base: {
        borderRadius: "var(--radius-element)",
        boxShadow: "var(--shadow-low)"
      }
    },
    badge: {
      "variant:error": {
        backgroundColor: "var(--color-error)",
        color: "var(--color-on-error)"
      },
      "variant:red": {
        backgroundColor: "var(--color-background-red)",
        color: "var(--color-text-red)"
      }
    },
    appshell: {
      base: {
        backgroundColor: "var(--color-background-body)"
      }
    },
    topnav: {
      base: {
        borderBottomColor: "var(--color-border)"
      }
    },
    sidenav: {
      base: {
        borderRightColor: "var(--color-border)"
      }
    }
  }
});
