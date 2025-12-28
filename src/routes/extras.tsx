import { SQLCache } from '@chainfuse/helpers';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { DefaultLogger } from 'drizzle-orm/logger';
import type { Airport } from '~/entry.cloudflare-workers';
import { PROBE_DB_D1_ID } from '~/types';
import { DebugLogWriter } from '~db/extras';
import * as schema from '~db/index';

export function browserCachePolicy(platform: QwikCityPlatform, request: Request) {
	const headers = (platform.request ?? request).headers;
	const cacheControl = new Set((headers.get('Cache-Control')?.split(',') ?? []).map((directive) => directive.trim().toLowerCase()));
	// RFC 7234: no-store forbids storing; no-cache/zero max-age require revalidation so we skip reads
	const antiCacheHeader = cacheControl.has('no-store') || cacheControl.has('no-cache') || cacheControl.has('max-age=0') || cacheControl.has('s-maxage=0');

	return !antiCacheHeader;
}

export function drizzleDb(platform: QwikCityPlatform, request: Request): DrizzleD1Database<typeof schema>;
export function drizzleDb(platform: QwikCityPlatform, browserCache: boolean): DrizzleD1Database<typeof schema>;
export function drizzleDb(platform: QwikCityPlatform, requestOrCacheBool: Request | boolean): DrizzleD1Database<typeof schema> {
	return drizzle(platform.env.PROBE_DB.withSession() as unknown as D1Database, {
		schema,
		logger: new DefaultLogger({ writer: new DebugLogWriter() }),
		casing: 'snake_case',
		cache: (typeof requestOrCacheBool === 'boolean' ? requestOrCacheBool : browserCachePolicy(platform, requestOrCacheBool))
			? new SQLCache(
					{
						dbName: PROBE_DB_D1_ID,
						dbType: 'd1',
						cacheTTL: parseInt(platform.env.SQL_TTL, 10),
						strategy: 'all',
					},
					platform.caches ?? globalThis.caches,
				)
			: undefined,
	});
}

export const iataLocations = import('iata-location/data').then(({ default: allAirports }) => allAirports as Record<string, Airport>);
