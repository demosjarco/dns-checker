import type { DOLocations } from '@chainfuse/types';
import type { DurableObject } from 'cloudflare:workers';

export interface EnvVars extends Secrets, Omit<Cloudflare.Env, 'LOCATION_TESTER'>, TypedBindings {
	GIT_HASH?: string;
	CF_ACCOUNT_ID: string;
}

interface Secrets {
	CF_API_TOKEN: string;
}

export declare class LocationTesterBase<E = unknown> extends DurableObject<E> {
	public get iata(): Promise<string>;
	public get fullColo(): Promise<string | undefined>;
	public lockIn(iata: string): Promise<void>;
	public nuke(): Promise<void>;
}

interface TypedBindings {
	LOCATION_TESTER: DurableObjectNamespace<LocationTesterBase>;
}

export interface InstanceData {
	iata: string;
	doId: string;
	location: DOLocations;
}
