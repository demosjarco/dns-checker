import { OpenAPIHono } from '@hono/zod-openapi';
import type { oas30, oas31 } from 'openapi3-ts';
import region from '~/api-routes/region/[code]/index.mjs';
import regions from '~/api-routes/regions/index.mjs';
import type { ContextVariables, EnvVars } from '~/types';

const app = new OpenAPIHono<{ Bindings: EnvVars; Variables: ContextVariables }>();

const title = 'DemosJarco DNS API';
const description = 'Check DNS records for any domain or subdomain';
const contact: oas30.ContactObject | oas31.ContactObject = { name: 'GitHub Issues', url: 'https://github.com/demosjarco/dns-checker/issues' };
const license: oas30.LicenseObject | oas31.LicenseObject = { name: 'MIT', url: 'https://opensource.org/licenses/MIT' };

app.doc31('/generate/openapi31', (c) => ({
	openapi: '3.1.0',
	info: {
		title,
		description,
		contact,
		license,
		version: 'main',
	},
}));
app.doc('/generate/openapi', (c) => ({
	openapi: '3.0.0',
	info: {
		title,
		description,
		contact,
		license,
		version: 'main',
	},
}));
app.doc('/generate/dns.cf-apig.openapi', (c) => ({
	openapi: '3.0.0',
	info: {
		title,
		description,
		contact,
		license,
		version: 'main',
	},
	servers: [
		{
			url: 'https://dns.sushidata.ai',
		},
	],
}));

app.route('/api/regions', regions);
app.route('/api/region', region);

export default app;
