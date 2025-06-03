import { component$ } from '@builder.io/qwik';
import { useLocationTesterInstances } from '~/routes/layout';

export default component$(() => {
	const instances = useLocationTesterInstances();

	return <></>;
});
