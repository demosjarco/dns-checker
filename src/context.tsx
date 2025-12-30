import { createContextId } from '@builder.io/qwik';
import type { DOLocations } from '@chainfuse/types';
import type iataData from 'iata-location/data';
import type * as z4 from 'zod/v4';
import type { output as dnsOutput } from '~/api-routes/region/[code]/instance/[iata]/dns/index.mjs';
import type { output as instanceOutput } from '~/api-routes/region/[code]/instance/[iata]/index.mjs';

export type LocationsContextType = Partial<Record<DOLocations, Partial<Record<keyof typeof iataData, Partial<z4.output<typeof instanceOutput>> & { dns?: z4.output<typeof dnsOutput> }>>>>;
export const LocationsContextName = 'LocationsContext';
export const LocationsContext = createContextId<LocationsContextType>(LocationsContextName);
