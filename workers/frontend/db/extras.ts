import type { LogWriter } from 'drizzle-orm/logger';

export class DebugLogWriter implements LogWriter {
	write(message: string) {
		console.debug('D1', message);
	}
}
