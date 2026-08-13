'use strict';

// Minimal, non-destructive ESLint baseline for `npm run lint` (eslint
// server/ tests/). The repository had no ESLint config at all before this —
// see the Shipping V1 / Order UI completion pass report for context. Scope
// is deliberately narrow: catch real bugs (undefined vars, duplicate
// declarations, unreachable code, broken syntax), not enforce a style
// migration (no semicolon/quote/indentation/line-length rules) on a
// codebase that was never linted before.
module.exports = {
  root: true,
  env: {
    node: true,
    commonjs: true,
    es2021: true,
  },
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'script',
  },
  extends: ['eslint:recommended'],
  rules: {
    // Fire-and-forget `catch {}` / `catch (_) {}` blocks are a deliberate,
    // pervasive pattern in this codebase (non-fatal audit logs, best-effort
    // cache warms, standalone-MongoDB fallbacks) — not a bug.
    'no-empty': ['error', { allowEmptyCatch: true }],
    // Real bug class worth keeping as an error (accidental globals).
    'no-undef': 'error',
    // Unused vars/imports are a genuine (if low-severity) issue, but a
    // blanket error would likely surface a large pre-existing backlog on a
    // never-linted codebase — keep it visible without failing the build.
    'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      files: ['tests/**/*.js'],
      env: { jest: true },
    },
  ],
  ignorePatterns: ['node_modules/'],
};
