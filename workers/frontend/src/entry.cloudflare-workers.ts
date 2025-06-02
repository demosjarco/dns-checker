import type { EnvVars } from '~/types.js';
import { fetch } from '../server/entry.cloudflare-pages';

export { LocationTester } from '../do/locationTester.mjs';

export default {
	fetch,
} satisfies ExportedHandler<EnvVars>;
