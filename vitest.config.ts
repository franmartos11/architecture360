import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  test: {
    // Default: Node puro, para lib/** y app/api/** (lógica de servidor).
    // Los tests de hooks/** son 'use client' y necesitan un DOM real
    // (React Testing Library + jsdom) — cada uno lo pide por archivo con
    // un comentario `// @vitest-environment jsdom` al principio, en vez de
    // cambiar el default global (Vitest v4 sacó `environmentMatchGlobs`).
    environment: 'node',
    include: ['**/*.test.ts'],
    // .claude/worktrees son copias completas del repo: sin excluirlas Vitest
    // corría la suite varias veces (919 archivos en vez de 110, 13.6s en vez
    // de 2.1s) y sumaba ~40 archivos "fallando" que eran de ramas en progreso
    // y tapaban los fallos reales.
    exclude: ['**/node_modules/**', '**/.next/**', '**/.claude/**'],
  },
});
