/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  plugins: [
    'react',
    '@typescript-eslint',
    'unused-imports',
    'prettier'
  ],
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
    'next/core-web-vitals'
  ],
  rules: {
    // 🔥 Supprimer imports/vars inutilisés
    'unused-imports/no-unused-imports': 'warn',
    'unused-imports/no-unused-vars': [
      'warn',
      { vars: 'all', args: 'after-used', ignoreRestSiblings: true },
    ],

    // ✅ Meilleure lisibilité & conventions
    'react/react-in-jsx-scope': 'off', // plus utile avec Next.js
    '@typescript-eslint/no-explicit-any': 'warn', // avertit sur any
    'prettier/prettier': 'warn', // met en forme automatiquement

    // Optionnel : autoriser les noms de props en camelCase
    'react/jsx-pascal-case': 'off',
  },
  settings: {
    react: { version: 'detect' },
  },
};