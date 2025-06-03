import { component$, noSerialize, useSignal, useStyles$, useVisibleTask$ } from '@builder.io/qwik';
import { icon, latLngBounds, Map as LeafletMap, marker, tileLayer } from 'leaflet';
import { useIataLocations, useLocationTesterInstances } from '~/routes/layout';

// @ts-expect-error types don't cover css
import leafletStyles from 'leaflet/dist/leaflet.css?inline';

interface InstanceData {
	doId: string;
	iata: string;
	location: string;
}

export const getBoundaryBox = (map: LeafletMap) => {
	const northEast = map.getBounds().getNorthEast();
	const southWest = map.getBounds().getSouthWest();
	return `${southWest.lat},${southWest.lng},${northEast.lat},${northEast.lng}`;
};

export default component$(() => {
	const mapDiv = useSignal<HTMLDivElement>();
	const mapRef = useSignal<LeafletMap>();
	const instances = useLocationTesterInstances();
	const iataLocations = useIataLocations();

	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
	useStyles$(leafletStyles);

	// Handle error state for instances
	if ('error' in instances.value) {
		return (
			<div class="flex items-center justify-center p-10 text-lg text-red-600">
				<p>Error loading instances: {instances.value.error}</p>
			</div>
		);
	}

	// Prepare data for map rendering
	const instancesData = instances.value as InstanceData[];
	const iataData = iataLocations.value;

	// eslint-disable-next-line @typescript-eslint/unbound-method, qwik/no-use-visible-task
	useVisibleTask$(({ track, cleanup }) => {
		track(() => mapDiv.value);

		cleanup(() => mapRef.value?.remove());

		if (mapDiv.value && instancesData.length > 0) {
			// Create map
			mapRef.value = noSerialize(
				new LeafletMap(mapDiv.value, {
					center: [37.780231, -122.390472], // Default center, will be adjusted
					zoom: 2, // Default zoom, will be adjusted
				}),
			);

			// Add tile layer
			tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
				maxZoom: 19,
				attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
			}).addTo(mapRef.value!);

			// Create custom marker icon
			const customIcon = icon({
				iconUrl: '/images/cf-pin.svg',
				iconSize: [32, 14], // Adjusted for the Cloudflare logo aspect ratio
				iconAnchor: [16, 14], // Center bottom of the icon
				popupAnchor: [0, -14],
			});

			// Group instances by unique IATA codes to avoid duplicate markers
			const uniqueIatas = new Map<string, InstanceData[]>();

			for (const instance of instancesData) {
				const iataCode = instance.iata.toUpperCase();
				if (!uniqueIatas.has(iataCode)) {
					uniqueIatas.set(iataCode, []);
				}
				uniqueIatas.get(iataCode)!.push(instance);
			}

			// Create markers and collect bounds
			const bounds = latLngBounds([]);
			let hasValidMarkers = false;

			for (const [iataCode, instanceGroup] of uniqueIatas) {
				const airportInfo = iataData[iataCode];

				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				if (airportInfo?.latitude_deg && airportInfo?.longitude_deg) {
					const lat = parseFloat(airportInfo.latitude_deg);
					const lng = parseFloat(airportInfo.longitude_deg);

					if (!isNaN(lat) && !isNaN(lng)) {
						// Create marker
						const mapMarker = marker([lat, lng], { icon: customIcon });

						// Create popup content
						const popupContent = `
							<div class="font-sans">
								<div class="font-bold text-lg mb-2">${iataCode}</div>
								<div class="text-sm mb-1"><strong>Location:</strong> ${airportInfo.municipality}, ${airportInfo.iso_country}</div>
								<div class="text-sm mb-2"><strong>Instances:</strong> ${instanceGroup.length}</div>
								<div class="text-xs">
									${instanceGroup.map((instance: InstanceData) => `<div>• ${instance.location}</div>`).join('')}
								</div>
							</div>
						`;

						mapMarker.bindPopup(popupContent);
						mapMarker.addTo(mapRef.value!);

						// Extend bounds
						bounds.extend([lat, lng]);
						hasValidMarkers = true;
					}
				}
			}

			// Fit map to show all markers with some padding
			if (hasValidMarkers) {
				mapRef.value!.fitBounds(bounds, {
					padding: [20, 20],
					maxZoom: 10, // Don't zoom in too much even if there's only one marker
				});
			}
		}
	});

	return <div ref={mapDiv} class="h-full w-full"></div>;
});
