import type { EnvVars } from '~/types.js';
import { fetch } from '../server/entry.cloudflare-pages';

export default {
	fetch,
} satisfies ExportedHandler<EnvVars>;
