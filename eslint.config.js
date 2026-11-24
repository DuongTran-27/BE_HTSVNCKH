import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

// T202 (NFR09): flat config cho backend (Node.js).
export default [
  { ignores: ['**/node_modules/', '**/dist/', '**/coverage/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    // Quy ước sẵn có: tham số bắt buộc nhưng không dùng đặt tiền tố "_" (vd. error handler Express 4 tham số).
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] },
  },
  prettier, // tắt mọi luật định dạng trùng Prettier – đặt cuối
];
