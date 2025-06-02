import { DurableObject } from 'cloudflare:workers';
import { PROBE_DB_D1_ID, type EnvVars } from '~/types';

interface Trace extends Record<string, string> {
	fl: `${number}f${number}`;
	h: `${string}.${string}`;
	ip: string;
	ts: `${number}.${number}`;
	visit_scheme: 'https' | 'http';
	uag: string;
	colo: string;
	sliver: string;
	http: string;
	loc: string;
	tls: string;
	sni: string;
	warp: string;
	gateway: string;
	rbi: string;
	kex: string;
}

export abstract class LocationTester<E extends Env = EnvVars> extends DurableObject<E> {
	private d1Session = this.env.PROBE_DB.withSession('first-unconstrained');
	constructor(ctx: LocationTester<E>['ctx'], env: LocationTester<E>['env']) {
		super(ctx, env);

		ctx.waitUntil(
			this.ctx.storage.getAlarm().then(async (alarm) => {
				if (!alarm) {
					// Calculate next GMT midnight
					const now = new Date();
					const nextGMTMidnight = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
					await this.ctx.storage.setAlarm(nextGMTMidnight);
				}
			}),
		);
	}

	private parseTraceData(text: string): Trace {
		const data: Record<string, string> = {};

		text.trim()
			.split('\n')
			.filter((line) => line.includes('='))
			.forEach((line) => {
				const lineParts = line.split('=');
				if (lineParts.length >= 2) {
					const [key, ...values] = lineParts;
					const value = values.join('=').trim();

					data[key!] = value;
				} else {
					throw new Error(`Invalid trace line format: ${line}`);
				}
			});

		return data as unknown as Trace;
	}
	private get fl() {
		return import('@chainfuse/helpers').then(({ NetHelpers }) =>
			NetHelpers.loggingFetch(new URL('cdn-cgi/trace', 'https://demosjarco.dev'), {
				cf: {
					cacheTtlByStatus: {
						// minutes * seconds
						'200-299': 5 * 60,
					},
					cacheEverything: true,
				},
			}).then((response) => {
				if (response.ok) {
					return response.text().then((text) => this.parseTraceData(text));
				} else {
					throw new Error(`${response.status} ${response.statusText} (${response.headers.get('cf-ray')}) Failed to fetch trace`);
				}
			}),
		);
	}

	public get iata() {
		return this.fl.then(({ colo }) => colo.toUpperCase());
	}

	public get fullColo() {
		return Promise.all([
			this.fl,
			import('@chainfuse/helpers').then(({ NetHelpers }) =>
				NetHelpers.loggingFetch(new URL('Cloudflare-Mining/Cloudflare-Datamining/refs/heads/main/data/other/colos-id-map.json', 'https://raw.githubusercontent.com'), {
					cf: {
						cacheTtlByStatus: {
							// minutes * seconds
							'200-299': 5 * 60,
						},
						cacheEverything: true,
					},
				}).then((response) => {
					if (response.ok) {
						return response.json<Record<`${number}`, string>>();
					} else {
						throw new Error(`${response.status} ${response.statusText} (${response.headers.get('cf-ray')}) Failed to fetch trace`);
					}
				}),
			),
		]).then(([{ fl }, coloList]) => coloList[`${parseInt(fl.split('f')[0]!, 10)}`]?.toLowerCase());
	}

	public lockIn(iata: string) {
		return this.ctx.storage.put('iata', iata);
	}

	public async nuke() {
		await Promise.all([
			// Alarm isn't deleted as part of `deleteAll()`
			this.ctx.storage.deleteAlarm(),
			this.ctx.storage.deleteAll(),
		]);
	}

	private drizzleRef(dbRef: D1Database = this.env.PROBE_DB) {
		return Promise.all([import('drizzle-orm/d1'), import('drizzle-orm/logger'), import('~db/extras.mjs')]).then(([{ drizzle }, { DefaultLogger }, { DebugLogWriter, SQLCache }]) =>
			drizzle(typeof dbRef.withSession === 'function' ? (dbRef.withSession(this.d1Session.getBookmark() ?? 'first-unconstrained') as unknown as D1Database) : dbRef, {
				logger: new DefaultLogger({ writer: new DebugLogWriter() }),
				casing: 'snake_case',
				cache: new SQLCache(PROBE_DB_D1_ID, 'd1', parseInt(this.env.SQL_TTL, 10), 'all'),
			}),
		);
	}

	override async alarm() {
		// Calculate next GMT midnight
		const now = new Date();
		const nextGMTMidnight = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
		this.ctx.waitUntil(this.ctx.storage.setAlarm(nextGMTMidnight));

		// Self nuke if no longer in original location
		await Promise.all([this.ctx.storage.get<string>('iata'), this.iata]).then(([storedIata, currentIata]) => {
			if (storedIata === currentIata) {
				console.debug('Verified', storedIata, "hasn't moved");
			} else {
				this.ctx.waitUntil(
					Promise.all([this.drizzleRef(), import('../db/schema'), import('drizzle-orm')])
						// Delete from D1
						.then(([db, { instances }, { eq, sql }]) => db.delete(instances).where(eq(instances.doId, sql<Buffer>`unhex(${this.ctx.id.toString()})`))),
				);
				this.ctx.waitUntil(this.nuke());
			}
		});

		// Self nuke if not recorded in D1 (prevent hanging DOs)
		await Promise.all([this.drizzleRef(), import('../db/schema'), import('drizzle-orm')])
			// Delete from D1
			.then(([db, { instances }, { eq, sql }]) =>
				db
					.select({
						doId: instances.doId,
					})
					.from(instances)
					.where(eq(instances.doId, sql<Buffer>`unhex(${this.ctx.id.toString()})`))
					.limit(1),
			)
			.then((rows) =>
				rows.map(({ doId, ...row }) => ({
					...row,
					doId: doId.toString('hex'),
				})),
			)
			.then(([row]) => {
				if (!row) {
					this.ctx.waitUntil(
						Promise.all([this.drizzleRef(), import('../db/schema'), import('drizzle-orm')])
							// Delete from D1
							.then(([db, { instances }, { eq, sql }]) => db.delete(instances).where(eq(instances.doId, sql<Buffer>`unhex(${this.ctx.id.toString()})`))),
					);
					this.ctx.waitUntil(this.nuke());
				}
			});
	}
}
