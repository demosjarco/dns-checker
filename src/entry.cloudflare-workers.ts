import type { DOLocations } from '@chainfuse/types';
import type { Buffer } from 'node:buffer';
import type { EnvVars } from '~/types.js';

// @ts-ignore this gets generated automatically later in the build process
import { fetch as assetFetch } from '../server/entry.cloudflare-pages';

export { LocationTester } from '~do/locationTester.mjs';

/**
 * @todo comment nicer
 */
interface DoData {
	hourly: number;
	coverage: number;
	colos: Record<
		// IATA code
		string,
		DoColo
	>;
}
interface DoColo {
	hosts: Record<
		// IATA code
		string,
		DoHost
	>;
	nearestRegion: LoadBalancerRegion['region_code'];
}
interface DoHost {
	likelihood: number;
	/**
	 * Estimated latency in ms
	 */
	latency: number;
}

/**
 * Temporary
 * @link https://github.com/elsbrock/iata-location/issues/3
 */
export interface Airport {
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
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	fetch: assetFetch,
	scheduled: (event, env, ctx) =>
		Promise.all([
			//
			import('@chainfuse/types'),
			import('drizzle-orm/sql'),
			import('~db/index'),
		]).then(
			async ([
				//
				{ DOLocations },
				{ eq, sql },
				schema,
			]) => {
				const db = await import('drizzle-orm/d1').then(async ({ drizzle }) =>
					drizzle(env.PROBE_DB.withSession('first-primary') as unknown as D1Database, {
						schema,
						casing: 'snake_case',
						logger: await import('drizzle-orm/logger').then(async ({ DefaultLogger }) => new DefaultLogger({ writer: await import('~db/extras').then(({ DebugLogWriter }) => new DebugLogWriter()) })),
						cache: await import('@chainfuse/helpers/db').then(async ({ SQLCache }) => new SQLCache({ dbName: await import('~/types.js').then(({ PROBE_DB_D1_ID }) => PROBE_DB_D1_ID), dbType: 'd1', cacheTTL: parseInt(env.SQL_TTL, 10), strategy: 'all' })),
					}),
				);

				// 	// 1. Make sure all locations exist
				await db
					.insert(schema.locations)
					.values(Object.values(DOLocations).map((location) => ({ location })))
					.onConflictDoNothing();

				await Promise.all([
					fetch(new URL('api/v3/data.json', 'https://where.durableobjects.live')).then((response) => {
						if (response.ok) {
							return response.json<DoData>().then((doData) =>
								Array.from(
									new Set(
										Object.values(doData.colos)
											.map((colo) => Object.keys(colo.hosts))
											.flat(),
									),
								).map((doColo) => doColo.toUpperCase()),
							);
						} else {
							throw new Error(`${response.status} ${response.statusText} (${response.headers.get('cf-ray')}) Failed to fetch DO colos: `);
						}
					}),
					db
						.select({
							doId: schema.instances.doId,
							location: schema.instances.location,
							iata: schema.instances.iata,
						})
						.from(schema.instances)
						.$withCache(false)
						.then((rows) =>
							rows.map((row) => ({
								...row,
								doId: row.doId.toString('hex'),
								iata: row.iata.toUpperCase(),
							})),
						),
				]).then(async ([doIatas, instances]) => {
					const instancesIatas = instances.map((instance) => instance.iata);
					console.info('doIatas', doIatas.sort());
					console.info('instancesIatas', instancesIatas.sort());
					console.info(
						'instances',
						instances.sort((a, b) => a.iata.localeCompare(b.iata)),
					);

					// Find iatas that exist in instances but not in `doIatas` (should be deleted)
					const iatasToDelete = instancesIatas.filter((instancesIata) => !doIatas.includes(instancesIata));
					const instancesToDelete = instances.filter((instance) => iatasToDelete.includes(instance.iata));

					if (instancesToDelete.length > 0) {
						console.warn('Deleting iatas', instancesToDelete);

						ctx.waitUntil(
							Promise.allSettled(
								instancesToDelete.map(async (instanceToDelete) => {
									const stub = env.LOCATION_TESTER.get(env.LOCATION_TESTER.idFromString(instanceToDelete.doId), { locationHint: instanceToDelete.location });

									await stub
										.nuke()
										// Delete from D1
										.then(() => db.delete(schema.instances).where(eq(schema.instances.doId, sql<Buffer>`unhex(${instanceToDelete.doId})`)));
								}),
							),
						);
					} else {
						console.debug('No iatas to delete');
					}

					// Find iatas that don't exist in instances but do in `doIatas` (should be created)
					const iatasToCreate = doIatas.filter((doIata) => !instancesIatas.includes(doIata));

					if (iatasToCreate.length > 0) {
						console.info('Creating iatas', iatasToCreate);

						await Promise.all([import('cloudflare').then(({ Cloudflare }) => new Cloudflare({ apiToken: env.CF_API_TOKEN }).loadBalancers.regions.list({ account_id: env.CF_ACCOUNT_ID })).then((result) => result as LoadBalancerRegionResults), import('iata-location/data').then(({ default: allAirports }) => allAirports as Record<string, Airport>)]).then(([{ regions }, allAirports]) =>
							Promise.allSettled(
								iatasToCreate.map(async (iataToCreate) => {
									const iataLocation = allAirports[iataToCreate];

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
											// 1000 request max in workers (leave 100 aside for other operations) / 2 (half because each try has to make a network request)
											const attempts = Math.round((1000 - 100) / 2 / iatasToCreate.length);
											for (let i = 0; i < attempts; i++) {
												console.debug(`Attempt ${i}:`, 'Attempting to spawn', iataToCreate, 'in', matchingRegion);

												const doId = env.LOCATION_TESTER.newUniqueId();
												const doStub = env.LOCATION_TESTER.get(doId, { locationHint });

												const actualIata = await doStub.iata;
												console.debug(`Attempt ${i}:`, 'Got', actualIata, 'expected', iataToCreate);

												if (actualIata === iataToCreate) {
													created = true;

													// Write something to storage to lock in the colo
													ctx.waitUntil(doStub.lockIn(iataToCreate));
													// Insert into D1
													ctx.waitUntil(
														db
															.insert(schema.instances)
															.values({
																doId: sql<Buffer>`unhex(${doId.toString()})`,
																iata: iataToCreate,
																iso_country: iataLocation.iso_country.toUpperCase(),
																/**
																 * Only the US and Canada have subdivisions
																 * @link https://developers.cloudflare.com/load-balancing/reference/region-mapping-api/
																 */
																...(['US', 'CA'].includes(iataLocation.iso_country.toUpperCase()) && { iso_region: iataLocation.iso_region.split('-')[1]!.toUpperCase() }),
																location: locationHint,
															})
															.then(() => console.debug(`Attempt ${i}:`, 'Saved', iataToCreate))
															// Something D1 failed, nuke the colo
															.catch(() => doStub.nuke()),
													);
												} else {
													console.debug(`Attempt ${i}:`, `Failed to make ${iataToCreate},`, attempts - i - 1, 'retries left');
													// Didn't spawn where we wanted, nuke it
													ctx.waitUntil(doStub.nuke());
												}
											}

											if (!created) throw new Error(`Failed to create colo ${iataToCreate} after 100 attempts`);
										} else {
											throw new Error(`No Cloudflare location found for ${iataToCreate} (${[iataLocation.iso_region, iataLocation.iso_country].join(', ')})`);
										}
									} else {
										throw new Error(`No IATA location found for ${iataToCreate}`);
									}
								}),
							).then((results) => results.filter((result) => result.status === 'rejected').map(({ reason }) => console.error(reason))),
						);
					} else {
						console.debug('No colos to create');
					}
				});
			},
		),
} satisfies ExportedHandler<EnvVars>;
