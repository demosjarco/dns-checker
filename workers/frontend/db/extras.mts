import { is } from 'drizzle-orm';
import { NoopCache, type MutationOption } from 'drizzle-orm/cache/core';
import type { CacheConfig } from 'drizzle-orm/cache/core/types';
import type { LogWriter } from 'drizzle-orm/logger';
import { getTableName, Table } from 'drizzle-orm/table';

export class DebugLogWriter implements LogWriter {
	write(message: string) {
		console.debug('D1', message);
	}
}

export class SQLCache extends NoopCache {
	private ctx?: ExecutionContext;
	private globalTtl: number;
	// This object will be used to store which query keys were used
	// for a specific table, so we can later use it for invalidation.
	private usedTablesPerKey: Record<string, string[]> = {};
	private cache = caches.open('d1:dns-probe');

	constructor(cacheTTL: number, ctx?: ExecutionContext) {
		super();

		this.ctx = ctx;
		this.globalTtl = cacheTTL;
	}

	/**
	 * For the strategy, we have two options:
	 * - 'explicit': The cache is used only when .$withCache() is added to a query.
	 * - 'all': All queries are cached globally.
	 * @default 'explicit'
	 */
	override strategy() {
		return 'all' as const;
	}

	private static getCacheKey(key: string, init?: ConstructorParameters<typeof Request>[1]) {
		return new Request(new URL(key, 'https://dns-probe.d1'), init);
	}

	/**
	 * This function accepts query and parameters that cached into key param, allowing you to retrieve response values for this query from the cache.
	 * @param key - A hashed query and parameters.
	 */
	override async get(key: string): Promise<any[] | undefined> {
		const response = await this.cache.then(async (cache) => cache.match(SQLCache.getCacheKey(key)));

		console.debug('SQLCache.get', key, response ? 'HIT' : 'MISS');

		if (response) {
			return response.json();
		} else {
			return response;
		}
	}

	/**
	 * This function accepts several options to define how cached data will be stored:
	 * @param hashedQuery - A hashed query and parameters.
	 * @param response - An array of values returned by Drizzle from the database.
	 * @param tables - An array of tables involved in the select queries. This information is needed for cache invalidation.
	 *
	 * For example, if a query uses the "users" and "posts" tables, you can store this information. Later, when the app executes any mutation statements on these tables, you can remove the corresponding key from the cache.
	 * If you're okay with eventual consistency for your queries, you can skip this option.
	 */
	override async put(hashedQuery: string, response: any, tables: string[], config?: CacheConfig): Promise<void> {
		const cacheBody = JSON.stringify(response);

		const promise = this.cache
			.then(async (cache) =>
				cache.put(
					SQLCache.getCacheKey(hashedQuery),
					new Response(cacheBody, {
						headers: {
							ETag: await import('@chainfuse/helpers').then(({ CryptoHelpers }) => CryptoHelpers.generateETag(new Response(cacheBody))),
							'Content-Type': 'application/json',
							'Cache-Control': `public, max-age=${config?.ex ?? this.globalTtl}, s-maxage=${config?.ex ?? this.globalTtl}`,
						},
					}),
				),
			)
			.then(() => console.debug('SQLCache.put', hashedQuery, 'SUCCESS'));
		if (this.ctx && typeof this.ctx.waitUntil === 'function') {
			this.ctx.waitUntil(promise);
		} else {
			await promise;
		}

		for (const table of tables) {
			const keys = this.usedTablesPerKey[table];
			if (keys === undefined) {
				this.usedTablesPerKey[table] = [hashedQuery];
			} else {
				keys.push(hashedQuery);
			}
		}
	}

	/**
	 * This function is called when insert, update, or delete statements are executed.
	 * You can either skip this step or invalidate queries that used the affected tables.
	 *
	 * @param tags - Used for queries labeled with a specific tag, allowing you to invalidate by that tag.
	 * @param tables - The actual tables affected by the insert, update, or delete statements, helping you track which tables have changed since the last cache update.
	 */
	override async onMutate(params: MutationOption): Promise<void> {
		const tagsArray = params.tags ? (Array.isArray(params.tags) ? params.tags : [params.tags]) : [];
		const tablesArray = params.tables ? (Array.isArray(params.tables) ? params.tables : [params.tables]) : [];
		const keysToDelete = new Set<string>();
		for (const table of tablesArray) {
			const tableName = is(table, Table) ? getTableName(table) : (table as string);
			const keys = this.usedTablesPerKey[tableName] ?? [];
			for (const key of keys) keysToDelete.add(key);
		}
		if (keysToDelete.size > 0 || tagsArray.length > 0) {
			for (const tag of tagsArray) {
				const promise = this.cache.then(async (cache) => cache.delete(SQLCache.getCacheKey(tag))).then(() => console.debug('SQLCache.delete', tag, 'SUCCESS'));
				if (this.ctx && typeof this.ctx.waitUntil === 'function') {
					this.ctx.waitUntil(promise);
				} else {
					await promise;
				}
			}
			for (const key of keysToDelete) {
				const promise = this.cache.then(async (cache) => cache.delete(SQLCache.getCacheKey(key))).then(() => console.debug('SQLCache.delete', key, 'SUCCESS'));
				if (this.ctx && typeof this.ctx.waitUntil === 'function') {
					this.ctx.waitUntil(promise);
				} else {
					await promise;
				}

				for (const table of tablesArray) {
					const tableName = is(table, Table) ? getTableName(table) : (table as string);
					this.usedTablesPerKey[tableName] = [];
				}
			}
		}
	}
}
