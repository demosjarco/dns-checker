import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'sqlite',
	driver: 'd1-http',
	schema: './db/schema.ts',
	casing: 'snake_case',
	out: './db/migrations',
	dbCredentials: {
		accountId: process.env['CF_ACCOUNT_ID']!,
		databaseId: '6d73e12f-0ccc-4c74-be05-e70e981eb1cd',
		token: process.env['DB_MIGRATE_CF_API_TOKEN']!,
	},
});
