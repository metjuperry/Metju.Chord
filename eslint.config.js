// Flat config: typescript-eslint's recommended set plus the two React hooks rules. Nothing stylistic
// (there is no formatter yet, see CONTRIBUTING).
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');

const nodeGlobals = { require: 'readonly', module: 'writable', __dirname: 'readonly', process: 'readonly', console: 'readonly' };
const workerGlobals = { self: 'readonly', caches: 'readonly', fetch: 'readonly', URL: 'readonly', Request: 'readonly', Response: 'readonly' };

module.exports = tseslint.config(
    { ignores: ['dist/**', '.levels/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'public/**'] },
    // A disable comment that no longer suppresses anything is reported (as a warning).
    { linterOptions: { reportUnusedDisableDirectives: 'warn' } },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            // A leading underscore marks a deliberately unused name (destructuring to drop a key, ignored arguments).
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true }],
        },
    },
    {
        files: ['src/**/*.{ts,tsx}'],
        plugins: { 'react-hooks': reactHooks },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            // An effect's return value is its cleanup, and React calls whatever it is on unmount: anything that
            // isn't a function crashes the app ("c is not a function"). An expression body returns what the
            // expression gives, e.g. the Promise from scrollTo in newer browsers, which once blanked the app when
            // Learn closed. So an effect that calls something uses a block body. (Replaces the regex test that
            // was in src/effects.test.ts.)
            'no-restricted-syntax': ['error', {
                selector: ':matches(CallExpression[callee.name=/^use(Layout)?Effect$/], CallExpression[callee.property.name=/^use(Layout)?Effect$/]) > ArrowFunctionExpression:first-child[body.type=/^(CallExpression|AwaitExpression|AssignmentExpression|NewExpression|LogicalExpression)$/]',
                message: 'An effect returns its cleanup: give it a block body ({ … }) so a call\'s return value is not mistaken for one.',
            }],
        },
    },
    {
        // Tests poke at the untrusted-input readers with deliberately wrong types; the level scripts talk to Tone internals.
        files: ['**/*.test.ts', 'scripts/**/*.ts'],
        rules: { '@typescript-eslint/no-explicit-any': 'warn' },
    },
    {
        // Plain CommonJS scripts and configs.
        files: ['**/*.cjs', '*.config.js'],
        languageOptions: { globals: nodeGlobals },
        rules: { '@typescript-eslint/no-require-imports': 'off' },
    },
    {
        // The service worker is plain JS in a worker scope.
        files: ['src/sw.js'],
        languageOptions: { globals: workerGlobals },
    },
);
