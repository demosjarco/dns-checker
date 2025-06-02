import { component$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
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
		<div class="flex min-h-screen flex-col bg-gradient-to-b from-[#FAAD3F] to-[#F48120] dark:from-[#5D52C0] dark:to-[#7F20DF]">
			<header>
				<RecordSearch />
			</header>
			<main class="flex flex-1">
				<section>Hello world</section>
				<aside class="grow">
					<Map />
				</aside>
			</main>
			<footer class="border-t border-black/12 bg-white/22 py-4 text-center text-sm text-black/80 dark:border-white/33 dark:bg-black/22 dark:text-white/80">
				<a target="_blank" href={`https://github.com/demosjarco/dns-checker/commit/${gitHash.value ?? 'production'}`}>
					Built: {buildInfo.value.timestamp ? <time dateTime={new Date(buildInfo.value.timestamp).toISOString()}>{new Date(buildInfo.value.timestamp).toLocaleString()}</time> : 'N/A'}
				</a>
			</footer>
		</div>
	);
});
