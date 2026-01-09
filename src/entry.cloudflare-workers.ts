import type { DOLocations } from '@chainfuse/types';
import { drizzle } from 'drizzle-orm/d1';
import { DefaultLogger } from 'drizzle-orm/logger';
import type { Context } from 'hono';
import type iataData from 'iata-location/data';
import type { Buffer } from 'node:buffer';
import type { ContextVariables, EnvVars } from '~/types.js';
import { DebugLogWriter } from '~db/extras';
import * as schema from '~db/index';

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
	fetch: async (request, env, ctx) => {
		const app = await import('hono').then(({ Hono }) => new Hono<{ Bindings: EnvVars; Variables: ContextVariables }>());

		// Variable Setup
		app.use('*', (c, next) =>
			import('hono/context-storage').then(({ contextStorage }) =>
				contextStorage()(
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					c,
					next,
				),
			),
		);
		app.use('*', async (c, next) => {
			const cacheControl = new Set((c.req.header('Cache-Control')?.split(',') ?? []).map((directive) => directive.trim().toLowerCase()));
			// RFC 7234: no-store forbids storing; no-cache/zero max-age require revalidation so we skip reads
			const antiCacheHeader = cacheControl.has('no-store') || cacheControl.has('no-cache') || cacheControl.has('max-age=0');
			c.set('browserCachePolicy', !antiCacheHeader);

			c.set(
				'db',
				drizzle(c.env.PROBE_DB.withSession() as unknown as D1Database, {
					schema,
					casing: 'snake_case',
					logger: new DefaultLogger({ writer: new DebugLogWriter() }),
					cache: c.var.browserCachePolicy
						? await import('@chainfuse/helpers/db').then(
								async ({ SQLCache }) =>
									new SQLCache({
										dbName: await import('~/types.js').then(({ PROBE_DB_D1_ID }) => PROBE_DB_D1_ID),
										dbType: 'd1',
										cacheTTL: parseInt(env.SQL_TTL, 10),
										strategy: 'all',
									}),
							)
						: undefined,
				}),
			);

			if (c.req.raw.headers.has('X-Timestamp-S') && c.req.raw.headers.has('X-Timestamp-MS')) {
				c.set('requestDate', new Date(parseInt(c.req.header('X-Timestamp-S')!, 10) * 1000 + parseInt(c.req.header('X-Timestamp-MS')!, 10)));
			} else if (request.cf?.clientTcpRtt) {
				c.set('requestDate', new Date(Date.now() - request.cf.clientTcpRtt));
			} else {
				c.set('requestDate', new Date());
			}

			await next();
		});

		// Security
		app.use('*', (c, next) =>
			import('hono/cors').then(({ cors }) =>
				cors({
					origin: '*',
					maxAge: 300,
				})(
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					c,
					next,
				),
			),
		);

		// Performance
		app.use('*', (c, next) =>
			import('hono/etag').then(({ etag }) =>
				etag()(
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					c,
					next,
				),
			),
		);

		// Debug
		app.use('*', (c, next) =>
			Promise.all([import('hono/request-id'), import('uuid'), import('node:crypto')]).then(([{ requestId }, { v7: uuidv7 }, { randomBytes, createHash }]) =>
				requestId({
					generator: (c: Context<{ Bindings: EnvVars; Variables: ContextVariables }>) => {
						// Try and get ray id properly (<16 digit hex>-<colo IATA>)
						let rawRayId = c.req.header('cf-ray');

						// Fuck it, we make up our own
						rawRayId ??= (() => {
							// Use uuid7 for timestamp + globally random
							const uuid = uuidv7({ random: randomBytes(16), msecs: c.var.requestDate.getTime() });
							const uuidHex = uuid.replaceAll('-', '');

							// We don't use full raw value. We hash it
							const hash = createHash('sha256').update(uuidHex).digest('hex');

							// Timestamp is first 16 bytes (but we ignore the first 2 because that's such a high magnitude of time), then backfil with the ending of the hash
							return `${uuidHex.slice(2, 8)}${hash.slice(-10)}`;
						})();

						const rayIdSections = rawRayId.split('-');
						if (rayIdSections.length === 2) {
							return rawRayId;
						} else {
							const colo = c.req.raw.cf?.colo as IncomingRequestCfPropertiesBase['colo'] | undefined;
							return `${rawRayId}-${colo}`;
						}
					},
				})(
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					c,
					next,
				),
			),
		);
		app.use('*', (c, next) =>
			import('hono/timing').then(({ timing }) =>
				timing()(
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					c,
					next,
				),
			),
		);

		await import('~/api-routes/index.mjs').then(({ default: baseApp }) => app.route('/', baseApp));

		return app.fetch(request, env, ctx);
	},
	scheduled: (event, env, ctx) =>
		Promise.all([import('@chainfuse/types'), import('drizzle-orm/sql')]).then(async ([{ DOLocations }, { sql }]) => {
			const db = drizzle(env.PROBE_DB.withSession('first-primary') as unknown as D1Database, {
				schema,
				casing: 'snake_case',
				logger: new DefaultLogger({ writer: new DebugLogWriter() }),
				cache: await import('@chainfuse/helpers/db').then(
					async ({ SQLCache }) =>
						new SQLCache({
							dbName: await import('~/types.js').then(({ PROBE_DB_D1_ID }) => PROBE_DB_D1_ID),
							dbType: 'd1',
							cacheTTL: parseInt(env.SQL_TTL, 10),
							strategy: 'all',
						}),
				),
			});

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
							).map((doColo) => doColo.toUpperCase() as keyof typeof iataData),
						);
					} else {
						throw new Error(`${response.status} ${response.statusText} (${response.headers.get('cf-ray')}) Failed to fetch DO colos: `);
					}
				}),
				db
					.select({
						do_id: schema.instances.do_id,
						location: schema.instances.location,
						iata: schema.instances.iata,
					})
					.from(schema.instances)
					.$withCache(false)
					.then((rows) =>
						rows.map((row) => ({
							...row,
							do_id: row.do_id.toString('hex'),
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
								const stub = env.LOCATION_TESTER.get(env.LOCATION_TESTER.idFromString(instanceToDelete.do_id), { locationHint: instanceToDelete.location });

								await stub.nuke(`Deleting stale iata ${instanceToDelete.iata}`);
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

											const do_id = env.LOCATION_TESTER.newUniqueId();
											const doStub = env.LOCATION_TESTER.get(do_id, { locationHint });

											const actualIata = await doStub.iata;
											console.debug(`Attempt ${i}:`, 'Got', actualIata, 'expected', iataToCreate);

											if (actualIata === iataToCreate) {
												created = true;

												try {
													// Insert into D1
													await db
														.insert(schema.instances)
														.values({
															do_id: sql<Buffer>`unhex(${do_id.toString()})`,
															iata: iataToCreate.toUpperCase() as keyof typeof iataData,
															iso_country: iataLocation.iso_country.toUpperCase(),
															/**
															 * Only the US and Canada have subdivisions
															 * @link https://developers.cloudflare.com/load-balancing/reference/region-mapping-api/
															 */
															...(['US', 'CA'].includes(iataLocation.iso_country.toUpperCase()) && { iso_region: iataLocation.iso_region.split('-')[1]!.toUpperCase() }),
															location: locationHint,
														})
														.then(() => console.debug(`Attempt ${i}:`, 'Saved', iataToCreate));
													// Write something to storage to lock in the colo
													await doStub.lockIn(iataToCreate);
												} catch (error) {
													// Something D1 failed, nuke the colo
													ctx.waitUntil(doStub.nuke(`Failed to lock in ${iataToCreate}`));
												}
											} else {
												console.debug(`Attempt ${i}:`, `Failed to make ${iataToCreate},`, attempts - i - 1, 'retries left');
												// Didn't spawn where we wanted, nuke it
												ctx.waitUntil(doStub.nuke(`Failed to spawn in ${iataToCreate}`));
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
		}),
} satisfies ExportedHandler<EnvVars>;
