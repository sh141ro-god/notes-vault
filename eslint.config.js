import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'functions'] },

  // Исходники приложения: строгая типизированная проверка.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Тесты: допускаем non-null assertion для краткости проверок.
  {
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Конфиг сборки: TS-парсер без проверки типов.
  {
    files: ['vite.config.ts', 'vitest.config.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // Flat-конфиг ESLint самого проекта.
  {
    files: ['eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  prettier,
)
