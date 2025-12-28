import { DOLocations } from '@chainfuse/types';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm/sql';
import { endTime, startTime } from 'hono/timing';
import dns from '~/api-routes/region/[code]/instance/[iata]/dns/index.mjs';
import type { Airport } from '~/entry.cloudflare-workers';
import type { ContextVariables, EnvVars } from '~/types';
import * as schema from '~db/index';

const app = new OpenAPIHono<{ Bindings: EnvVars; Variables: ContextVariables }>();

export const pathInput = z.object({
	code: z.enum(DOLocations),
	iata: z.enum(Object.keys(await import('iata-location/data').then(({ default: allAirports }) => allAirports)) as (keyof typeof import('iata-location/data'))[]),
});

const latLongRegex = /^-?\d+(\.\d+)?$/;

export const output = z.object({
	// do_id: z.hex().trim().length(64),
	latitude: z.string().trim().regex(latLongRegex),
	longitude: z.string().trim().regex(latLongRegex),
	country: z.string().trim().length(2),
	municipality: z.string().trim().nonempty(),
});

app.openapi(
	createRoute({
		method: 'get',
		path: '/{iata}',
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
				description: '',
			},
			404: {
				content: {
					'text/plain': {
						schema: z.literal('Not Found'),
					},
				},
				description: 'Not Found',
			},
		},
	}),
	async (c) => {
		const { code, iata } = c.req.valid('param');

		startTime(c, 'db');
		const [lockedDo] = await c.var.db
			.select({
				do_id: schema.instances.do_id,
			})
			.from(schema.instances)
			.where(and(eq(schema.instances.location, code), eq(schema.instances.iata, iata)))
			.limit(1)
			.then((rows) =>
				rows.map((row) => ({
					do_id: row.do_id.toString('hex'),
				})),
			);
		endTime(c, 'db');

		if (lockedDo) {
			const { latitude_deg, longitude_deg, iso_country, municipality } = await import('iata-location/data').then(({ default: temp }) => temp[iata] as Airport);

			return c.json(
				{
					// do_id: row.do_id,
					latitude: latitude_deg,
					longitude: longitude_deg,
					country: iso_country,
					municipality,
				},
				200,
			);
		} else {
			return c.text('Not Found', 404);
		}
	},
);

app.route('/:iata/dns', dns);

export default app;
