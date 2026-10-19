// Flat ESLint config (ESLint 8.57 loads eslint.config.js in flat mode; the package is
// "type": "module", so this file is ESM). The previous legacy-style config could never load.
//
// Two tiers, because the type-checked rule sets were declared but never runnable, see ADR-002:
//   - errors: formatting, syntax and base TypeScript correctness — the gate blocks on these;
//   - warnings: the full type-aware strictness (no-explicit-any, unsafe-*, floating promises)
//     which the code does not meet yet; reported on every run, not blocking.
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

const baseRules = {
  ...tsPlugin.configs.recommended.rules,
  ...tsPlugin.configs.stylistic.rules
};
const typeAwareRules = {
  ...tsPlugin.configs['recommended-type-checked'].rules,
  ...tsPlugin.configs['stylistic-type-checked'].rules
};

const rules = {
  ...prettierConfig.rules,
  // TypeScript's DOM lib already covers browser globals; no-undef only duplicates it.
  'no-undef': 'off',
  // TypeScript handles declaration merging (type + const sharing name); ESLint's no-redeclare falsely flags it.
  'no-redeclare': 'off',
  ...baseRules
};
// Rules only the type-aware sets add become warnings (ADR-002: strictness debt, not dropped).
for (const [rule, config] of Object.entries(typeAwareRules)) {
  if (rule in baseRules) continue;
  const options = Array.isArray(config) ? config.slice(1) : [];
  rules[rule] = ['warn', ...options];
}
Object.assign(rules, {
  'prettier/prettier': 'error',
  // 125 sites use `any`; PROJECT_PRINCIPLES wants none, the cleanup is tracked as debt (ADR-002).
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/consistent-type-imports': 'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
  ],
  '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
  '@typescript-eslint/require-await': 'warn',
  '@typescript-eslint/no-floating-promises': 'warn',
  '@typescript-eslint/no-misused-promises': 'warn'
});

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.config.*', '**/*.d.ts']
  },
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
        tsconfigRootDir: rootDir
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin
    },
    rules
  }
];
