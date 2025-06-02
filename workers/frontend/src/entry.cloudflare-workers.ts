import type { EnvVars } from '~/types.js';
import { fetch } from '../server/entry.cloudflare-pages';

export { LocationTester } from '~do/locationTester.mjs';

export default {
	/**
	 * @link https://qwik.dev/docs/deployments/cloudflare-pages/#cloudflare-pages-entry-middleware
	 */
	fetch,
} satisfies ExportedHandler<EnvVars>;
