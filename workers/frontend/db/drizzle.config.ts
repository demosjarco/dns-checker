import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'sqlite',
	driver: 'd1-http',
	schema: './db/schema.ts',
	casing: 'snake_case',
	out: './db/migrations',
	dbCredentials: {
		accountId: process.env['CF_ACCOUNT_ID']!,
		databaseId: '7a33b743-c9ee-4174-85ff-33c7510b9bdc',
		token: process.env['DB_MIGRATE_CF_API_TOKEN']!,
	},
});
