import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Saved third-party Jobstreet assets used only as archived layout references.
    "tests/layout/**",
    // Local Python virtualenv and vendored Playwright assets are not part of the app source.
    ".venv/**",
  ]),
]);

export default eslintConfig;
