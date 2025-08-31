import type { DOLocations } from '@chainfuse/types';

export interface EnvVars extends Secrets, TypedBindings {
	GIT_HASH?: string;
	CF_ACCOUNT_ID: string;
}

interface Secrets {
	CF_API_TOKEN: string;
}

interface TypedBindings {
	ENVIRONMENT: 'production';
	NODE_ENV: 'production';
	SQL_TTL: `${number}`;
	CF_ACCOUNT_ID: string;
	LOCATION_TESTER: DurableObjectNamespace<import('~do/locationTester.mjs').LocationTester>;
	PROBE_DB: D1Database;
	CF_VERSION_METADATA: WorkerVersionMetadata;
	ASSET: Fetcher;
}

export interface InstanceData {
	iata: string;
	doId: string;
	location: DOLocations;
}

export const PROBE_DB_D1_ID = '18a3c458-4d55-419f-9878-535bd322c7a7' as const;
