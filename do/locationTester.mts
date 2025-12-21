import { SQLCache } from '@chainfuse/helpers/db';
import { DurableObject } from 'cloudflare:workers';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { DefaultLogger } from 'drizzle-orm/logger';
import { eq, sql } from 'drizzle-orm/sql';
import type { Buffer } from 'node:buffer';
import { PROBE_DB_D1_ID, type EnvVars } from '~/types';
import { DebugLogWriter } from '~db/extras';
import * as schema from '~db/index';

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

export class LocationTester extends DurableObject<EnvVars> {
	private db: DrizzleD1Database<typeof schema>;
	constructor(ctx: LocationTester['ctx'], env: LocationTester['env']) {
		super(ctx, env);

		this.db = drizzle(this.env.PROBE_DB.withSession() as unknown as D1Database, {
			schema,
			logger: new DefaultLogger({ writer: new DebugLogWriter() }),
			casing: 'snake_case',
			cache: new SQLCache({ dbName: PROBE_DB_D1_ID, dbType: 'd1', cacheTTL: parseInt(this.env.SQL_TTL, 10), strategy: 'all' }),
		});

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
		return fetch(new URL('cdn-cgi/trace', 'https://dns.demosjarco.dev'), {
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
		});
	}

	private get _iata() {
		return this.ctx.storage.get<string>('iata').then((iata) => {
			if (iata) {
				return iata;
			} else {
				throw new Error('IATA not locked in');
			}
		});
	}
	public get iata() {
		return this.fl.then(({ colo }) => colo.toUpperCase());
	}

	/** public get fullColo() {
		return Promise.all([
			this.fl,
			fetch(new URL('Cloudflare-Mining/Cloudflare-Datamining/refs/heads/main/data/other/colos-id-map.json', 'https://raw.githubusercontent.com'), {
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
		]).then(([{ fl }, coloList]) => coloList[`${parseInt(fl.split('f')[0]!, 10)}`]?.toLowerCase());
	}*/

	public lockIn(iata: string) {
		return this.ctx.storage.put('iata', iata);
	}

	public async nuke() {
		// Alarm isn't deleted as part of `deleteAll()`
		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.deleteAll();
		// To ensure that the DO is fully evicted, this.ctx.abort() is called
		// `ctx.abort` throws an uncatchable error, so we yield to the event loop to avoid capturing it and let handlers finish cleaning up
		setTimeout(() => {
			this.ctx.abort('nuked');
		}, 0);
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
				this.ctx.waitUntil(this.db.delete(schema.instances).where(eq(schema.instances.doId, sql<Buffer>`unhex(${this.ctx.id.toString()})`)));
				this.ctx.waitUntil(this.nuke());
			}
		});

		// Self nuke if not recorded in D1 (prevent hanging DOs)
		const [row] = await this.db
			.select({
				doId: schema.instances.doId,
			})
			.from(schema.instances)
			.where(eq(schema.instances.doId, sql<Buffer>`unhex(${this.ctx.id.toString()})`));
		if (!row) {
			// Delete from D1
			this.ctx.waitUntil(this.db.delete(schema.instances).where(eq(schema.instances.doId, sql<Buffer>`unhex(${this.ctx.id.toString()})`)));
			this.ctx.waitUntil(this.nuke());
		}
	}
}
