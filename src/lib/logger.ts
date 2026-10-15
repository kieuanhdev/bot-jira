/**
 * Structured one-line JSON logger for server and worker code.
 *
 * Output matches the `{ level, message, ...fields }` shape the worker already
 * emitted by hand, so existing log consumers keep working.
 */
type Level = "info" | "warn" | "error";

type LogFields = Record<string, unknown> & { message: string };

function write(level: Level, fields: LogFields): void {
  console[level](JSON.stringify({ level, ...fields }));
}

export const logger = {
  info: (fields: LogFields) => write("info", fields),
  warn: (fields: LogFields) => write("warn", fields),
  error: (fields: LogFields) => write("error", fields),
};

/**
 * Log an error that is caught and intentionally not rethrown.
 * Logs at warn level with error name and message (stack is omitted to avoid leaking secrets).
 */
export function logSwallowed(
  label: string,
  error: unknown,
  context?: Record<string, unknown>
): void {
  const errorName = error instanceof Error ? error.name : "UnknownError";
  const errorMessage = error instanceof Error ? error.message : String(error);

  logger.warn({
    message: `swallowed error: ${label}`,
    errorName,
    errorMessage,
    ...context,
  });
}

