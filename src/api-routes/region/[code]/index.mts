import { DOLocations } from '@chainfuse/types';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm/sql';
import { endTime, startTime } from 'hono/timing';
import instance from '~/api-routes/region/[code]/instance/[iata]/index.mjs';
import type { ContextVariables, EnvVars } from '~/types';
import * as schema from '~db/index';

const app = new OpenAPIHono<{ Bindings: EnvVars; Variables: ContextVariables }>();

export const pathInput = z.object({
	code: z.enum(DOLocations),
});

export const output = z.array(z.enum(Object.keys(await import('iata-location/data').then(({ default: allAirports }) => allAirports)) as (keyof typeof import('iata-location/data'))[]));

app.openapi(
	createRoute({
		method: 'get',
		path: '/{code}',
		request: {
			params: pathInput,
		},
		responses: {
			200: {
				content: {
					'application/json': {
						schema: output,
					},
				},
				description: 'Lists IATA codes of deployed LocationTester instances for the requested region code.',
			},
		},
	}),
	async (c) => {
		const { code } = c.req.valid('param');

		startTime(c, 'db');
		const rows = await c.var.db
			.select({
				iata: schema.instances.iata,
			})
			.from(schema.instances)
			.where(eq(schema.instances.location, code));
		endTime(c, 'db');

		const iatas = rows.map(({ iata }) => iata);

		return c.json(iatas);
	},
);

app.route('/:code/instance', instance);

export default app;
