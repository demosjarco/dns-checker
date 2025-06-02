import { DOLocations } from '@chainfuse/types';
import { sql, type SQL } from 'drizzle-orm';
import { sqliteTable, unique, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

/**
 * @returns a copy of string `x` with all ASCII characters converted to lower case
 * @link https://sqlite.org/lang_corefunc.html#lower
 */
function lower<T extends unknown = string>(x: AnySQLiteColumn) {
	return sql<T>`lower(${x})`;
}

export const locations = sqliteTable(
	'locations',
	(l) => ({
		location: l
			.text({ enum: Object.values(DOLocations) as [DOLocations, ...DOLocations[]] })
			.primaryKey()
			.notNull(),
	}),
	(l) => [uniqueIndex('case_insensitive_location').on(lower(l.location))],
);

export const instances = sqliteTable(
	'instances',
	(i) => ({
		doId: i.blob({ mode: 'buffer' }).primaryKey().notNull(),
		/**
		 * @deprecated DO NOT USE (BufferHelpers is faster and cheaper)
		 */
		doId_utf8: i.text().generatedAlwaysAs((): SQL => sql`lower(hex(${instances.doId}))`, { mode: 'virtual' }),
		location: i
			.text({ enum: Object.values(DOLocations) as [DOLocations, ...DOLocations[]] })
			.notNull()
			.references(() => locations.location, { onUpdate: 'cascade', onDelete: 'cascade' }),
		iata: i.text({ mode: 'text' }).notNull(),
		colo: i.integer({ mode: 'number' }).notNull(),
		iso_country: i.text({ mode: 'text' }).notNull(),
		iso_region: i.text({ mode: 'text' }).notNull(),
	}),
	(i) => [unique().on(i.location, i.colo)],
);
