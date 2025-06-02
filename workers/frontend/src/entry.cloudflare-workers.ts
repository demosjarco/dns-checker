import { DOLocations } from '@chainfuse/types';
import { DefaultLogger } from 'drizzle-orm/logger';
import type { EnvVars } from '~/types.js';
import { DebugLogWriter, SQLCache } from '~db/extras.mjs';
import { fetch as assetFetch } from '../server/entry.cloudflare-pages';

export { LocationTester } from '~do/locationTester.mjs';

/**
 * Temporary
 * @link https://github.com/elsbrock/iata-location/issues/3
 */
interface Airport {
	latitude_deg: string;
	longitude_deg: string;
	iso_country: string;
	iso_region: string;
	municipality: string;
	iata_code: string;
}

export default {
	/**
	 * @link https://qwik.dev/docs/deployments/cloudflare-pages/#cloudflare-pages-entry-middleware
	 */
	fetch: assetFetch,
	async scheduled(event, env, ctx) {
		const d1Session = env.PROBE_DB.withSession('first-unconstrained');

		function drizzleRef(dbRef: D1Database = env.PROBE_DB) {
			return import('drizzle-orm/d1').then(({ drizzle }) =>
				drizzle(typeof dbRef.withSession === 'function' ? (dbRef.withSession(d1Session.getBookmark() ?? 'first-unconstrained') as unknown as D1Database) : dbRef, {
					logger: new DefaultLogger({ writer: new DebugLogWriter() }),
					casing: 'snake_case',
					// @ts-expect-error We're using coop cache (drizzle needs to fix types)
					cache: new SQLCache(parseInt(env.SQL_TTL, 10), ctx),
				}),
			);
		}

		// 1. Make sure all locations exist
		await Promise.all([drizzleRef(), import('../db/schema')]).then(([db, { locations }]) =>
			db
				.insert(locations)
				.values(Object.values(DOLocations).map((location) => ({ location })))
				.onConflictDoNothing(),
		);

		// Calculate TTL until 15 minutes before next GMT midnight
		const now = new Date(event.scheduledTime);
		const nextGMTMidnight = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
		const fifteenMinutesBeforeGMTMidnight = new Date(nextGMTMidnight.getTime() - 15 * 60 * 1000);

		await Promise.all([
			import('@chainfuse/helpers')
				.then(({ NetHelpers }) =>
					NetHelpers.loggingFetch(new URL('colo-route/colos', 'https://colo-route.jross.dev'), {
						logging: { level: 1, color: false },
						cf: {
							cacheTtlByStatus: {
								// Cache until 15 minutes before next GMT midnight
								'200-299': Math.floor((fifteenMinutesBeforeGMTMidnight.getTime() - now.getTime()) / 1000),
							},
							cacheEverything: true,
						},
					}),
				)
				.then((response) => {
					if (response.ok) {
						return response.json<`${string}${number}`[]>().then((doColos) => doColos.map((doColo) => doColo.toLowerCase()));
					} else {
						throw new Error(`${response.status} ${response.statusText} (${response.headers.get('cf-ray')}) Failed to fetch DO colos: `);
					}
				}),
			Promise.all([drizzleRef(), import('../db/schema')]).then(([db, { instances }]) =>
				db
					.select({
						doId: instances.doId,
						location: instances.location,
						iata: instances.iata,
						colo: instances.colo,
					})
					.from(instances)
					.$withCache()
					.then((rows) =>
						rows.map(({ doId, ...row }) => ({
							...row,
							doId: doId.toString('hex'),
						})),
					),
			),
		]).then(async ([doColos, instanceColos]) => {
			const instanceFullColos = instanceColos.map((instanceColo) => `${instanceColo.iata}${instanceColo.colo}`.toLowerCase());
			console.debug('doColos', doColos);
			console.debug('instanceColos', instanceColos);

			// Find colos that exist in instances but not in doColos (should be deleted)
			const colosToDeleteStrings = instanceFullColos.filter((instanceFullColo) => !doColos.includes(instanceFullColo));
			const colosToDelete = instanceColos.filter((instanceColo) => {
				const instanceFullColo = `${instanceColo.iata}${instanceColo.colo}`.toLowerCase();
				return colosToDeleteStrings.includes(instanceFullColo);
			});

			if (colosToDelete.length > 0) {
				console.warn('Deleting colos', colosToDelete);

				ctx.waitUntil(
					Promise.allSettled(
						colosToDelete.map(async (coloToDelete) => {
							const stub = env.LOCATION_TESTER.get(env.LOCATION_TESTER.idFromString(coloToDelete.doId), { locationHint: coloToDelete.location });

							await Promise.all([drizzleRef(), import('../db/schema'), import('drizzle-orm'), stub.nuke()])
								// Delete from D1
								.then(([db, { instances }, { eq, sql }]) => db.delete(instances).where(eq(instances.doId, sql`unhex(${coloToDelete.doId})`)));
						}),
					),
				);
			} else {
				console.debug('No colos to delete');
			}

			// Find colos that don't exist in instances but do in doColos (should be created)
			const colosToCreate = doColos.filter((doColo) => !instanceFullColos.includes(doColo));

			if (colosToCreate.length > 0) {
				console.info('Creating colos', colosToCreate);

				await Promise.allSettled(
					colosToCreate.map(async (coloToCreate) => {
						await Promise.all([
							//
							import('@chainfuse/helpers').then(({ NetHelpers }) => NetHelpers.cfApi(env.CF_API_TOKEN, { level: 1, color: false })),
							import('iata-location').then(({ lookupAirport }) => lookupAirport(coloToCreate.slice(0, 3).toUpperCase()) as Promise<Airport | undefined>),
						])
							.then(([cfApi, iataLocation]) =>
								cfApi.loadBalancers.regions.list({
									account_id: env.CF_ACCOUNT_ID,
									country_code_a2: iataLocation?.iso_country,
									...(iataLocation?.iso_country &&
										/**
										 * Only US and Canada support `subdivision_code`
										 * @link https://developers.cloudflare.com/load-balancing/reference/region-mapping-api/
										 */
										['US', 'CA'].includes(iataLocation.iso_country) && { subdivision_code: iataLocation.iso_region }),
								}),
							)
							.then((regionInfo) => {
								console.debug('Trying to create colo', regionInfo);
							});
					}),
				);
			} else {
				console.debug('No colos to create');
			}
		});
	},
} satisfies ExportedHandler<EnvVars>;
