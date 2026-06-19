import { drizzle } from 'drizzle-orm/d1';
import { DefaultLogger } from 'drizzle-orm/logger';
import type { ContextVariables, EnvVars } from '~/types.js';
import { DebugLogWriter } from '~db/extras';
import * as schema from '~db/index';

// Re-export Durable Objects since workerd can only find from `wrangler.jsonc`'s `main` file
export { LocationTester } from '~do/locationTester.mjs';

export default {
	fetch: async (request, env, ctx) => {
		const app = await import('hono').then(({ Hono }) => new Hono<{ Bindings: EnvVars; Variables: ContextVariables }>());

		// Variable Setup
		app.use('*', (c, next) =>
			import('hono/context-storage').then(({ contextStorage }) =>
				contextStorage()(
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					c,
					next,
				),
			),
		);
		app.use('*', async (c, next) => {
			const cacheControl = new Set((c.req.header('Cache-Control')?.split(',') ?? []).map((directive) => directive.trim().toLowerCase()));
			// RFC 7234: no-store forbids storing; no-cache/zero max-age require revalidation so we skip reads
			const antiCacheHeader = cacheControl.has('no-store') || cacheControl.has('no-cache') || cacheControl.has('max-age=0');
			c.set('browserCachePolicy', !antiCacheHeader);

			c.set('dbSession', c.env.PROBE_DB.withSession(c.req.header('X-D1-Bookmark') ?? 'first-unconstrained'));

			c.set(
				'db',
				drizzle(c.var.dbSession as unknown as D1Database, {
					schema,
					casing: 'snake_case',
					logger: new DefaultLogger({ writer: new DebugLogWriter() }),
					cache: c.var.browserCachePolicy
						? await import('~/utils/sqlCache').then(
								async ({ SQLCache }) =>
									new SQLCache({
										dbName: await import('~/types.js').then(({ PROBE_DB_D1_ID }) => PROBE_DB_D1_ID),
										dbType: 'd1',
										cacheTTL: parseInt(env.SQL_TTL, 10),
										strategy: 'all',
									}),
							)
						: undefined,
				}),
			);

			await next();

			const d1bookmark = c.var.dbSession.getBookmark();
			if (d1bookmark) c.header('X-D1-Bookmark', d1bookmark);
		});

		// Security
		app.use('*', (c, next) =>
			import('hono/cors').then(({ cors }) =>
				cors({
					origin: '*',
					maxAge: 300,
				})(
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					c,
					next,
				),
			),
		);

		// Performance
		app.use('*', (c, next) =>
			import('hono/etag').then(({ etag }) =>
				etag()(
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					c,
					next,
				),
			),
		);

		// Debug
		app.use('*', (c, next) =>
			import('hono/timing').then(({ timing }) =>
				timing()(
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					c,
					next,
				),
			),
		);

		await import('~/api-routes/index.mjs').then(({ default: baseApp }) => app.route('/', baseApp));

		return app.fetch(request, env, ctx);
	},
	scheduled: async (controller, env, ctx) => {
		await import('~/scheduled/index').then(({ scheduled }) => scheduled(controller, env, ctx));
	},
} satisfies ExportedHandler<EnvVars>;
