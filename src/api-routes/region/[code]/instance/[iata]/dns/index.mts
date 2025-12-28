import { DOLocations } from '@chainfuse/types';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm/sql';
import { endTime, startTime, wrapTime } from 'hono/timing';
import { DNSRecordType, type ContextVariables, type EnvVars } from '~/types';
import * as schema from '~db/index';

const app = new OpenAPIHono<{ Bindings: EnvVars; Variables: ContextVariables }>();

export const pathInput = z.object({
	code: z.enum(DOLocations),
	iata: z.enum(Object.keys(await import('iata-location/data').then(({ default: allAirports }) => allAirports)) as (keyof typeof import('iata-location/data'))[]),
	rrtype: z.enum(DNSRecordType),
	hostname: z.string().trim().nonempty().regex(z.regexes.domain),
});

export const output = z.record(
	z.url({ protocol: /^(https|tls)$/, hostname: z.regexes.domain }).openapi({
		description: 'DoH/DoT resolver endpoint URL',
	}),
	z.union([
		z.null().openapi({
			description: 'Resolver unreachable or returned an error',
		}),
		z.looseObject({}).openapi({
			description: 'Resolver response payload for query',
		}),
	]),
);

app.openapi(
	createRoute({
		method: 'get',
		path: '/{rrtype}/{hostname}',
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
				description: 'Per-resolver DNS answers for queries from this location',
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
		startTime(c, 'db');
		const [[lockedDo], servers] = await Promise.all([
			c.var.db
				.select({
					do_id: schema.instances.do_id,
					location: schema.instances.location,
				})
				.from(schema.instances)
				.where(and(eq(schema.instances.location, c.req.valid('param').code), eq(schema.instances.iata, c.req.valid('param').iata)))
				.limit(1)
				.then((rows) =>
					rows.map((row) => ({
						...row,
						do_id: row.do_id.toString('hex'),
					})),
				),
			c.var.db
				.select()
				.from(schema.global_servers)
				.then((rows) =>
					rows
						// Get just the server addresses
						.map((row) => Object.values(row))
						// Fix double encapsulation
						.flat()
						// Get only the ones that exist
						.filter((row) => row !== null)
						// Convert to URL objects (already URL strings)
						.map((row) => new URL(row)),
				),
		]);
		endTime(c, 'db');

		if (lockedDo) {
			const doStub = c.env.LOCATION_TESTER.get(c.env.LOCATION_TESTER.idFromString(lockedDo.do_id), { locationHint: lockedDo.location });

			const responses = await Promise.all(
				servers.map((server) => {
					// including the final ":"
					if (server.protocol === 'https:') {
						return wrapTime(
							c,
							`dns-${server.protocol.slice(0, -1)}-${server.hostname}`,
							(doStub.getDohQuery(server.toString(), c.req.valid('param').hostname, c.req.valid('param').rrtype, c.var.browserCachePolicy) as unknown as Promise<string[] | (string[] | (string & unknown[]))[]>)
								.then((response) => ({
									[server.toString()]: response,
								}))
								.catch((error) => {
									console.error(error);

									return {
										[server.toString()]: null,
									};
								}),
						);
					} else {
						return wrapTime(
							c,
							`dns-${server.protocol.slice(0, -1)}-${server.hostname}`,
							doStub
								.getDotQuery(server.toString(), c.req.valid('param').hostname, c.req.valid('param').rrtype, c.var.browserCachePolicy)
								.then((response) => ({
									[server.toString()]: response,
								}))
								.catch((error) => {
									console.error(error);

									return {
										[server.toString()]: null,
									};
								}),
						);
					}
				}),
			);

			return c.json(Object.assign({}, ...responses), 200);
		} else {
			return c.text('Not Found', 404);
		}
	},
);

export default app;
