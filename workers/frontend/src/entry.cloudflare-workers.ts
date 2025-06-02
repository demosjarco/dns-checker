import { DOLocations } from '@chainfuse/types';
import { DefaultLogger } from 'drizzle-orm/logger';
import type { EnvVars } from '~/types.js';
import { DebugLogWriter, SQLCache } from '~db/extras.mjs';
import { fetch as assetFetch } from '../server/entry.cloudflare-pages';

export { LocationTester } from '~do/locationTester.mjs';

export default {
	/**
	 * @link https://qwik.dev/docs/deployments/cloudflare-pages/#cloudflare-pages-entry-middleware
	 */
	fetch: assetFetch,
	async scheduled(event, env, ctx) {
		function drizzleRef(dbRef: D1Database = env.PROBE_DB) {
			return import('drizzle-orm/d1').then(({ drizzle }) =>
				drizzle(typeof dbRef.withSession === 'function' ? (dbRef.withSession('first-unconstrained') as unknown as D1Database) : dbRef, {
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
					.then((rows) =>
						rows.map(({ doId, ...row }) => ({
							...row,
							doId: doId.toString('hex'),
						})),
					),
			),
		]).then(([doColos, instanceColos]) => {
			console.debug('doColos', doColos);
			console.debug('instanceColos', instanceColos);
		});
	},
} satisfies ExportedHandler<EnvVars>;
