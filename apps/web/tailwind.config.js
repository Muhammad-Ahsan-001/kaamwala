/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (name, steps) => Object.fromEntries(steps.map((step) => [step, token(`${name}-${step}`)]));

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class", // Light theme only: the class is never set.
  theme: {
    // Sizes carry no line-height: Nastaliq needs far more room than Latin,
    // so line-height is set once per script.
    // --type is the one dial for all text. rem itself stays put, so spacing and 48px tap targets do not shrink with it.
    fontSize: {
      xs: "calc(0.75rem * var(--type, 1))",
      sm: "calc(0.875rem * var(--type, 1))",
      base: "calc(1rem * var(--type, 1))",
      lg: "calc(1.125rem * var(--type, 1))",
      xl: "calc(1.25rem * var(--type, 1))",
      "2xl": "calc(1.5rem * var(--type, 1))",
      "3xl": "calc(1.875rem * var(--type, 1))",
      "4xl": "calc(2.25rem * var(--type, 1))",
      "5xl": "calc(3rem * var(--type, 1))",
    },
    extend: {
      colors: {
        page: token("page"),
        surface: token("surface"),
        sunken: token("sunken"),
        line: token("line"),
        ink: token("ink"),
        soft: token("soft"),
        faint: token("faint"),
        /** Trust green: actions. */
        brand: scale("brand", [50, 100, 200, 500, 600, 700, 800]),
        /** Roshan amber: AI at work and highlights. */
        amber: scale("amber", [50, 100, 400, 500, 700, 800]),
        /** Busy red: status only. */
        busy: scale("busy", [50, 100, 500, 600, 700]),
      },
      boxShadow: {
        card: "0 1px 2px rgb(60 50 30 / 0.04), 0 6px 18px rgb(60 50 30 / 0.05)",
        lift: "0 10px 28px rgb(60 50 30 / 0.16)",
        bar: "0 -4px 16px rgb(60 50 30 / 0.06)",
      },
      borderRadius: { "4xl": "2rem" },
      keyframes: {
        ring: { "0%": { transform: "scale(1)", opacity: "0.5" }, "100%": { transform: "scale(1.6)", opacity: "0" } },
        rise: { "0%": { transform: "translateY(10px)", opacity: "0" }, "100%": { transform: "translateY(0)", opacity: "1" } },
        sheet: { "0%": { transform: "translateY(100%)" }, "100%": { transform: "translateY(0)" } },
        wave: { "0%,100%": { transform: "scaleY(0.35)" }, "50%": { transform: "scaleY(1)" } },
        shimmer: { "0%": { backgroundPosition: "200% 0" }, "100%": { backgroundPosition: "-200% 0" } },
        pop: { "0%": { transform: "scale(0.92)" }, "60%": { transform: "scale(1.05)" }, "100%": { transform: "scale(1)" } },
        "page-in": { "0%": { opacity: "0", transform: "translateX(calc(var(--page-dir) * 16px))" }, "100%": { opacity: "1", transform: "none" } },
        "page-back": { "0%": { opacity: "0", transform: "translateX(calc(var(--page-dir) * -16px))" }, "100%": { opacity: "1", transform: "none" } },
        thumb: { "0%": { transform: "scale(0.6)", opacity: "0.9" }, "100%": { transform: "scale(2.4)", opacity: "0" } },
      },
      animation: {
        ring: "ring 1.8s ease-out infinite",
        rise: "rise 0.28s ease-out both",
        sheet: "sheet 0.24s ease-out both",
        wave: "wave 0.9s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
        pop: "pop 0.22s ease-out",
        "page-in": "page-in 0.22s ease-out backwards",
        "page-back": "page-back 0.22s ease-out backwards",
        thumb: "thumb 0.5s ease-out forwards",
      },
    },
  },
  plugins: [],
};
