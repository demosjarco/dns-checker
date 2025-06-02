import type { DOLocations } from '@chainfuse/types';
import { sql, type SQL } from 'drizzle-orm';
import { sqliteTable, unique, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

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
		location: l.text({ mode: 'text' }).primaryKey().notNull().$type<DOLocations>(),
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
		doId_hex: i.text().generatedAlwaysAs((): SQL => sql`lower(hex(${instances.doId}))`, { mode: 'virtual' }),
		location: i
			.text({ mode: 'text' })
			.notNull()
			.$type<DOLocations>()
			.references(() => locations.location, { onUpdate: 'cascade', onDelete: 'cascade' }),
		iata: i.text({ mode: 'text' }).notNull(),
		colo: i.integer({ mode: 'number' }).notNull(),
		iso_country: i.text({ mode: 'text' }).notNull(),
		iso_region: i.text({ mode: 'text' }),
	}),
	(i) => [unique().on(i.iata, i.colo)],
);
