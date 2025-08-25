// Conditional PostCSS config: keep original Tailwind plugin form for Next build (stable),
// but allow Vitest to skip heavy CSS processing to avoid config issues.
const isVitest = !!process.env.VITEST;

const config = {
  plugins: isVitest ? [] : ["@tailwindcss/postcss"],
};

export default config;
