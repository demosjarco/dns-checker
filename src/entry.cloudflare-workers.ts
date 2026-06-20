import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { cors } from 'hono/cors';
import { etag } from 'hono/etag';
import { timing } from 'hono/timing';
import baseApp from '~/api-routes/index.mjs';
import { PROBE_DB_D1_ID, type ContextVariables, type EnvVars } from '~/types.js';
import { SQLCache } from '~/utils/sqlCache';
import * as schema from '~db/index';

// Re-export Durable Objects since workerd can only find from `wrangler.jsonc`'s `main` file
export { LocationTester } from '~do/locationTester.mjs';

// Re-export Workflows since workerd can only find from from `wrangler.jsonc`'s `main` file
export { UpdateIatas } from '~wf/updateIatas.js';

const app = new Hono<{ Bindings: EnvVars; Variables: ContextVariables }>();

// Variable Setup
app.use('*', contextStorage());
app.use('*', async (c, next) => {
	const cacheControl = new Set((c.req.header('Cache-Control')?.split(',') ?? []).map((directive) => directive.trim().toLowerCase()));
	// RFC 7234: no-store forbids storing; no-cache/zero max-age require revalidation so we skip reads
	const antiCacheHeader = cacheControl.has('no-store') || cacheControl.has('no-cache') || cacheControl.has('max-age=0');
	c.set('browserCachePolicy', !antiCacheHeader);

	c.set('dbSession', c.env.PROBE_DB.withSession(c.req.header('X-D1-Bookmark') ?? 'first-unconstrained'));

	c.set(
		'db',
		drizzle(c.var.dbSession, {
			schema,
			cache: new SQLCache({
				dbName: PROBE_DB_D1_ID,
				dbType: 'd1',
				cacheTTL: parseInt(c.env.SQL_TTL, 10),
				strategy: c.var.browserCachePolicy ? 'all' : 'explicit',
			}),
		}),
	);

	await next();

	const d1bookmark = c.var.dbSession.getBookmark();
	if (d1bookmark) c.header('X-D1-Bookmark', d1bookmark);
});

// Security
app.use('*', cors({ origin: '*', maxAge: 300 }));

// Performance
app.use('*', etag());

// Debug
app.use('*', timing());

app.route('/', baseApp);

export default app;
