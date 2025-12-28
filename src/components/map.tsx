import { $, component$, noSerialize, useContext, useSignal, useStyles$, useVisibleTask$, type NoSerialize, type QRL } from '@builder.io/qwik';
import type { Marker } from 'leaflet';
import { divIcon, LatLngBounds, Map as LeafletMap, marker, tileLayer } from 'leaflet';

// @ts-expect-error types don't cover css
import leafletStyles from 'leaflet/dist/leaflet.css?inline';
import { LocationsContext, type LocationsContextType } from '~/context';

export const getBoundaryBox = (map: LeafletMap) => {
	const northEast = map.getBounds().getNorthEast();
	const southWest = map.getBounds().getSouthWest();
	return `${southWest.lat},${southWest.lng},${northEast.lat},${northEast.lng}`;
};

export const useDebouncer = <A extends unknown[], R>(fn: QRL<(...args: A) => R>, delay: number): QRL<(...args: A) => void> => {
	const timeoutId = useSignal<number>();

	return $((...args: A): void => {
		window.clearTimeout(timeoutId.value);
		timeoutId.value = window.setTimeout((): void => {
			void fn(...args);
		}, delay);
	});
};

export default component$(() => {
	const mapDiv = useSignal<HTMLDivElement>();
	const mapRef = useSignal<NoSerialize<LeafletMap>>();
	const userHasZoomed = useSignal(false);
	const isAutoFitting = useSignal(false);

	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
	useStyles$(leafletStyles);

	// Setup map
	// eslint-disable-next-line @typescript-eslint/unbound-method
	useVisibleTask$(({ track, cleanup }) => {
		track(() => mapDiv.value);

		cleanup(() => mapRef.value?.remove());

		if (mapDiv.value) {
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
		}
	});

	const locations = useContext(LocationsContext);
	const debouncedLocations = useSignal<LocationsContextType>({});
	const debounce = useDebouncer(
		$((value: LocationsContextType) => (debouncedLocations.value = value)),
		1000,
	);

	const markersRef = useSignal<NoSerialize<Marker[]>>();

	// Load markers immediately
	useVisibleTask$(({ track }) => {
		track(() => mapRef.value);
		track(() => JSON.stringify(locations));
		void debounce(locations);

		if (mapRef.value) {
			// Clear old markers before drawing new ones
			markersRef.value?.forEach((existingMarker) => existingMarker.remove());
			markersRef.value = noSerialize([]);

			const entries = Object.values(locations).flatMap((iatas) => Object.entries(iatas));
			const seenIatas = new Set<string>();

			entries.forEach(([iataCode, { latitude, longitude, municipality, country }]) => {
				if (!latitude || !longitude) return;
				const normalizedIata = iataCode.toUpperCase();
				if (seenIatas.has(normalizedIata)) return;
				seenIatas.add(normalizedIata);

				const lat = Number(latitude);
				const lng = Number(longitude);
				if (Number.isNaN(lat) || Number.isNaN(lng)) return;

				const popupContent = `<div key="popup-${normalizedIata}">
					<div class="mb-2 text-lg font-bold">${normalizedIata}</div>
					<div class="mb-1 text-sm">
						<strong>Location:</strong> ${[municipality, country].filter(Boolean).join(', ')}
					</div>
				</div>`;

				const mapMarker = marker([lat, lng], {
					icon: divIcon({
						html: '<div class="h-3.5 w-8 cursor-pointer bg-[url(/images/cf-pin.svg)] bg-contain bg-no-repeat"></div>',
						iconSize: [32, 14],
						className: '',
					}),
				}).addTo(mapRef.value!);

				mapMarker.bindPopup(popupContent);

				markersRef.value = noSerialize([...(markersRef.value ?? []), mapMarker]);
			});
		}
	});

	// Debounce map fitting
	// eslint-disable-next-line @typescript-eslint/unbound-method
	useVisibleTask$(({ track, cleanup }) => {
		track(() => mapRef.value);
		track(() => debouncedLocations.value);

		if (mapRef.value && mapDiv.value) {
			function fitMapBounds(bounds: LatLngBounds) {
				if (mapRef.value && !userHasZoomed.value) {
					isAutoFitting.value = true;
					mapRef.value.fitBounds(bounds, {
						padding: [20, 20],
						maxZoom: 19,
					});
				}
			}

			const entries = Object.values(debouncedLocations.value).flatMap((iatas) => Object.entries(iatas));
			const bounds = new LatLngBounds([]);
			let hasValidMarkers = false;
			const seenIatas = new Set<string>();

			entries.forEach(([iataCode, { latitude, longitude }]) => {
				if (!latitude || !longitude) return;
				const normalizedIata = iataCode.toUpperCase();
				if (seenIatas.has(normalizedIata)) return;
				seenIatas.add(normalizedIata);

				const lat = Number(latitude);
				const lng = Number(longitude);
				if (Number.isNaN(lat) || Number.isNaN(lng)) return;

				bounds.extend([lat, lng]);
				hasValidMarkers = true;
			});

			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (hasValidMarkers) fitMapBounds(bounds);

			const resizeObserver = new ResizeObserver(() => {
				if (hasValidMarkers) fitMapBounds(bounds);
			});

			resizeObserver.observe(mapDiv.value);

			cleanup(() => resizeObserver.disconnect());
		}
	});

	return <div ref={mapDiv} class="h-full w-full"></div>;
});
