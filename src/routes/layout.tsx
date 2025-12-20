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

export const useBrowserCachePolicy = routeLoader$(({ platform, request }) => {
	const headers = (platform.request ?? request).headers;
	const cacheControl = new Set((headers.get('Cache-Control')?.split(',') ?? []).map((directive) => directive.trim().toLowerCase()));
	// RFC 7234: no-store forbids storing; no-cache/zero max-age require revalidation so we skip reads
	const antiCacheHeader = cacheControl.has('no-store') || cacheControl.has('no-cache') || cacheControl.has('max-age=0') || cacheControl.has('s-maxage=0');

	return !antiCacheHeader;
});

export const useDrizzleRef = routeLoader$(async ({ platform, resolveValue }) =>
	noSerialize(
		drizzle(platform.env.PROBE_DB.withSession() as unknown as D1Database, {
			schema,
			logger: new DefaultLogger({ writer: new DebugLogWriter() }),
			casing: 'snake_case',
			cache: (await resolveValue(useBrowserCachePolicy)) ? new SQLCache({ dbName: PROBE_DB_D1_ID, dbType: 'd1', cacheTTL: parseInt(platform.env.SQL_TTL, 10), strategy: 'all' }, platform.caches ?? globalThis.caches) : undefined,
		}),
	),
);

export const useLocationTesterInstances = routeLoader$(({ resolveValue }) =>
	resolveValue(useDrizzleRef).then(async (db) =>
		db!
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
			),
	),
);

export const useIataLocations = routeLoader$(() => import('iata-location/data').then(({ default: allAirports }) => allAirports as Record<string, Airport>));

export const useGitHash = routeLoader$(({ platform }) => platform.env.GIT_HASH);

export const useWorkerMetadata = routeLoader$(({ platform }) => platform.env.CF_VERSION_METADATA);

export default component$(() => {
	return <Slot />;
});
