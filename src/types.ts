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

export enum DNSRecordType {
	'A Record (IPv4 Address)' = 'A',
	'AAAA Record (IPv6 Address)' = 'AAAA',
	'CNAME Record (Canonical Name)' = 'CNAME',
	'MX Record (Mail Exchange)' = 'MX',
	'TXT Record (Text)' = 'TXT',
	'NS Record (Name Server)' = 'NS',
	'SOA Record (Start of Authority)' = 'SOA',
	'PTR Record (Pointer)' = 'PTR',
	'SRV Record (Service)' = 'SRV',
	'CAA Record (Certification Authority Authorization)' = 'CAA',
}
