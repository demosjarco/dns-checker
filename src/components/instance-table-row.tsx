import { component$, useContext } from '@builder.io/qwik';
import type { DOLocations } from '@chainfuse/types';
import type iataData from 'iata-location/data';
import { LocationsContext } from '~/context';
import { describeAnswer, getFirstResolverEntry } from '~/utils/dns';

export default component$<{ region: DOLocations; iata: keyof typeof iataData }>(({ region, iata }) => {
	const locations = useContext(LocationsContext);
	const firstResolver = getFirstResolverEntry(locations[region]?.[iata]?.dns);

	return (
		<div class="flex border-b border-gray-100 hover:bg-white/44 hover:dark:bg-black/44">
			<div class="flex w-16 items-center px-2 py-2">
				<span class="rounded border border-blue-200 bg-blue-50 px-1.5 py-1 font-mono font-bold text-blue-600">{iata}</span>
			</div>
			<div class="flex flex-col px-2 py-2">
				<div class="text-sm">
					<span class="font-medium text-black/80 dark:text-white/80">{locations[region]?.[iata]?.municipality}</span> <span class="text-black/60 dark:text-white/60">{locations[region]?.[iata]?.country}</span>
				</div>
				<pre class="max-w-3xs truncate text-black/80 dark:text-white/80" title={firstResolver?.resolver}>
					{firstResolver ? describeAnswer(firstResolver.payload) : 'Waiting'}
				</pre>
			</div>
		</div>
	);
});
