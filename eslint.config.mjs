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
    // Worktrees de Claude Code (.claude/worktrees/*): cada uno es una copia entera del repo,
    // con su propio .next y un node_modules enlazado. Sin esto el lint los recorre y reporta
    // cientos de miles de problemas que no son de este árbol. vitest.config.ts ya los excluye.
    ".claude/**",
  ]),
]);

export default eslintConfig;
