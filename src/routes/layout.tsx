import { component$, Slot, useContextProvider, useStore } from '@builder.io/qwik';
import type { RequestHandler } from '@builder.io/qwik-city';
import { LocationsContext } from '~/context';

export const onGet: RequestHandler = ({ cacheControl }) => {
	// Control caching for this request for best performance and to reduce hosting costs:
	// https://qwik.dev/docs/caching/
	cacheControl({
		// Always serve a cached response by default, up to a week stale
		staleWhileRevalidate: 60 * 60 * 24 * 7,
		// Max once every 5 seconds, revalidate on the server to get a fresh version of this page
		maxAge: 5,
	});
};

export default component$(() => {
	useContextProvider(LocationsContext, useStore({}, { deep: true }));

	return <Slot />;
});
