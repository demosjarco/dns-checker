import { OpenAPIHono } from '@hono/zod-openapi';
import region from '~/api-routes/region/[code]/index.mjs';
import regions from '~/api-routes/regions/index.mjs';
import type { ContextVariables, EnvVars } from '~/types';

const app = new OpenAPIHono<{ Bindings: EnvVars; Variables: ContextVariables }>();

const title = 'DemosJarco DNS API';

app.doc31('/generate/openapi31', (c) => ({
	openapi: '3.1.0',
	info: {
		title,
		version: c.env.GIT_HASH ?? 'Local',
	},
}));
app.doc('/generate/openapi', (c) => ({
	openapi: '3.0.0',
	info: {
		title,
		version: c.env.GIT_HASH ?? 'Local',
	},
}));
app.doc('/generate/dns.cf-apig.openapi', (c) => ({
	openapi: '3.0.0',
	info: {
		title,
		version: c.env.GIT_HASH ?? 'Local',
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
