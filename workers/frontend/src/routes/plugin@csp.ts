import { isDev } from '@builder.io/qwik';
import type { RequestHandler } from '@builder.io/qwik-city';
import { randomBytes } from 'node:crypto';

class CSPGenerator {
	private directives: Record<string, string> = {};
	/**
	 * bits / 8 = bytes
	 * @link https://w3c.github.io/webappsec-csp/#security-nonces
	 */
	private _nonce = randomBytes(256 / 8).toString('base64url');

	constructor() {
		this.setupCSP();
	}

	public get nonce(): Readonly<string> {
		return this._nonce;
	}

	private validateDomain(domain: string): boolean {
		let parsed: URL;
		// Temporarily remove wildcards for validation
		if (domain.startsWith('https://*.')) {
			parsed = new URL(domain.replace('*.', ''));
		} else {
			parsed = new URL(domain);
		}

		return ['https:', 'wss:'].includes(parsed.protocol) && parsed.hostname.length > 0;
	}

	private addSource(directive: string, all = false, none = false, self = false, data = false, blob = false, domains: string[] = [], unsafeInline = false, unsafeEval = false, nonce = false, strictDynamic = false, unsafeHashes = false): void {
		const flagsToAdd: string[] = [];
		const domainsToAdd = new Set<string>();

		if (all) flagsToAdd.push('https:');
		if (none) flagsToAdd.push("'none'");
		if (self) flagsToAdd.push("'self'");
		if (blob) flagsToAdd.push('blob:');
		if (data) flagsToAdd.push('data:');

		for (const domain of domains) {
			if (this.validateDomain(domain)) {
				const parsed = new URL(domain);
				const origin = `${parsed.protocol}//${parsed.hostname}`;
				domainsToAdd.add(origin);
			} else {
				console.log(`Invalid domain: ${domain}`);
			}
		}

		if (domainsToAdd.size > 0) {
			flagsToAdd.push(...Array.from(domainsToAdd).sort());
		}

		if (unsafeInline) flagsToAdd.push("'unsafe-inline'");
		if (unsafeEval) flagsToAdd.push("'unsafe-eval'");
		if (nonce) flagsToAdd.push(`'nonce-${this.nonce}'`);
		if (strictDynamic) flagsToAdd.push("'strict-dynamic'");
		if (unsafeHashes) flagsToAdd.push("'unsafe-hashes'");

		if (flagsToAdd.length > 0 || domainsToAdd.size > 0) {
			this.directives[directive] = flagsToAdd.join(' ');
		}
	}

	public generateCSP(): string {
		const csp: string[] = [];

		for (const [directive, value] of Object.entries(this.directives)) {
			if (value) {
				csp.push(`${directive} ${value}`);
			} else {
				csp.push(directive);
			}
		}

		return csp.join('; ');
	}

