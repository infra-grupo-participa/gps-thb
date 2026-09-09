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
    // Entrypoint CommonJS do Passenger (Hostinger): require() e o formato certo la.
    "server.js",
    // Skills instaladas por `npx skills add` e material de trabalho da squad.
    ".agents/**",
    "tmp/**",
  ]),
]);

export default eslintConfig;
