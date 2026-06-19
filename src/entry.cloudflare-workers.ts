import { drizzle } from 'drizzle-orm/d1';
import { DefaultLogger } from 'drizzle-orm/logger';
import type { Context } from 'hono';
import type { ContextVariables, EnvVars } from '~/types.js';
import { DebugLogWriter } from '~db/extras';
import * as schema from '~db/index';

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

			if (c.req.raw.headers.has('X-Timestamp-S') && c.req.raw.headers.has('X-Timestamp-MS')) {
				c.set('requestDate', new Date(parseInt(c.req.header('X-Timestamp-S')!, 10) * 1000 + parseInt(c.req.header('X-Timestamp-MS')!, 10)));
			} else if (request.cf?.clientTcpRtt) {
				c.set('requestDate', new Date(Date.now() - request.cf.clientTcpRtt));
			} else {
				c.set('requestDate', new Date());
			}

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
			Promise.all([import('hono/request-id'), import('uuid'), import('node:crypto')]).then(([{ requestId }, { v7: uuidv7 }, { randomBytes, createHash }]) =>
				requestId({
					generator: (c: Context<{ Bindings: EnvVars; Variables: ContextVariables }>) => {
						// Try and get ray id properly (<16 digit hex>-<colo IATA>)
						let rawRayId = c.req.header('cf-ray');

						// Fuck it, we make up our own
						rawRayId ??= (() => {
							// Use uuid7 for timestamp + globally random
							const uuid = uuidv7({ random: randomBytes(16), msecs: c.var.requestDate.getTime() });
							const uuidHex = uuid.replaceAll('-', '');

							// We don't use full raw value. We hash it
							const hash = createHash('sha256').update(uuidHex).digest('hex');

							// Timestamp is first 16 bytes (but we ignore the first 2 because that's such a high magnitude of time), then backfil with the ending of the hash
							return `${uuidHex.slice(2, 8)}${hash.slice(-10)}`;
						})();

						const rayIdSections = rawRayId.split('-');
						if (rayIdSections.length === 2) {
							return rawRayId;
						} else {
							const colo = c.req.raw.cf?.colo as IncomingRequestCfPropertiesBase['colo'] | undefined;
							return `${rawRayId}-${colo}`;
						}
					},
				})(
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					c,
					next,
				),
			),
		);
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
