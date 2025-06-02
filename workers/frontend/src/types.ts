export interface EnvVars extends Secrets, Env {
	GIT_HASH?: string;
	CF_ACCOUNT_ID: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface Secrets {}
