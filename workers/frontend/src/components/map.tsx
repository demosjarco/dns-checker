import { component$, noSerialize, useSignal, useStyles$, useVisibleTask$ } from '@builder.io/qwik';
import { LngLatBounds, Map as MapLibreMap, Marker, Popup } from 'maplibre-gl';
import { useIataLocations, useLocationTesterInstances } from '~/routes/layout';
import type { InstanceData } from '~/types';

// @ts-expect-error types don't cover css
import maplibreStyles from 'maplibre-gl/dist/maplibre-gl.css?inline';

export const getBoundaryBox = (map: MapLibreMap) => {
	const bounds = map.getBounds();
	return `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
};

export default component$(() => {
	const mapDiv = useSignal<HTMLDivElement>();
	const mapRef = useSignal<MapLibreMap>();
	const instances = useLocationTesterInstances();
	const iataLocations = useIataLocations();

	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
	useStyles$(maplibreStyles);

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
				new MapLibreMap({
					container: mapDiv.value,
					style: {
						version: 8,
						sources: {
							openstreetmap: {
								type: 'raster',
								tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
								tileSize: 256,
								attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
							},
						},
						layers: [
							{
								id: 'openstreetmap',
								type: 'raster',
								source: 'openstreetmap',
								minzoom: 0,
								maxzoom: 19,
							},
						],
					},
					center: [-122.390472, 37.780231], // Default center, will be adjusted
					zoom: 2, // Default zoom, will be adjusted
				}),
			);

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
			const bounds = new LngLatBounds();
			let hasValidMarkers = false;

			for (const [iataCode, instanceGroup] of uniqueIatas) {
				const airportInfo = iataData[iataCode];

				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				if (airportInfo?.latitude_deg && airportInfo?.longitude_deg) {
					const lat = parseFloat(airportInfo.latitude_deg);
					const lng = parseFloat(airportInfo.longitude_deg);

					if (!isNaN(lat) && !isNaN(lng)) {
						// Create custom marker element
						const markerElement = document.createElement('div');
						markerElement.style.backgroundImage = 'url(/images/cf-pin.svg)';
						markerElement.style.width = '32px';
						markerElement.style.height = '14px';
						markerElement.style.backgroundSize = 'contain';
						markerElement.style.backgroundRepeat = 'no-repeat';
						markerElement.style.cursor = 'pointer';

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

						// Create popup
						const popup = new Popup({ offset: [0, -14] }).setHTML(popupContent);

						// Create marker
						new Marker({ element: markerElement }).setLngLat([lng, lat]).setPopup(popup).addTo(mapRef.value!);

						// Extend bounds
						bounds.extend([lng, lat]);
						hasValidMarkers = true;
					}
				}
			}

			// Fit map to show all markers with some padding
			if (hasValidMarkers) {
				mapRef.value!.fitBounds(bounds, {
					padding: { top: 20, bottom: 20, left: 20, right: 20 },
					maxZoom: 10, // Don't zoom in too much even if there's only one marker
				});
			}
		}
	});

	return <div ref={mapDiv} class="h-full w-full"></div>;
});