	private addDefault(
		config: Partial<{
			all: boolean;
			none: boolean;
			self: boolean;
			data: boolean;
			blob: boolean;
			domains: string[];
			unsafeInline: boolean;
			unsafeEval: boolean;
			unsafeHashes: boolean;
		}>,
	) {
		this.addSource('default-src', config.all, config.none, config.self, config.data, config.blob, config.domains, config.unsafeInline, config.unsafeEval, undefined, undefined, config.unsafeHashes);
	}
	private addScript(
		config: Partial<{
			all: boolean;
			none: boolean;
			self: boolean;
			data: boolean;
			blob: boolean;
			domains: string[];
			unsafeInline: boolean;
			unsafeEval: boolean;
			nonce: boolean;
			strictDynamic: boolean;
			unsafeHashes: boolean;
		}>,
	) {
		this.addSource('script-src', config.all, config.none, config.self, config.data, config.blob, config.domains, config.unsafeInline, config.unsafeEval, config.nonce, config.strictDynamic, config.unsafeHashes);
	}
	private addStyle(
		config: Partial<{
			all: boolean;
			none: boolean;
			self: boolean;
			data: boolean;
			blob: boolean;
			domains: string[];
			unsafeInline: boolean;
			nonce: boolean;
			unsafeHashes: boolean;
		}>,
	) {
		this.addSource('style-src', config.all, config.none, config.self, config.data, config.blob, config.domains, config.unsafeInline, config.nonce, config.unsafeHashes);
	}
	private addImage(
		config: Partial<{
			all: boolean;
			none: boolean;
			self: boolean;
			data: boolean;
			blob: boolean;
			domains: string[];
		}>,
	) {
		this.addSource('img-src', config.all, config.none, config.self, config.data, config.blob, config.domains);
	}
	private addFont(
		config: Partial<{
			all: boolean;
			none: boolean;
			self: boolean;
			data: boolean;
			domains: string[];
		}>,
	) {
		this.addSource('font-src', config.all, config.none, config.self, config.data, undefined, config.domains);
	}
	private addConnect(
		config: Partial<{
			all: boolean;
			none: boolean;
			self: boolean;
			domains: string[];
		}>,
	) {
		this.addSource('connect-src', config.all, config.none, config.self, undefined, undefined, config.domains);
	}
	private addMedia(
		config: Partial<{
			all: boolean;
			none: boolean;
			self: boolean;
			blob: boolean;
			domains: string[];
		}>,
	) {
		this.addSource('media-src', config.all, config.none, config.self, undefined, config.blob, config.domains);
	}
	private addObject(
		config: Partial<{
			all: boolean;
			none: boolean;
			self: boolean;
			blob: boolean;
			domains: string[];
		}>,
	) {
		this.addSource('object-src', config.all, config.none, config.self, undefined, config.blob, config.domains);
	}
	private addPrefetch(
		config: Partial<{
			all: boolean;
			none: boolean;
			self: boolean;
			domains: string[];
		}>,
	) {
		this.addSource('prefetch-src', config.all, config.none, config.self, undefined, undefined, config.domains);
	}
	private addChild(
		config: Partial<{
			all: boolean;
			none: boolean;
			self: boolean;
			blob: boolean;
			domains: string[];
		}>,
	) {
		this.addSource('child-src', config.all, config.none, config.self, undefined, config.blob, config.domains);
	}
	private addFrame(
		config: Partial<{
			all: boolean;
			none: boolean;
			self: boolean;
			domains: string[];
		}>,
	) {
		this.addSource('frame-src', config.all, config.none, config.self, undefined, undefined, config.domains);
	}
	private addWorker(
		config: Partial<{
			all: boolean;
			none: boolean;
			self: boolean;
			blob: boolean;
			domains: string[];
		}>,
	) {
		this.addSource('worker-src', config.all, config.none, config.self, undefined, config.blob, config.domains);
	}
	private addFrameAncestors(
		config: Partial<{
			all: boolean;
			none: boolean;
			self: boolean;
			domains: string[];
		}>,
	) {
		this.addSource('frame-ancestors', config.all, config.none, config.self, undefined, undefined, config.domains);
	}
	private addFormAction(
		config: Partial<{
			all: boolean;
			none: boolean;
			self: boolean;
			domains: string[];
		}>,
	) {
		this.addSource('form-action', config.all, config.none, config.self, undefined, undefined, config.domains);
	}
	private addUpgradeInsecureRequests() {
		this.directives['upgrade-insecure-requests'] = '';
	}
	private addBlockAllMixedContent() {
		this.directives['block-all-mixed-content'] = '';
	}

	private setupCSP() {
		this.addDefault({ self: true });
		this.addConnect({ self: true });
		this.addFrame({ self: true });
		this.addImage({ self: true, data: true });
		this.addScript({ self: true, nonce: true });
		this.addStyle({ self: true, unsafeInline: true });
		this.addUpgradeInsecureRequests();
	}
}

export const onRequest: RequestHandler = ({ url, sharedMap, headers }) => {
	if (isDev || url.hostname === 'localhost') return; // Will not return CSP headers in dev mode
	const csp = new CSPGenerator();
	sharedMap.set('@nonce', csp.nonce);
	headers.set('Content-Security-Policy', csp.generateCSP());
};
