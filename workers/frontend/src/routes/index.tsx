import { component$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import RecordSearch from '~/components/record-search';

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
	return (
		<div class="flex min-h-screen flex-col bg-gradient-to-b from-[#FAAD3F] to-[#F48120] dark:from-[#5D52C0] dark:to-[#7F20DF]">
			<header>
				<RecordSearch />
			</header>
		</div>
	);
});
