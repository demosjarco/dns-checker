import { DurableObject } from 'cloudflare:workers';
import type { EnvVars } from '../src/types';

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

	public lockIn(fullColo: string) {
		return this.ctx.storage.put('colo', fullColo.toLowerCase());
	}

	public async nuke() {
		await Promise.all([
			// Alarm isn't deleted as part of `deleteAll()`
			this.ctx.storage.deleteAlarm(),
			this.ctx.storage.deleteAll(),
		]);
	}
}
