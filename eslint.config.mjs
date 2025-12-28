import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import { qwikEslint9Plugin } from 'eslint-plugin-qwik';
import tseslint from 'typescript-eslint';

export default tseslint.config({
	ignores: ['dist/*', 'server/*', 'tmp/*', 'worker-configuration.d.ts'],
	extends: [eslint.configs.recommended, tseslint.configs.recommendedTypeChecked, tseslint.configs.stylisticTypeChecked, eslintConfigPrettier, qwikEslint9Plugin.configs.recommended],
	plugins: {
		'@typescript-eslint': tseslint.plugin,
	},
	languageOptions: {
		parser: tseslint.parser,
		parserOptions: {
			ecmaVersion: 'latest',
			jsDocParsingMode: 'type-info',
			lib: ['esnext'],
			projectService: {
				allowDefaultProject: ['eslint.config.mjs'],
				defaultProject: 'tsconfig.json',
			},
			tsconfigRootDir: import.meta.dirname,
			ecmaFeatures: {
				jsx: true,
			},
		},
	},
	rules: {
		'@typescript-eslint/no-explicit-any': ['warn', { ignoreRestArgs: true }],
		'@typescript-eslint/explicit-module-boundary-types': 'off',
		'@typescript-eslint/no-inferrable-types': 'off',
		'@typescript-eslint/no-non-null-assertion': 'off',
		'@typescript-eslint/no-empty-interface': 'off',
		'@typescript-eslint/no-namespace': 'off',
		'@typescript-eslint/no-empty-function': 'off',
		'@typescript-eslint/no-this-alias': 'off',
		'@typescript-eslint/ban-types': 'off',
		'@typescript-eslint/ban-ts-comment': 'off',
		'prefer-spread': 'off',
		'no-case-declarations': 'off',
		'no-console': 'off',
		// Note: you must disable the base rule as it can report incorrect errors
		'no-unused-vars': 'off',
		'@typescript-eslint/no-unused-vars': 'warn',
		'@typescript-eslint/no-unnecessary-condition': 'warn',
		'@typescript-eslint/no-import-type-side-effects': 'error',
		'@typescript-eslint/consistent-type-imports': ['error', { disallowTypeAnnotations: false }],
		'no-async-promise-executor': 'off',
		'@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
		'@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true, ignoreVoidOperator: true }],
		'@typescript-eslint/only-throw-error': 'off',
		'@typescript-eslint/no-misused-promises': 'off',
		'qwik/no-use-visible-task': 'off',
	},
});
