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
		<>
			<header>
				<RecordSearch />
			</header>
		</>
	);
});
