import { component$, noSerialize, useSignal, useStyles$, useVisibleTask$ } from '@builder.io/qwik';
import { Map, tileLayer } from 'leaflet';

// @ts-expect-error types don't cover css
import leafletStyles from 'leaflet/dist/leaflet.css?inline';

export const getBoundaryBox = (map: Map) => {
	const northEast = map.getBounds().getNorthEast();
	const southWest = map.getBounds().getSouthWest();
	return `${southWest.lat},${southWest.lng},${northEast.lat},${northEast.lng}`;
};

export default component$(() => {
	const mapDiv = useSignal<HTMLDivElement>();
	const mapRef = useSignal<Map>();

	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
	useStyles$(leafletStyles);

	// eslint-disable-next-line @typescript-eslint/unbound-method, qwik/no-use-visible-task
	useVisibleTask$(({ track, cleanup }) => {
		track(() => mapDiv.value);

		cleanup(() => mapRef.value?.remove());

		if (mapDiv.value) {
			mapRef.value = noSerialize(
				new Map(mapDiv.value, {
					center: [37.780231, -122.390472],
					zoom: 14,
				}),
			);

			tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
				maxZoom: 19,
				attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
			}).addTo(mapRef.value!);
		}
	});

	return <div ref={mapDiv} class="h-full w-full"></div>;
});
