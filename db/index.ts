import type { DOLocations } from '@chainfuse/types';
import { isNotNull, or, sql, type SQL } from 'drizzle-orm/sql';
import { check, sqliteTable, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

/**
 * @returns a copy of string `x` with all ASCII characters converted to lower case
 * @link https://sqlite.org/lang_corefunc.html#lower
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-constraint
function lower<T extends unknown = string>(x: AnySQLiteColumn) {
	return sql<T>`lower(${x})`;
}

export const locations = sqliteTable(
	'locations',
	(l) => ({
		location: l.text({ mode: 'text' }).primaryKey().$type<DOLocations>(),
		doh: l.text({ mode: 'json' }).notNull().$type<string[]>().default([]),
		dot: l.text({ mode: 'json' }).notNull().$type<string[]>().default([]),
	}),
	(l) => [uniqueIndex('case_insensitive_location').on(lower(l.location))],
);

export const instances = sqliteTable('instances', (i) => ({
	doId: i.blob({ mode: 'buffer' }).primaryKey(),
	/**
	 * @deprecated DO NOT USE (BufferHelpers is faster and cheaper)
	 */
	doId_hex: i.text().generatedAlwaysAs((): SQL => sql`lower(hex(${instances.doId}))`, { mode: 'virtual' }),
	location: i
		.text({ mode: 'text' })
		.notNull()
		.$type<DOLocations>()
		.references(() => locations.location, { onUpdate: 'cascade', onDelete: 'cascade' }),
	iata: i.text({ mode: 'text' }).unique().notNull(),
	iso_country: i.text({ mode: 'text' }).notNull(),
	iso_region: i.text({ mode: 'text' }),
}));

export const global_servers = sqliteTable(
	'global_servers',
	(gs) => ({
		doh: gs.text({ mode: 'text' }).unique(),
		dot: gs.text({ mode: 'text' }).unique(),
	}),
	(gs) => [
		//
		check('global_servers_has_dns_endpoint', or(isNotNull(gs.doh), isNotNull(gs.dot))!),
	],
);
