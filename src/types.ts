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

export const PROBE_DB_D1_ID = 'c5bdb710-7b13-4b0f-8a55-2ccaaa94e48d' as const;

export enum DNSRecordType {
	'A (IPv4 Address)' = 'A',
	'AAAA (IPv6 Address)' = 'AAAA',
	'CAA (CA authorizations)' = 'CAA',
	'CNAME (Canonical Name)' = 'CNAME',
	'MX (Mail Exchange)' = 'MX',
	'NAPTR (Name Authority Pointer)' = 'NAPTR',
	'NS (Name Server)' = 'NS',
	'PTR (Pointer)' = 'PTR',
	'SOA (Start of Authority)' = 'SOA',
	'SRV (Service)' = 'SRV',
	'TLSA (certificate associations)' = 'TLSA',
	'TXT (Text)' = 'TXT',
}

export interface DNSJSON {
	Question: Question[];
	Answer: Answer[];
}

interface Question {
	name: string;
	type: number;
}

interface Answer {
	name: string;
	type: number;
	data: string;
	TTL: number;
}
