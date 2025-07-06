import { component$, noSerialize, useSignal, useStyles$, useVisibleTask$, type NoSerialize, type Signal } from '@builder.io/qwik';
import type { FailReturn } from '@builder.io/qwik-city';
import { renderToString } from '@builder.io/qwik/server';
import type { DOLocations } from '@chainfuse/types';
import { divIcon, LatLngBounds, Map as LeafletMap, marker, tileLayer } from 'leaflet';
import { useIataLocations, useLocationTesterInstances } from '~/routes/layout';
import type { InstanceData } from '~/types';

// @ts-expect-error types don't cover css
import leafletStyles from 'leaflet/dist/leaflet.css?inline';

export const getBoundaryBox = (map: LeafletMap) => {
	const northEast = map.getBounds().getNorthEast();
	const southWest = map.getBounds().getSouthWest();
	return `${southWest.lat},${southWest.lng},${northEast.lat},${northEast.lng}`;
};

export default component$(() => {
	const mapDiv = useSignal<HTMLDivElement>();
	const mapRef = useSignal<NoSerialize<LeafletMap>>();
	const instances = useLocationTesterInstances() as Readonly<
		Signal<
			| {
					iata: string;
					doId: string;
					location: DOLocations;
			  }[]
			| FailReturn<{
					error: string;
			  }>
		>
	>;
	const iataLocations = useIataLocations();
	const userHasZoomed = useSignal(false);
	const isAutoFitting = useSignal(false);

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

	// eslint-disable-next-line @typescript-eslint/unbound-method, qwik/no-use-visible-task
	useVisibleTask$(async ({ track, cleanup }) => {
		track(() => mapDiv.value);

		cleanup(() => mapRef.value?.remove());

		function fitMapBounds(bounds: LatLngBounds) {
			if (mapRef.value && !userHasZoomed.value) {
				isAutoFitting.value = true;
				mapRef.value.fitBounds(bounds, {
					padding: [20, 20],
					maxZoom: 19,
				});
			}
		}

		if (mapDiv.value && !('error' in instances.value) && instances.value.length > 0) {
			// Create map
			mapRef.value = noSerialize(
				new LeafletMap(mapDiv.value, {
					center: [0, 0], // Default center, will be adjusted
					zoom: 2, // Default zoom, will be adjusted
					preferCanvas: true,
				}),
			);

			tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
				maxZoom: 19,
				attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
			}).addTo(mapRef.value!);

			// Listen for user zoom
			mapRef.value?.on('zoomstart', () => {
				if (!isAutoFitting.value) {
					userHasZoomed.value = true;
				}
			});
			// Reset auto-fit flag after move ends
			mapRef.value?.on('moveend', () => {
				isAutoFitting.value = false;
			});

			// Group unique IATA codes (case-insensitive)
			const uniqueIataCodes = Array.from(new Set((instances.value as InstanceData[]).map((instance) => instance.iata.toUpperCase())));

			// Create markers and collect bounds
			const bounds = new LatLngBounds([]);
			let hasValidMarkers = false;

			// Create custom marker element
			const markerSize: [number, number] = [32, 14];
			const markerElement = await renderToString(<div class={`h-[${markerSize[1]}px] w-[${markerSize[0]}px] cursor-pointer bg-[url(/images/cf-pin.svg)] bg-contain bg-no-repeat`}></div>, { containerTagName: 'div' });

			await Promise.all(
				uniqueIataCodes.map(async (iataCode) => {
					const airportInfo = iataLocations.value[iataCode];

					if (airportInfo?.latitude_deg && airportInfo.longitude_deg) {
						const lat = parseFloat(airportInfo.latitude_deg);
						const lng = parseFloat(airportInfo.longitude_deg);

						if (!isNaN(lat) && !isNaN(lng)) {
							// Create popup content
							const popupContent = await renderToString(
								<div key={`popup-${iataCode}`}>
									<div class="mb-2 text-lg font-bold">{iataCode}</div>
									<div class="mb-1 text-sm">
										<strong>Location:</strong> {[airportInfo.municipality, airportInfo.iso_country].join(', ')}
									</div>
								</div>,
								{ containerTagName: 'div' },
							);

							// Create marker and popup using Leaflet
							const mapMarker = marker([lat, lng], {
								icon: divIcon({
									html: markerElement.html,
									iconSize: markerSize,
									className: '',
								}),
							}).addTo(mapRef.value!);
							mapMarker.bindPopup(popupContent.html);

							bounds.extend([lat, lng]);
							hasValidMarkers = true;
						}
					}
				}),
			);

			// Fit map to show all markers with some padding
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (hasValidMarkers) {
				fitMapBounds(bounds);
			}

			// Observe map div size changes
			const resizeObserver = new ResizeObserver(() => {
				if (hasValidMarkers) fitMapBounds(bounds);
			});
			resizeObserver.observe(mapDiv.value);

			cleanup(() => {
				if (mapDiv.value) resizeObserver.unobserve(mapDiv.value);
			});
		}
	});

	return <div ref={mapDiv} class="h-full w-full"></div>;
});
