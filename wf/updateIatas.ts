import { Cloudflare } from 'cloudflare';
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { sql } from 'drizzle-orm/sql';
import * as allAirports from 'iata-location/data';
import type { Buffer } from 'node:buffer';
import { randomInt } from 'node:crypto';
import { DOLocations, PROBE_DB_D1_ID, type Airport, type EnvVars } from '~/types';
import { SQLCache } from '~/utils/sqlCache';
import * as schema from '~db/index.js';

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

export class UpdateIatas extends WorkflowEntrypoint<EnvVars> {
	override async run(event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep) {
		const db = drizzle(this.env.PROBE_DB.withSession('first-unconstrained'), {
			schema,
			cache: new SQLCache({
				dbName: PROBE_DB_D1_ID,
				dbType: 'd1',
				cacheTTL: parseInt(this.env.SQL_TTL, 10),
				strategy: 'explicit',
			}),
		});

		await step.do('Make sure all locations exist', () =>
			db
				.insert(schema.locations)
				.values(Object.values(DOLocations).map((location) => ({ location })))
				.onConflictDoNothing()
				.then((result) => {
					if (result.success) {
						// eslint-disable-next-line @typescript-eslint/no-unsafe-return
						return JSON.parse(JSON.stringify(result));
					} else {
						// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
						throw (result.error as unknown) instanceof Error ? result.error : new Error(result.error ?? 'Unknown error inserting locations into database');
					}
				}),
		);

		const [doIatas, instances] = await Promise.all([
			step.do('Fetch DO colos', () =>
				fetch(new URL('https://where.durableobjects.live/api/v3/data.json')).then((response) => {
					if (response.ok) {
						return response.json<DoData>().then((doData) =>
							Array.from(
								new Set(
									Object.values(doData.colos)
										.map((colo) => Object.keys(colo.hosts))
										.flat(),
								),
							).map((doColo) => doColo.toUpperCase() as keyof typeof allAirports),
						);
					} else {
						throw new Error(`${response.status} ${response.statusText} (${response.headers.get('cf-ray')}) Failed to fetch DO colos: `);
					}
				}),
			),
			step.do('Fetch existing instances', () =>
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
			),
		]);

		const instancesIatas = instances.map((instance) => instance.iata);

		// Find iatas that exist in instances but not in `doIatas` (should be deleted)
		const iatasToDelete = instancesIatas.filter((instancesIata) => !doIatas.includes(instancesIata));
		const instancesToDelete = instances.filter((instance) => iatasToDelete.includes(instance.iata));

		if (instancesToDelete.length > 0) {
			await Promise.allSettled(
				instancesToDelete.map((instanceToDelete) =>
					step.do(`Delete stale ${JSON.stringify(instanceToDelete)}`, async () => {
						const stub = this.env.LOCATION_TESTER.get(this.env.LOCATION_TESTER.idFromString(instanceToDelete.do_id), {
							// @ts-expect-error new locations not yet added to types
							locationHint: instanceToDelete.location,
						});

						await stub.nuke(`Deleting stale iata ${instanceToDelete.iata}`);
					}),
				),
			);
		}

		// Find iatas that don't exist in instances but do in `doIatas` (should be created)
		const iatasToCreate = doIatas.filter((doIata) => !instancesIatas.includes(doIata));

		const { regions } = await step.do('Fetch Cloudflare regions', () =>
			new Cloudflare({ apiToken: this.env.CF_API_TOKEN }).loadBalancers.regions
				.list({
					account_id: this.env.CF_ACCOUNT_ID,
				})
				.then((result) => result as LoadBalancerRegionResults),
		);

		await Promise.allSettled(
			iatasToCreate.map(async (iataToCreate) => {
				const iataLocation = (allAirports as Record<keyof typeof allAirports, Airport>)[iataToCreate];

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
								return DOLocations['Northeast Asia-Pacific'];
							case 'NSAM':
								return DOLocations['South America'];
							case 'OC':
								return DOLocations.Oceania;
							case 'SAF':
								return DOLocations.Africa;
							case 'SAS':
								return DOLocations['Asia-Pacific'];
							case 'SEAS':
								return DOLocations['Southeast Asia-Pacific'];
							case 'SSAM':
								return DOLocations['South America'];
							case 'WEU':
								return DOLocations['Western Europe'];
							case 'WNAM':
								return DOLocations['Western North America'];
						}
					})();

					const do_id = await step.do(
						`Attempting to spawn ${iataToCreate} in ${matchingRegion}`,
						{
							retries: {
								limit: 100,
								/**
								 * use `randomInt` to add some jitter to the delay, to avoid thundering herd
								 * minutes * seconds * milliseconds / attempts / 2 (to give it some time to actually run)
								 */
								delay: randomInt((60 * 60 * 1000) / 100 / 2),
								backoff: 'constant',
							},
						},
						async () => {
							const do_id = this.env.LOCATION_TESTER.newUniqueId();
							const doStub = this.env.LOCATION_TESTER.get(do_id, {
								// @ts-expect-error new locations not yet added to types
								locationHint,
							});

							const actualIata = await doStub.iata;

							if (actualIata === iataToCreate) {
								// Write something to storage to lock in the colo
								await doStub.lockIn(iataToCreate);
								// Return DO ID so we can write to D1
								return do_id.toString();
							} else {
								// Didn't spawn where we wanted, nuke it
								await doStub.nuke(`Failed to spawn in ${iataToCreate}`);
								// Throw normal error to trigger retry
								throw new Error(`Spawned in ${actualIata} instead of ${iataToCreate}`);
							}
						},
					);

					await step.do(
						`Insert ${iataToCreate} into D1`,
						() =>
							db
								.insert(schema.instances)
								.values({
									do_id: sql<Buffer>`unhex(${do_id})`,
									iata: iataToCreate.toUpperCase() as keyof typeof allAirports,
									iso_country: iataLocation.iso_country.toUpperCase(),
									/**
									 * Only the US and Canada have subdivisions
									 * @link https://developers.cloudflare.com/load-balancing/reference/region-mapping-api/
									 */
									...(['US', 'CA'].includes(iataLocation.iso_country.toUpperCase()) && { iso_region: iataLocation.iso_region.split('-')[1]!.toUpperCase() }),
									location: locationHint,
								})
								.then(() => {}),
						{
							rollback: async () => {
								const doStub = this.env.LOCATION_TESTER.get(this.env.LOCATION_TESTER.idFromString(do_id), {
									// @ts-expect-error new locations not yet added to types
									locationHint,
								});
								// Nuke the DO if the database insert fails, to avoid having an orphan DO with no record in the database
								await doStub.nuke(`Failed to lock in ${iataToCreate}`);
							},
						},
					);
				} else {
					throw new Error(`No Cloudflare location found for ${iataToCreate} (${[iataLocation.iso_region, iataLocation.iso_country].join(', ')})`);
				}
			}),
		).then((results) => {
			const errors = results
				.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
				.map(
					({ reason }) =>
						// eslint-disable-next-line @typescript-eslint/no-unsafe-return
						reason,
				);

			if (errors.length > 0) throw new AggregateError(errors, 'Failed to create some IATAs');
		});

		await step.do('Optimize database', () =>
			this.env.PROBE_DB.withSession('first-unconstrained')
				.prepare('PRAGMA optimize')
				.run()
				.then((result) => {
					if (result.success) {
						// eslint-disable-next-line @typescript-eslint/no-unsafe-return
						return JSON.parse(JSON.stringify(result));
					} else {
						// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
						throw (result.error as unknown) instanceof Error ? result.error : new Error(result.error ?? 'Unknown error optimizing database');
					}
				}),
		);
	}
}
