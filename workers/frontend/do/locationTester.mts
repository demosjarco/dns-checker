import { DurableObject } from 'cloudflare:workers';
import type { EnvVars } from '../src/types';

export abstract class LocationTester<E extends Env = EnvVars> extends DurableObject<E> {}
