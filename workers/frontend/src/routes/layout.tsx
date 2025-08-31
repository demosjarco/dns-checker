import { component$, noSerialize, Slot } from '@builder.io/qwik';
import { routeLoader$, type RequestHandler } from '@builder.io/qwik-city';
import type { Airport } from '~/entry.cloudflare-workers';
import { PROBE_DB_D1_ID } from '~/types';

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

export const useD1Session = routeLoader$(({ platform }) => noSerialize(platform.env.PROBE_DB.withSession('first-unconstrained')));

export const useDrizzleRef = routeLoader$(({ platform, resolveValue }) =>
	Promise.all([import('drizzle-orm/d1'), resolveValue(useD1Session), import('drizzle-orm/logger'), import('~db/extras')]).then(([{ drizzle }, d1Session, { DefaultLogger }, { DebugLogWriter, SQLCache }]) =>
		noSerialize(
			drizzle(typeof platform.env.PROBE_DB.withSession === 'function' ? (platform.env.PROBE_DB.withSession(d1Session?.getBookmark() ?? 'first-unconstrained') as unknown as D1Database) : platform.env.PROBE_DB, {
				logger: new DefaultLogger({ writer: new DebugLogWriter() }),
				casing: 'snake_case',
				cache: new SQLCache({ dbName: PROBE_DB_D1_ID, dbType: 'd1', cacheTTL: parseInt(platform.env.SQL_TTL, 10), strategy: 'all' }, platform.caches),
			}),
		),
	),
);

export const useLocationTesterInstances = routeLoader$(({ resolveValue, fail }) =>
	Promise.all([resolveValue(useDrizzleRef), import('~db/schema')]).then(async ([db, { instances }]) => {
		if (db) {
			return await db
				.select({
					doId: instances.doId,
					iata: instances.iata,
					location: instances.location,
				})
				.from(instances)
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
