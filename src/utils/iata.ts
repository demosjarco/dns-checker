import { z } from '@hono/zod-openapi';
import type iataData from 'iata-location/data';
import type { Airport } from '~/types';

export type IATA = keyof typeof iataData;

/**
 * `iata-location/data` is 1 CommonJS module per airport behind `__exportStar` barrels, evaluating all of it costs ~270ms of CPU.
 * Only load (and evaluate) the barrel for the first letter of the requested code, and only when it's actually needed (not in global scope).
 * Each entry has to be a static specifier for the bundler to resolve it.
 */
const airportsByFirstLetter: Record<string, () => Promise<Partial<Record<IATA, Airport>>>> = {
	A: () => import('iata-location/data/A'),
	B: () => import('iata-location/data/B'),
	C: () => import('iata-location/data/C'),
	D: () => import('iata-location/data/D'),
	E: () => import('iata-location/data/E'),
	F: () => import('iata-location/data/F'),
	G: () => import('iata-location/data/G'),
	H: () => import('iata-location/data/H'),
	I: () => import('iata-location/data/I'),
	J: () => import('iata-location/data/J'),
	K: () => import('iata-location/data/K'),
	L: () => import('iata-location/data/L'),
	M: () => import('iata-location/data/M'),
	N: () => import('iata-location/data/N'),
	O: () => import('iata-location/data/O'),
	P: () => import('iata-location/data/P'),
	Q: () => import('iata-location/data/Q'),
	R: () => import('iata-location/data/R'),
	S: () => import('iata-location/data/S'),
	T: () => import('iata-location/data/T'),
	U: () => import('iata-location/data/U'),
	V: () => import('iata-location/data/V'),
	W: () => import('iata-location/data/W'),
	X: () => import('iata-location/data/X'),
	Y: () => import('iata-location/data/Y'),
	Z: () => import('iata-location/data/Z'),
};

/**
 * Shape check only (case insensitive). Existence is checked against D1 (unknown codes have no instance and 404)
 * A `z.enum()` of every IATA code would need the full dataset in global scope
 */
export const iataSchema = z
	.string()
	.trim()
	.toUpperCase()
	.regex(/^[A-Z]{3}$/)
	.transform((iata) => iata as IATA);

export async function lookupAirport(iata: string): Promise<Airport | undefined> {
	const normalized = iata.trim().toUpperCase() as IATA;

	return airportsByFirstLetter[normalized.charAt(0)]?.().then((airports) => airports[normalized]);
}
