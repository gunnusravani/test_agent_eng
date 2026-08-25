import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Instructor reference material (grading ground truth, not app source) — gitignored too,
      // but ESLint doesn't read .gitignore on its own, so it needs its own entry here.
      "class-02A/**",
      "class-02B/**",
      "my-work/**",
    ],
  },
];

export default eslintConfig;
