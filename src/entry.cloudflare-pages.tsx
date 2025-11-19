/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for Cloudflare Pages when building for production.
 *
 * Learn more about the Cloudflare Pages integration here:
 * - https://qwik.dev/docs/deployments/cloudflare-pages/
 *
 */
import { createQwikCity, type PlatformCloudflarePages } from '@builder.io/qwik-city/middleware/cloudflare-pages';
import qwikCityPlan from '@qwik-city-plan';
import type { PlatformProxy } from 'wrangler';
import type { EnvVars } from '~/types';
import render from './entry.ssr';

declare global {
	interface QwikCityPlatformLive extends Omit<PlatformCloudflarePages, 'request' | 'env' | 'ctx'> {
		request: Request;
		env: EnvVars;
		ctx: ExecutionContext;
		cf?: never;
	}
	interface QwikCityPlatformLocal extends Omit<PlatformProxy<EnvVars>, 'request'> {
		request?: never;
	}
	type QwikCityPlatform = (QwikCityPlatformLive | QwikCityPlatformLocal) & {
		caches: CacheStorage;
	};
}

const fetch = createQwikCity({ render, qwikCityPlan });

export { fetch };
