import { component$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import InstanceTable from '~/components/instance-table';
import Map from '~/components/map';
import RecordSearch from '~/components/record-search';
import { useGitHash, useWorkerMetadata } from '~/routes/layout';

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
	const gitHash = useGitHash();
	const buildInfo = useWorkerMetadata();

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
				<a target="_blank" href={`https://github.com/demosjarco/dns-checker/commit/${gitHash.value ?? 'production'}`}>
					Built: {buildInfo.value.timestamp ? <time dateTime={new Date(buildInfo.value.timestamp).toISOString()}>{new Date(buildInfo.value.timestamp).toLocaleString()}</time> : 'N/A'}
				</a>
			</footer>
		</div>
	);
});
