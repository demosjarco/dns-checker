import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'sqlite',
	driver: 'd1-http',
	schema: './db/schema.ts',
	casing: 'snake_case',
	out: './db/migrations',
	dbCredentials: {
		accountId: process.env['CF_ACCOUNT_ID']!,
		databaseId: 'deb65f23-6198-4911-85b8-d48810a080cc',
		token: process.env['DB_MIGRATE_CF_API_TOKEN']!,
	},
});
