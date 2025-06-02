export interface EnvVars extends Secrets, Env {
	GIT_HASH?: string;
	CF_ACCOUNT_ID: string;
}

interface Secrets {
	CF_API_TOKEN: string;
}

export const PROBE_DB_D1_ID = 'deb65f23-6198-4911-85b8-d48810a080cc' as const;
