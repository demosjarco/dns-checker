import { component$ } from '@builder.io/qwik';
import { useLocation } from '@builder.io/qwik-city';

export default component$(() => {
	const loc = useLocation();

	// Get values from URL parameters
	const domain = loc.url.searchParams.get('domain') ?? '';
	const type = loc.url.searchParams.get('type') ?? 'A';
	const expected = loc.url.searchParams.get('expected') ?? '';

	return (
		<div class="w-full border-b border-gray-100 bg-gray-50 px-8 py-6 shadow-2xl dark:border-gray-800 dark:bg-gray-950">
			<h1 class="mb-2 text-center text-2xl font-bold text-gray-800 dark:text-gray-100">DNS Record Checker</h1>
			<p class="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">Check DNS records for any domain or subdomain</p>

			<form method="GET" class="flex flex-row flex-wrap items-end gap-4 md:flex-nowrap">
				<div class="flex min-w-52 flex-1 flex-col gap-2">
					<label for="domain" class="mb-2 text-sm font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-300">
						Domain or Hostname
					</label>
					<input type="text" id="domain" name="domain" placeholder="example.com" required value={domain} class="w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:border-blue-400 dark:focus:ring-blue-400" />
				</div>

				<div class="flex min-w-52 flex-1 flex-col gap-2">
					<label for="type" class="mb-2 text-sm font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-300">
						DNS Record Type
					</label>
					<select id="type" name="type" value={type} class="w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400">
						<option value="A">A Record (IPv4 Address)</option>
						<option value="AAAA">AAAA Record (IPv6 Address)</option>
						<option value="CNAME">CNAME Record (Canonical Name)</option>
						<option value="MX">MX Record (Mail Exchange)</option>
						<option value="TXT">TXT Record (Text)</option>
						<option value="NS">NS Record (Name Server)</option>
						<option value="SOA">SOA Record (Start of Authority)</option>
						<option value="PTR">PTR Record (Pointer)</option>
						<option value="SRV">SRV Record (Service)</option>
						<option value="CAA">CAA Record (Certificate Authority Authorization)</option>
					</select>
				</div>

				<div class="flex min-w-52 flex-1 flex-col gap-2">
					<label for="expected" class="mb-2 text-sm font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-300">
						Expected Value (Optional)
					</label>
					<input type="text" id="expected" name="expected" placeholder="Expected DNS record value" value={expected} class="w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:border-blue-400 dark:focus:ring-blue-400" />
				</div>

				<button type="submit" class="mt-6 flex-shrink-0 transform rounded-lg bg-gradient-to-br from-[#FAAD3F] to-[#F48120] px-8 py-2.5 text-center text-sm font-semibold whitespace-nowrap text-white transition-all duration-200 focus:ring-4 focus:ring-orange-300 focus:outline-none md:mt-0 dark:from-[#5D52C0] dark:to-[#7F20DF] dark:focus:ring-purple-800">
					Check DNS Record
				</button>
			</form>
		</div>
	);
});
