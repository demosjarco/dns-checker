import { component$, useContext } from '@builder.io/qwik';
import type { DOLocations } from '@chainfuse/types';
import InstanceTableSection from '~/components/instance-table-section';
import { LocationsContext } from '~/context';

export default component$(() => {
	const locations = useContext(LocationsContext);

	return (
		<div class="w-full">
			{Object.keys(locations).map((region) => (
				<InstanceTableSection key={region} region={region as DOLocations} />
			))}
		</div>
	);
});
