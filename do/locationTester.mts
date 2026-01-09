import { CryptoHelpers } from '@chainfuse/helpers/crypto';
import { SQLCache } from '@chainfuse/helpers/db';
import { DurableObject } from 'cloudflare:workers';
import * as dnsPacket from 'dns-packet';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { DefaultLogger } from 'drizzle-orm/logger';
import { eq, sql } from 'drizzle-orm/sql';
import { Buffer } from 'node:buffer';
import { randomInt } from 'node:crypto';
import { connect } from 'node:tls';
import { DNSRecordType, PROBE_DB_D1_ID, type EnvVars } from '~/types';
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

interface BetterPacketTxtAnswer extends Omit<dnsPacket.TxtAnswer, 'data'> {
	data: string | string[];
}
interface BetterPacket extends Omit<dnsPacket.Packet, 'answers'> {
	answers: (dnsPacket.StringAnswer | dnsPacket.CaaAnswer | dnsPacket.MxAnswer | dnsPacket.NaptrAnswer | dnsPacket.SoaAnswer | dnsPacket.SrvAnswer | dnsPacket.TlsaAnswer | BetterPacketTxtAnswer)[];
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
					await this.ctx.storage.setAlarm(this.getNextHour());
				}
			}),
		);
	}

	private getNextHour(base: Date = new Date()) {
		const next = new Date(base);
		// Jitter within the hour but leave ~5 minutes before the boundary
		next.setUTCMinutes(randomInt(0, 55), randomInt(0, 60), randomInt(0, 1000));
		next.setUTCHours(next.getUTCHours() + 1);
		return next;
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
		// Delete from D1
		await this.db.delete(schema.instances).where(eq(schema.instances.do_id, sql<Buffer>`unhex(${this.ctx.id.toString()})`));
		// Alarm isn't deleted as part of `deleteAll()`
		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.deleteAll();
		// To ensure that the DO is fully evicted, this.ctx.abort() is called
		// `ctx.abort` throws an uncatchable error, so we yield to the event loop to avoid capturing it and let handlers finish cleaning up
		setTimeout(() => {
			this.ctx.abort('nuked');
		}, 0);
	}

	public getDnsQuery(server: string, hostname: string, rrtype: DNSRecordType, useCache: boolean = true, signal: AbortSignal = AbortSignal.timeout(10_000)) {
		return Promise.race([
			// Passthrough signal and carry over the rest
			this._getDnsQuery(signal, new URL(server), hostname, rrtype, useCache),
			// Shortcircuit on abort
			new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error(signal.reason instanceof Error ? signal.reason.message : signal.reason ? JSON.stringify(signal.reason) : 'AbortError', { cause: signal.reason instanceof Error ? signal.reason.cause : undefined })), { once: true })),
		]);
	}
	private async _getDnsQuery(signal: AbortSignal, server: URL, hostname: string, rrtype: DNSRecordType, useCache: boolean) {
		const cacheServerUrl = new URL(server);
		// CF Cache hard requires http or https protocol
		cacheServerUrl.protocol = 'https:';
		// For cache niceness, follow `application/dns-json` format
		cacheServerUrl.searchParams.set('name', hostname);
		cacheServerUrl.searchParams.set('type', rrtype);
		const cacheRequest = new Request(cacheServerUrl, {
			headers: {
				Accept: 'application/dns-json',
			},
			signal,
		});
		const cache = useCache ? await caches.open(`dns:${await this._iata}`) : undefined;

		// Try to get from cache first
		let response = await cache?.match(cacheRequest);
		const fromCache = Boolean(response);

		response ??= await (() => {
			const queryPacket: dnsPacket.Packet = {
				type: 'query',
				// [inclusive, exclusive)
				id: randomInt(1, 65536),
				flags: dnsPacket.RECURSION_DESIRED,
				questions: [
					{
						type: rrtype,
						name: hostname,
					},
				],
			};

			if (server.protocol === 'https:') {
				const dnsQueryBuf = dnsPacket.encode(queryPacket);

				return fetch(server, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/dns-message',
						Accept: 'application/dns-message',
					},
					signal,
					body: new Uint8Array(dnsQueryBuf),
				})
					.then((res) => res.arrayBuffer())
					.then((buf) => dnsPacket.decode(Buffer.from(buf)));
			} else if (server.protocol === 'tls:') {
				const dnsQueryBuf = dnsPacket.streamEncode(queryPacket);

				return new Promise<dnsPacket.Packet>((resolve, reject) => {
					// Setup TLS client
					const client = connect({
						minVersion: 'TLSv1.2',
						maxVersion: 'TLSv1.3',
						port: server.port === '' ? 853 : parseInt(server.port, 10),
						host: server.hostname,
						...(server.pathname !== '' && { path: server.pathname }),
					});
					// Setup abort handling
					const onAbort = () => {
						client.destroy(new Error(signal.reason instanceof Error ? signal.reason.message : signal.reason ? JSON.stringify(signal.reason) : 'AbortError'));
						reject(new Error(signal.reason instanceof Error ? signal.reason.message : signal.reason ? JSON.stringify(signal.reason) : 'AbortError'));
					};
					signal.addEventListener('abort', onAbort, { once: true });
					// Finish setting up client
					client.once('error', reject);
					client.once('secureConnect', () => client.write(dnsQueryBuf));

					let response = Buffer.from(new Uint8Array(0));
					let expectedLength = 0;

					client.on('data', (data: Buffer) => {
						if (response.byteLength === 0) {
							expectedLength = data.readUInt16BE(0);
							if (expectedLength < 12) {
								reject(new Error('Below DNS minimum packet length (DNS Header is 12 bytes)'));
							}
							response = Buffer.from(data);
						} else {
							response = Buffer.concat([response, data]);
						}

						/**
						 * @link https://tools.ietf.org/html/rfc7858#section-3.3
						 * @link https://tools.ietf.org/html/rfc1035#section-4.2.2
						 * The message is prefixed with a two byte length field which gives the message length, excluding the two byte length field.
						 */
						if (response.length === expectedLength + 2) {
							client.destroy();

							resolve(dnsPacket.streamDecode(response));
						}
					});
					client.once('end', () => signal.removeEventListener('abort', onAbort));
				});
			} else {
				throw new Error(`Unsupported protocol: ${server.protocol}`);
			}
		})().then(
			(packet) =>
				new Response(
					JSON.stringify({
						...packet,
						answers: (packet.answers ?? []).map((a) => {
							if ('data' in a) {
								if (Array.isArray(a.data)) {
									return { ...a, data: a.data.map((part) => part.toString()) };
								} else if (Buffer.isBuffer(a.data)) {
									return { ...a, data: a.data.toString() };
								} else if (typeof a.data === 'object') {
									return { ...a, data: a.data };
								} else {
									return { ...a, data: a.data.toString() };
								}
							} else {
								return a;
							}
						}),
					}),
					// Go back to nice JSON format
					{ headers: { 'Content-Type': 'application/dns-json' } },
				),
		);

		if (response?.ok) {
			const cacheClone = useCache ? response.clone() : undefined;

			return response.json<BetterPacket>().then((json) => {
				if (useCache && !fromCache) {
					// Re-assign response to make it mutable
					response = new Response(cacheClone!.body, response);

					this.ctx.waitUntil(
						(async () => {
							const answersWithTtl = json.answers.filter((a) => typeof a.ttl === 'number');
							const ttl = answersWithTtl.length > 0 ? Math.min(...answersWithTtl.map((a) => a.ttl!)) : 0;
							response.headers.set('Cache-Control', `public, max-age=${ttl}, s-maxage=${ttl}`);

							await CryptoHelpers.generateETag(response)
								.then((etag) => response!.headers.set('ETag', etag))
								.catch((err) => console.warn('ETag generation failed', err));

							return cache!.put(cacheRequest, response);
						})(),
					);
				}

				switch (rrtype) {
					case DNSRecordType['TXT (Text)']:
						return json.answers.map((a) => (Array.isArray(a.data) ? a.data : [a.data]));
					default:
						return json.answers.map((a) => a.data);
				}
			});
		} else {
			throw new Error(`${response?.status} ${response?.statusText}`, { cause: await response?.text() });
		}
	}

	override async alarm() {
		this.ctx.waitUntil(this.ctx.storage.setAlarm(this.getNextHour()));

		// Self nuke if no longer in original location
		await Promise.all([this.ctx.storage.get<string>('iata'), this.iata]).then(async ([storedIata, currentIata]) => {
			if (storedIata === currentIata) {
				console.debug('Verified', storedIata, "hasn't moved");
			} else {
				await this.nuke();
			}
		});

		// Self nuke if not recorded in D1 (prevent hanging DOs)
		const [row] = await this.db
			.select({
				do_id: schema.instances.do_id,
			})
			.from(schema.instances)
			.where(eq(schema.instances.do_id, sql<Buffer>`unhex(${this.ctx.id.toString()})`))
			.limit(1);
		if (!row) {
			await this.nuke();
		}
	}
}
