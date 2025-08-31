import type { DOLocations } from '@chainfuse/types';

export interface EnvVars extends Secrets, Omit<Cloudflare.Env, ''>, TypedBindings {
	GIT_HASH?: string;
	CF_ACCOUNT_ID: string;
}

interface Secrets {
	CF_API_TOKEN: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface TypedBindings {}

export interface InstanceData {
	iata: string;
	doId: string;
	location: DOLocations;
}
