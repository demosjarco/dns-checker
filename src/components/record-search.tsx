import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik';
import { useLocation } from '@builder.io/qwik-city';
import { DNSRecordType } from '~/types';

export default component$(() => {
	const loc = useLocation();
	const windowUrl = useSignal(loc.url);

	// eslint-disable-next-line @typescript-eslint/unbound-method
	useVisibleTask$(({ track, cleanup }) => {
		const controller = new AbortController();
		cleanup(() => controller.abort());

		track(() => window.location.href);

		windowUrl.value = new URL(window.location.href);
	});

	return (
		<div class="w-full bg-gray-50 px-8 py-6 shadow-2xl dark:bg-gray-950">
			<h1 class="mb-2 text-center text-2xl font-bold text-gray-800 dark:text-gray-100">DNS Record Checker</h1>
			<p class="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
				Check DNS records for any domain or subdomain{' '}
				<a target="_blank" class="text-[#F48120] underline hover:text-[#FAAD3F] dark:text-[#5D52C0] dark:hover:text-[#7F20DF]" href="https://dns.demosjarco.dev/api/">
					API
				</a>{' '}
				<a target="_blank" class="text-[#F48120] underline hover:text-[#FAAD3F] dark:text-[#5D52C0] dark:hover:text-[#7F20DF]" href={`https://github.com/demosjarco/dns-checker/commit/${(import.meta as ImportMeta & { env?: { PUBLIC_GIT_HASH?: string } }).env?.PUBLIC_GIT_HASH ?? 'main'}`}>
					Source
				</a>
			</p>

			<form method="GET" class="flex flex-row flex-wrap items-end gap-4 md:flex-nowrap">
				<div class="flex min-w-52 flex-1 flex-col gap-2">
					<label for="domain" class="mb-2 text-sm font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-300">
						Domain or Hostname
					</label>
					<input type="text" id="domain" name="domain" placeholder="example.com" required value={windowUrl.value.searchParams.get('domain')} class="w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:border-blue-400 dark:focus:ring-blue-400" />
				</div>

				<div class="flex min-w-52 flex-1 flex-col gap-2">
					<label for="type" class="mb-2 text-sm font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-300">
						DNS Record Type
					</label>
					<select id="type" name="type" class="w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400">
						{Object.entries(DNSRecordType).map(([label, value]) => (
							<option key={value} value={value} selected={value === windowUrl.value.searchParams.get('type')}>
								{label}
							</option>
						))}
					</select>
				</div>

				<button type="submit" class="mt-6 flex-shrink-0 transform cursor-pointer rounded-lg bg-gradient-to-br from-[#FAAD3F] to-[#F48120] px-8 py-2.5 text-center text-sm font-semibold whitespace-nowrap text-white transition-all duration-200 focus:ring-4 focus:ring-orange-300 focus:outline-none md:mt-0 dark:from-[#5D52C0] dark:to-[#7F20DF] dark:focus:ring-purple-800">
					Check DNS Record
				</button>
			</form>
		</div>
	);
});
