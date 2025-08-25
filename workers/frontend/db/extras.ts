import { CryptoHelpers } from '@chainfuse/helpers';
import { Cache as DrizzleCache, type MutationOption } from 'drizzle-orm/cache/core';
import type { CacheConfig } from 'drizzle-orm/cache/core/types';
import { is } from 'drizzle-orm/entity';
import type { LogWriter } from 'drizzle-orm/logger';
import { getTableName, Table } from 'drizzle-orm/table';
import { z } from 'zod/v4';

export class DebugLogWriter implements LogWriter {
	write(message: string) {
		console.debug('D1', message);
	}
}

export class SQLCache extends DrizzleCache {
	private dbName: z.output<ReturnType<(typeof SQLCache)['constructorArgs']>>['dbName'];
	private dbType: z.output<ReturnType<(typeof SQLCache)['constructorArgs']>>['dbType'];
	private cache: Promise<Cache>;
	private globalTtl: z.output<ReturnType<(typeof SQLCache)['constructorArgs']>>['cacheTTL'];
	private _strategy: z.output<ReturnType<(typeof SQLCache)['constructorArgs']>>['strategy'];
	// This object will be used to store which query keys were used
	// for a specific table, so we can later use it for invalidation.
	private usedTablesPerKey: Record<string, string[]> = {};

	private static constructorArgs() {
		return z.object({
			dbName: z
				.string()
				.nonempty()
				.transform((val) => encodeURIComponent(val)),
			dbType: z
				.string()
				.nonempty()
				.transform((val) => encodeURIComponent(val)),
			cacheTTL: z
				.int()
				.nonnegative()
				.default(5 * 60),
			strategy: z.enum(['explicit', 'all']).default('explicit'),
		});
	}

	/**
	 * Creates an instance of the class with the specified database name, type, and cache TTL.
	 *
	 * @param dbName - The name of the database to use. Must be globally unique as it is used for cache lookup. Will be url encoded if not already url safe.
	 * @param dbType - The type of the database (e.g., `d1`, `pg` `mysql`). Will be url encoded if not already url safe.
	 * @param cacheTTL - The time-to-live (TTL) value for the cache, in seconds.
	 * @param strategy - The caching strategy to use. Defaults to 'explicit'.
	 * - `explicit`: The cache is used only when .$withCache() is added to a query.
	 * - `all`: All queries are cached globally.
	 * @param cacheStore - The cache store to use. Can be a CacheStorage (like the global `caches`) or a custom object with `default` property of type Cache and `open()` function.
	 */
	constructor(args: z.input<ReturnType<(typeof SQLCache)['constructorArgs']>>, cacheStore: CacheStorage = caches) {
		super();
		const { dbName, dbType, cacheTTL, strategy } = SQLCache.constructorArgs().parse(args);

		this.dbName = dbName;
		this.dbType = dbType;

		if ('open' in cacheStore && typeof cacheStore.open === 'function') {
			this.cache = cacheStore.open(`${dbType}:${dbName}`);
		} else {
			throw new Error('Cache store must be a CacheStorage (or subclass/instance of)');
		}
		this.globalTtl = cacheTTL;
		this._strategy = strategy;
	}

	/**
	 * For the strategy, we have two options:
	 * - `explicit`: The cache is used only when .$withCache() is added to a query.
	 * - `all`: All queries are cached globally.
	 * @default 'explicit'
	 */
	override strategy() {
		return this._strategy;
	}

	/**
	 * Generates a cache key as a `Request` object based on the provided tag or key.
	 *
	 * @param tagOrKey - An object containing either a `tag` or a `key` property to identify the cache entry.
	 * @param init - Optional request initialization parameters, as accepted by the `Request` constructor.
	 * @returns A `Request` object representing the cache key, constructed with a URL based on the tag or key and the database configuration.
	 */
	private getCacheKey(tagOrKey: { tag: string } | { key: string }, init?: ConstructorParameters<typeof Request>[1]) {
		return new Request(new URL(('tag' in tagOrKey ? ['tag', tagOrKey.tag] : ['key', tagOrKey.key]).join('/'), `https://${this.dbName}.${this.dbType}`), init);
	}

	/**
	 * This function accepts query and parameters that cached into key param, allowing you to retrieve response values for this query from the cache.
	 * @param key - A hashed query and parameters.
	 */
	override async get(key: string, tables: string[], isTag: boolean): Promise<any[] | undefined> {
		const response = await this.cache.then(async (cache) => cache.match(this.getCacheKey(isTag ? { tag: key } : { key })));

		console.debug('SQLCache.get', isTag ? 'tag' : 'key', key, response?.ok ? 'HIT' : 'MISS');

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
	override async put(hashedQuery: string, response: any, tables: string[], isTag: boolean, config?: CacheConfig): Promise<void> {
		let ttl: number = this.globalTtl;
		if (config?.ex) {
			ttl = config.ex;
		} else if (config?.px) {
			ttl = Math.floor(config.px / 1000);
		} else if (config?.exat) {
			ttl = Math.floor((new Date(config.exat * 1000).getTime() - Date.now()) / 1000);
		} else if (config?.pxat) {
			ttl = Math.floor((new Date(config.pxat).getTime() - Date.now()) / 1000);
		}

		const cacheRequest = new Response(JSON.stringify(response), {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`,
			},
		});

		cacheRequest.headers.set('ETag', await CryptoHelpers.generateETag(cacheRequest));

		await this.cache.then(async (cache) => cache.put(this.getCacheKey(isTag ? { tag: hashedQuery } : { key: hashedQuery }), cacheRequest)).then(() => console.debug('SQLCache.put', isTag ? 'tag' : 'key', hashedQuery, 'SUCCESS'));

		for (const table of tables) {
			(this.usedTablesPerKey[table] ??= []).push(hashedQuery);
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
				await this.cache.then(async (cache) => cache.delete(this.getCacheKey({ tag }))).then(() => console.debug('SQLCache.delete', 'tag', tag, 'SUCCESS'));
			}
			for (const key of keysToDelete) {
				await this.cache.then(async (cache) => cache.delete(this.getCacheKey({ key }))).then(() => console.debug('SQLCache.delete', 'key', key, 'SUCCESS'));

				for (const table of tablesArray) {
					const tableName = is(table, Table) ? getTableName(table) : (table as string);
					this.usedTablesPerKey[tableName] = [];
				}
			}
		}
	}
}
