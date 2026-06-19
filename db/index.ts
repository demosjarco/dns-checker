import { isNotNull, or, sql, type SQL } from 'drizzle-orm/sql';
import { check, index, snakeCase, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type iataData from 'iata-location/data';
import { DOLocations } from '~/types';

export const global_servers = snakeCase.table(
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

export const instances = snakeCase.table(
	'instances',
	(i) => ({
		do_id: i.blob({ mode: 'buffer' }).primaryKey().notNull(),
		/**
		 * @deprecated DO NOT USE (BufferHelpers is faster and cheaper)
		 */
		do_id_hex: i.text().generatedAlwaysAs((): SQL => sql`lower(hex(${instances.do_id}))`, { mode: 'virtual' }),
		location: i
			.text({ enum: Object.values(DOLocations) as [DOLocations, ...DOLocations[]] })
			.notNull()
			.references(() => locations.location, { onUpdate: 'cascade', onDelete: 'cascade' }),
		iata: i.text({ mode: 'text' }).unique().notNull().$type<keyof typeof iataData>(),
		iso_country: i.text({ mode: 'text' }).notNull(),
		iso_region: i.text({ mode: 'text' }),
	}),
	(i) => [
		//
		index('instances_location').on(i.location),
	],
);

export const locations = snakeCase.table(
	'locations',
	(l) => ({
		location: l
			.text({ enum: Object.values(DOLocations) as [DOLocations, ...DOLocations[]] })
			.primaryKey()
			.notNull(),
		doh: l.text({ mode: 'json' }).notNull().$type<string[]>().default([]),
		dot: l.text({ mode: 'json' }).notNull().$type<string[]>().default([]),
	}),
	(l) => [
		//
		uniqueIndex('case_insensitive_location').on(sql<string>`lower(${l.location})`),
	],
);
