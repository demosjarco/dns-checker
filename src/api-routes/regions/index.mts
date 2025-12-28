import { DOLocations } from '@chainfuse/types';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { endTime, startTime } from 'hono/timing';
import type { ContextVariables, EnvVars } from '~/types';
import * as schema from '~db/index';

const app = new OpenAPIHono<{ Bindings: EnvVars; Variables: ContextVariables }>();

export const output = z.array(z.enum(DOLocations));

app.openapi(
	createRoute({
		method: 'get',
		path: '/',
		responses: {
			200: {
				content: {
					'application/json': {
						schema: output,
					},
				},
				description: 'Returns all Durable Object region with spawned instances',
			},
		},
	}),
	async (c) => {
		startTime(c, 'db');
		const rows = await c.var.db
			.select({
				locations: schema.locations.location,
			})
			.from(schema.locations);
		endTime(c, 'db');

		const locs = rows.map(({ locations }) => locations);
		return c.json(locs);
	},
);

export default app;
