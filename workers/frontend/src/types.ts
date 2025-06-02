export interface EnvVars extends Secrets, Env {
	GIT_HASH: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface Secrets {}
