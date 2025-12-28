import { component$, noSerialize, Slot } from '@builder.io/qwik';
import { routeLoader$, type RequestHandler } from '@builder.io/qwik-city';
import { browserCachePolicy, drizzleDb, iataLocations } from '~/routes/extras';
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

export const useBrowserCachePolicy = routeLoader$(({ platform, request }) => browserCachePolicy(platform, request));

export const useDrizzleRef = routeLoader$(async ({ platform, resolveValue }) => noSerialize(drizzleDb(platform, await resolveValue(useBrowserCachePolicy))));

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

export const useIataLocations = routeLoader$(() => iataLocations);

export default component$(() => {
	return <Slot />;
});
