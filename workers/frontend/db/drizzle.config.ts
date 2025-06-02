import { defineConfig } from 'drizzle-kit';
import { PROBE_DB_D1_ID } from '~/types';

export default defineConfig({
	dialect: 'sqlite',
	driver: 'd1-http',
	schema: './db/schema.ts',
	casing: 'snake_case',
	out: './db/migrations',
	dbCredentials: {
		accountId: process.env['CF_ACCOUNT_ID']!,
		databaseId: PROBE_DB_D1_ID,
		token: process.env['DB_MIGRATE_CF_API_TOKEN']!,
	},
});
