import type { DOLocations } from '@chainfuse/types';
import type { LocationTester } from '~do/locationTester.mjs';

export interface EnvVars extends Secrets, Omit<Cloudflare.Env, 'LOCATION_TESTER'>, TypedBindings {
	GIT_HASH?: string;
	CF_ACCOUNT_ID: string;
}

interface Secrets {
	CF_API_TOKEN: string;
}

interface TypedBindings {
	LOCATION_TESTER: DurableObjectNamespace<LocationTester>;
}

export interface InstanceData {
	iata: string;
	doId: string;
	location: DOLocations;
}

export const PROBE_DB_D1_ID = 'b6f73c1f-0472-466e-9051-b2a0d7fd3202' as const;
