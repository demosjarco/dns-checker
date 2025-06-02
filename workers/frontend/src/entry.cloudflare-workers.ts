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
	iso_region: `${string}-${string}`;
	municipality: string;
	iata_code: string;
}

/**
 * Missing from ts type
 */
interface LoadBalancerRegionResults {
	iso_standard: string;
	regions: LoadBalancerRegion[];
}
interface LoadBalancerRegion {
	region_code: 'EEU' | 'ENAM' | 'ME' | 'NAF' | 'NEAS' | 'NSAM' | 'OC' | 'SAF' | 'SAS' | 'SEAS' | 'SSAM' | 'WEU' | 'WNAM';
	countries: LoadBalancerCountry[];
}
interface LoadBalancerCountry {
	country_code_a2: string;
	country_name: string;
	country_subdivisions?: LoadBalancerCountryRegion[];
}
interface LoadBalancerCountryRegion {
	subdivision_code_a2: string;
	subdivision_name: string;
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

				await Promise.all([
					import('@chainfuse/helpers')
						.then(({ NetHelpers }) => NetHelpers.cfApi(env.CF_API_TOKEN, { level: 1, color: false }))
						.then((cfApi) => cfApi.loadBalancers.regions.list({ account_id: env.CF_ACCOUNT_ID }))
						.then((result) => result as LoadBalancerRegionResults),
					import('iata-location/data').then(({ default: allAirports }) => allAirports as Record<string, Airport>),
				]).then(([{ regions }, allAirports]) =>
					Promise.allSettled(
						colosToCreate.map((coloToCreate) => {
							const iataCode = coloToCreate.slice(0, 3).toUpperCase();
							const iataLocation = allAirports[iataCode];

							if (iataLocation) {
								// Extract subdivision code from iso_region (part after hyphen)
								const subdivisionCode = iataLocation.iso_region.split('-')[1]?.toUpperCase();

								// Find matching region_code by iterating over regions
								const matchingRegion = regions.find((region) =>
									region.countries.some((country) => {
										// First check if country matches
										if (country.country_code_a2.toUpperCase() !== iataLocation.iso_country.toUpperCase()) {
											return false;
										} else if (subdivisionCode && country.country_subdivisions?.length) {
											// If subdivision code exists and country has subdivisions, check subdivision match
											return country.country_subdivisions.some((subdivision) => subdivision.subdivision_code_a2.toUpperCase() === subdivisionCode);
										} else {
											// If no subdivision code or no subdivisions available, country match is sufficient
											return true;
										}
									}),
								)?.region_code;

								if (matchingRegion) {
									console.debug(iataCode, iataLocation, matchingRegion);
								} else {
									throw new Error(`No Cloudflare location found for ${iataCode} (${[iataLocation.iso_region, iataLocation.iso_country].join(', ')})`);
								}
							} else {
								throw new Error(`No IATA location found for ${iataCode}`);
							}
						}),
					).then((results) => results.filter((result) => result.status === 'rejected').map(({ reason }) => console.error(reason))),
				);
			} else {
				console.debug('No colos to create');
			}
		});
	},
} satisfies ExportedHandler<EnvVars>;
