import type * as z4 from 'zod/v4';
import type { output as dnsOutput } from '~/api-routes/region/[code]/instance/[iata]/dns/index.mjs';

type DnsResult = z4.output<typeof dnsOutput>;

export const describeAnswer = (payload: unknown): string => {
	if (payload === null || payload === undefined) return 'No response';
	if (typeof payload === 'string') return payload;
	if (Array.isArray(payload)) {
		if (payload.length === 0) return 'Empty response';
		const firstItem = payload[0];
		return typeof firstItem === 'string' ? firstItem : JSON.stringify(payload);
	}
	if (typeof payload === 'object') return JSON.stringify(payload);
	return String(payload);
};

export const getFirstResolverEntry = (dns?: DnsResult | null) => {
	if (!dns) return null;
	const [resolver, payload] = Object.entries(dns).find(([, value]) => value !== undefined) ?? [];
	if (!resolver) return null;
	return { resolver, payload } as { resolver: string; payload: unknown };
};
