import { component$, noSerialize, Slot } from '@builder.io/qwik';
import { routeLoader$, type RequestHandler } from '@builder.io/qwik-city';
import { SQLCache } from '@chainfuse/helpers/db';
import { drizzle } from 'drizzle-orm/d1';
import { DefaultLogger } from 'drizzle-orm/logger';
import type { Airport } from '~/entry.cloudflare-workers';
import { PROBE_DB_D1_ID } from '~/types';
import { DebugLogWriter } from '~db/extras';
import * as schema from '~db/index';

export const onGet: RequestHandler = ({ cacheControl }) => {
	// Control caching for this request for best performance and to reduce hosting costs:
	// https://qwik.dev/docs/caching/
	cacheControl({
		// Always serve a cached response by default, up to a week stale
		staleWhileRevalidate: 60 * 60 * 24 * 7,
		// Max once every 5 seconds, revalidate on the server to get a fresh version of this page
		maxAge: 5,
	});
};

export const useDrizzleRef = routeLoader$(({ platform }) =>
	noSerialize(
		drizzle(platform.env.PROBE_DB.withSession() as unknown as D1Database, {
			schema,
			logger: new DefaultLogger({ writer: new DebugLogWriter() }),
			casing: 'snake_case',
			cache: new SQLCache({ dbName: PROBE_DB_D1_ID, dbType: 'd1', cacheTTL: parseInt(platform.env.SQL_TTL, 10), strategy: 'all' }, platform.caches ?? globalThis.caches),
		}),
	),
);

export const useLocationTesterInstances = routeLoader$(({ resolveValue, fail }) =>
	resolveValue(useDrizzleRef).then(async (db) => {
		if (db) {
			return db
				.select({
					doId: schema.instances.doId,
					iata: schema.instances.iata,
					location: schema.instances.location,
				})
				.from(schema.instances)
				.then((rows) =>
					rows.map((row) => ({
						...row,
						iata: row.iata.toUpperCase(),
						doId: row.doId.toString('hex'),
					})),
				);
		} else {
			return fail(500, { error: 'Unable to database reference' });
		}
	}),
);

export const useIataLocations = routeLoader$(() => import('iata-location/data').then(({ default: allAirports }) => allAirports as Record<string, Airport>));

export const useGitHash = routeLoader$(({ platform }) => platform.env.GIT_HASH);

export const useWorkerMetadata = routeLoader$(({ platform }) => platform.env.CF_VERSION_METADATA);

export default component$(() => {
	return <Slot />;
});
