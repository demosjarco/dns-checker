import { qwikEslint9Plugin } from 'eslint-plugin-qwik';
import tseslint from 'typescript-eslint';
import rootConfig from '../../eslint.config.mjs';

export default tseslint.config({
	// config with just ignores is the replacement for `.eslintignore`
	ignores: ['dist/*', 'server/*', 'tmp/*'],
	extends: [...rootConfig, qwikEslint9Plugin.configs.recommended],
	plugins: {
		'@typescript-eslint': tseslint.plugin,
	},
	languageOptions: {
		parserOptions: {
			projectService: {
				allowDefaultProject: ['eslint.config.mjs'],
			},
			tsconfigRootDir: import.meta.dirname,
			ecmaFeatures: {
				jsx: true,
			},
		},
	},
	rules: {},
});
