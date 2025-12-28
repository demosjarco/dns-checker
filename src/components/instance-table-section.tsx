import { component$, useContext } from '@builder.io/qwik';
import type { DOLocations } from '@chainfuse/types';
import type iataData from 'iata-location/data';
import InstanceTableRow from '~/components/instance-table-row';
import { LocationsContext } from '~/context';

export default component$<{ region: DOLocations }>(({ region }) => {
	const locations = useContext(LocationsContext);

	return (
		<>
			<div class="text-bjlack sticky top-0 z-10 border-b-2 border-black/12 bg-white/22 px-2 py-3 text-lg font-bold backdrop-blur-lg dark:border-white/33 dark:bg-black/22 dark:text-white">
				<div class="flex items-center justify-between">
					<span>{region}</span>
					<span class="rounded-full bg-indigo-500 px-3 py-1 text-sm font-medium">{Object.keys(locations[region] ?? {}).length} instances</span>
				</div>
			</div>
			{Object.keys(locations[region] ?? {}).map((iata) => (
				<InstanceTableRow key={`${region}-${iata}`} region={region} iata={iata as keyof typeof iataData} />
			))}
		</>
	);
});
