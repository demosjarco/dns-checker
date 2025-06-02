import type { LocationTester } from '~do/locationTester.mjs';

export interface EnvVars extends Secrets, Omit<Env, 'LOCATION_TESTER'> {
	GIT_HASH: string;
	LOCATION_TESTER: DurableObjectNamespace<LocationTester>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface Secrets {}
