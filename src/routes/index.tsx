import { component$, useContext, useVisibleTask$ } from '@builder.io/qwik';
import { useLocation, type DocumentHead } from '@builder.io/qwik-city';
import type * as z4 from 'zod/v4';
import type { output as regionOutput } from '~/api-routes/region/[code]/index.mjs';
import type { output as instanceOutput } from '~/api-routes/region/[code]/instance/[iata]/index.mjs';
import type { output as regionsOutput } from '~/api-routes/regions/index.mjs';
import InstanceTable from '~/components/instance-table';
import Map from '~/components/map';
import RecordSearch from '~/components/record-search';
import { LocationsContext } from '~/context';

export const head: DocumentHead = {
	title: 'Welcome to Qwik',
	meta: [
		{
			name: 'description',
			content: 'Qwik site description',
		},
	],
};

export default component$(() => {
	const loc = useLocation();
	const locations = useContext(LocationsContext);

	useVisibleTask$(async ({ cleanup }) => {
		const controller = new AbortController();
		cleanup(() => controller.abort());

		await fetch(new URL('api/regions', loc.url), { signal: controller.signal })
			.then((response) => response.json<z4.output<typeof regionsOutput>>())
			.then((json) =>
				Promise.allSettled(
					json.map(async (region) => {
						locations[region] = {};

						await fetch(new URL(`api/region/${region}`, loc.url), { signal: controller.signal })
							.then((response) => response.json<z4.output<typeof regionOutput>>())
							.then((iataList) =>
								Promise.allSettled(
									iataList.map(async (iata) => {
										locations[region]![iata] = {};

										await fetch(new URL(`api/region/${region}/instance/${iata}`, loc.url), { signal: controller.signal })
											.then((response) => response.json<z4.output<typeof instanceOutput>>())
											.then((instance) => {
												//
												locations[region]![iata] = instance;
											});
									}),
								),
							);
					}),
				),
			);
	});

	return (
		<div class="flex h-screen flex-col overflow-hidden bg-gradient-to-b from-[#FAAD3F] to-[#F48120] dark:from-[#5D52C0] dark:to-[#7F20DF]">
			<header class="flex-shrink-0">
				<RecordSearch />
			</header>
			<main class="flex min-h-0 flex-1 flex-row">
				<section class="flex-shrink-0 overflow-y-auto">
					<InstanceTable />
				</section>
				<aside class="flex-1 overflow-y-auto">
					<Map />
				</aside>
			</main>
			<footer class="flex-shrink-0 border-t border-black/12 bg-white/22 py-4 text-center text-sm text-black/80 dark:border-white/33 dark:bg-black/22 dark:text-white/80">
				<a target="_blank" href={`https://github.com/demosjarco/dns-checker/commit/${(import.meta as ImportMeta & { env?: { PUBLIC_GIT_HASH?: string } }).env?.PUBLIC_GIT_HASH ?? 'main'}`}>
					Source
				</a>
			</footer>
		</div>
	);
});
