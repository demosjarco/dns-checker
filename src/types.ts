import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { RequestIdVariables } from 'hono/request-id';
import type { TimingVariables } from 'hono/timing';
import type * as schema from '~db/index';

export interface EnvVars extends Cloudflare.Env {
	GIT_HASH?: string;
	CF_ACCOUNT_ID: string;
}

export interface InstanceData {
	iata: string;
	do_id: string;
	location: DOLocations;
}

export const PROBE_DB_D1_ID = 'c5bdb710-7b13-4b0f-8a55-2ccaaa94e48d' as const;

export interface ContextVariables extends RequestIdVariables, TimingVariables {
	browserCachePolicy: boolean;
	dbSession: D1DatabaseSession;
	db: DrizzleD1Database<typeof schema>;
	requestDate: Date;
}

/**
 * @link https://developers.cloudflare.com/durable-objects/reference/data-location/#provide-a-location-hint
 */
export enum DOLocations {
	'Western North America' = 'wnam',
	'Eastern North America' = 'enam',
	'South America' = 'sam',
	'Western Europe' = 'weur',
	'Eastern Europe' = 'eeur',
	'Asia-Pacific' = 'apac',
	'Oceania' = 'oc',
	'Africa' = 'afr',
	'Middle East' = 'me',
}

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
