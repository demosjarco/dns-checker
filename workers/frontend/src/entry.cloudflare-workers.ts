import { DOLocations } from '@chainfuse/types';
import type { Buffer } from 'node:buffer';
import type { EnvVars } from '~/types.js';
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
		const dbRef = env.PROBE_DB;
		const d1Session = env.PROBE_DB.withSession('first-unconstrained');

		function drizzleRef() {
			return Promise.all([import('drizzle-orm/d1'), import('drizzle-orm/logger'), import('~db/extras.mjs')]).then(([{ drizzle }, { DefaultLogger }, { DebugLogWriter, SQLCache }]) =>
				drizzle(typeof dbRef.withSession === 'function' ? (dbRef.withSession(d1Session.getBookmark() ?? 'first-unconstrained') as unknown as D1Database) : dbRef, {
					logger: new DefaultLogger({ writer: new DebugLogWriter() }),
					casing: 'snake_case',
					cache: new SQLCache(parseInt(env.SQL_TTL, 10)),
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
								.then(([db, { instances }, { eq, sql }]) => db.delete(instances).where(eq(instances.doId, sql<Buffer>`unhex(${coloToDelete.doId})`)));
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
						colosToCreate.map(async (coloToCreate) => {
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
									const locationHint: DOLocations = (() => {
										switch (matchingRegion) {
											case 'EEU':
												return DOLocations['Eastern Europe'];
											case 'ENAM':
												return DOLocations['Eastern North America'];
											case 'ME':
												return DOLocations['Middle East'];
											case 'NAF':
												return DOLocations.Africa;
											case 'NEAS':
												return DOLocations['Asia-Pacific'];
											case 'NSAM':
												return DOLocations['South America'];
											case 'OC':
												return DOLocations.Oceania;
											case 'SAF':
												return DOLocations.Africa;
											case 'SAS':
												return DOLocations['Asia-Pacific'];
											case 'SEAS':
												return DOLocations['Asia-Pacific'];
											case 'SSAM':
												return DOLocations['South America'];
											case 'WEU':
												return DOLocations['Western Europe'];
											case 'WNAM':
												return DOLocations['Western North America'];
										}
									})();

									let created = false;
									// 1000 (leave 100 aside for other operations)
									const attempts = Math.round(900 / colosToCreate.length);
									for (let i = 0; i < attempts; i++) {
										console.debug(`Attempt ${i}:`, 'Attempting to spawn', coloToCreate, 'in', matchingRegion);

										const doId = env.LOCATION_TESTER.newUniqueId();
										const doStub = env.LOCATION_TESTER.get(doId, { locationHint });

										const actualColo = await doStub.fullColo;
										console.debug(`Attempt ${i}:`, 'Got', actualColo, 'expected', coloToCreate);

										if (actualColo?.toLowerCase() === coloToCreate.toLowerCase()) {
											created = true;

											// Write something to storage to lock in the colo
											ctx.waitUntil(doStub.lockIn(coloToCreate));
											// Insert into D1
											ctx.waitUntil(
												Promise.all([drizzleRef(), import('../db/schema'), import('drizzle-orm')])
													.then(([db, { instances }, { sql }]) =>
														db.insert(instances).values({
															colo: parseInt(coloToCreate.slice(3), 10),
															doId: sql<Buffer>`unhex(${doId.toString()})`,
															iata: iataCode,
															iso_country: iataLocation.iso_country.toUpperCase(),
															/**
															 * Only the US and Canada have subdivisions
															 * @link https://developers.cloudflare.com/load-balancing/reference/region-mapping-api/
															 */
															...(['US', 'CA'].includes(iataLocation.iso_country.toUpperCase()) && { iso_region: iataLocation.iso_region.split('-')[1]!.toUpperCase() }),
															location: locationHint,
														}),
													)
													.then(() => console.debug(`Attempt ${i}:`, 'Saved', coloToCreate))
													// Something D1 failed, nuke the colo
													.catch(() => doStub.nuke()),
											);
										} else {
											console.debug(`Attempt ${i}:`, `Failed to make ${coloToCreate},`, attempts - i - 1, 'retries left');
											// Didn't spawn where we wanted, nuke it
											ctx.waitUntil(doStub.nuke());
										}
									}

									if (!created) throw new Error(`Failed to create colo ${coloToCreate} after 100 attempts`);
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
