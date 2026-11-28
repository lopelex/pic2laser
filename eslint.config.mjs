import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'wasm/**/target/**', 'src/renderer/wasm/**', '**/*.orig'] },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-control-regex': 'off', // Steuerzeichen werden bewusst gefiltert bzw. als Platzhalter genutzt
    },
  },
  // Main-Prozess, Build-Skripte, Tests: CommonJS in Node
  {
    files: ['src/main/**/*.js', 'build/**/*.js', 'test/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  // Oberfläche: ES-Module im Browser (Electron-Renderer, Sandbox)
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser } },
  },
  {
    files: ['src/renderer/pipeline-worker.js'],
    languageOptions: { globals: { ...globals.worker } },
  },
];
