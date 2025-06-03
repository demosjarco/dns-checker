import { component$ } from '@builder.io/qwik';
import { useIataLocations, useLocationTesterInstances } from '~/routes/layout';
import type { InstanceData } from '~/types';

interface LocationGroup {
	location: string;
	iataGroups: IataGroup[];
	totalInstances: number;
}

interface IataGroup {
	iata: string;
	municipality: string;
	country: string;
	instances: InstanceData[];
}

export default component$(() => {
	const instances = useLocationTesterInstances();
	const iataLocations = useIataLocations();

	// Handle error state for instances
	if ('error' in instances.value) {
		return (
			<div class="flex items-center justify-center p-10 text-lg text-red-600">
				<p>Error loading instances: {instances.value.error}</p>
			</div>
		);
	}

	function getAverageLongitude(locationGroup: LocationGroup): number {
		// Calculate average longitude for all IATA codes in this location group
		let totalLongitude = 0;
		let validCount = 0;

		for (const iataGroup of locationGroup.iataGroups) {
			const airportInfo = iataLocations.value[iataGroup.iata];
			if (airportInfo?.longitude_deg) {
				const longitude = parseFloat(airportInfo.longitude_deg);
				if (!isNaN(longitude)) {
					totalLongitude += longitude;
					validCount++;
				}
			}
		}

		// Return average longitude, or 0 if no valid coordinates found
		return validCount > 0 ? totalLongitude / validCount : 0;
	}

	function groupInstancesByLocation(): LocationGroup[] {
		const locationMap = new Map<string, Map<string, IataGroup>>();

		// First, group by location, then by IATA within each location
		const instancesData = Array.isArray(instances.value) ? instances.value : [];
		for (const instance of instancesData) {
			const location = instance.location;
			const iataCode = instance.iata.toUpperCase();
			const airportInfo = iataLocations.value[iataCode];

			if (!locationMap.has(location)) {
				locationMap.set(location, new Map<string, IataGroup>());
			}

			const iataMap = locationMap.get(location)!;
			if (!iataMap.has(iataCode)) {
				iataMap.set(iataCode, {
					iata: iataCode,
					municipality: airportInfo?.municipality ?? 'Unknown',
					country: airportInfo?.iso_country ?? 'Unknown',
					instances: [],
				});
			}

			iataMap.get(iataCode)!.instances.push(instance);
		}

		// Convert to final structure
		const locationGroups: LocationGroup[] = [];
		for (const [location, iataMap] of locationMap.entries()) {
			// Sort IATA groups within each location by longitude (west to east)
			const iataGroups = Array.from(iataMap.values()).sort((a, b) => {
				const airportA = iataLocations.value[a.iata];
				const airportB = iataLocations.value[b.iata];

				const longitudeA = airportA?.longitude_deg ? parseFloat(airportA.longitude_deg) : 0;
				const longitudeB = airportB?.longitude_deg ? parseFloat(airportB.longitude_deg) : 0;

				// Sort by longitude (west to east: negative to positive)
				if (longitudeA !== longitudeB) {
					return longitudeA - longitudeB;
				}

				// If same longitude, sort alphabetically by IATA code
				return a.iata.localeCompare(b.iata);
			});

			const totalInstances = iataGroups.reduce((sum, group) => sum + group.instances.length, 0);

			locationGroups.push({
				location,
				iataGroups,
				totalInstances,
			});
		}

		// Sort geographically from west to east using longitude
		return locationGroups.sort((a, b) => {
			const longitudeA = getAverageLongitude(a);
			const longitudeB = getAverageLongitude(b);

			// Sort by longitude (west to east: negative to positive)
			if (longitudeA !== longitudeB) {
				return longitudeA - longitudeB;
			}

			// If same longitude, sort alphabetically
			return a.location.localeCompare(b.location);
		});
	}

	return (
		<div class="w-full">
			<div>
				{groupInstancesByLocation().map((locationGroup) => (
					<div key={locationGroup.location}>
						<div class="sticky top-0 z-10 border-b-2 border-black/12 bg-white/22 px-2 py-3 text-lg font-bold text-black backdrop-blur-lg dark:border-white/33 dark:bg-black/22 dark:text-white">
							<div class="flex items-center justify-between">
								<span>{locationGroup.location}</span>
								<span class="rounded-full bg-indigo-500 px-3 py-1 text-sm font-medium">{locationGroup.totalInstances} instances</span>
							</div>
						</div>
						{locationGroup.iataGroups.map((iataGroup) => (
							<div key={`${locationGroup.location}-${iataGroup.iata}`} class="flex border-b border-gray-100 hover:bg-white/44 hover:dark:bg-black/44">
								<div class="flex w-16 items-center px-2 py-2">
									<span class="rounded border border-blue-200 bg-blue-50 px-1.5 py-1 font-mono font-bold text-blue-600">{iataGroup.iata}</span>
								</div>
								<div class="flex-1 px-2 py-2">
									<div class="text-sm">
										<div class="font-medium text-black/80 dark:text-white/80">{iataGroup.municipality}</div>
										<div class="text-black/60 dark:text-white/60">{iataGroup.country}</div>
									</div>
								</div>
							</div>
						))}
					</div>
				))}
			</div>
		</div>
	);
});
