/**
 * Races a promise against a timeout duration.
 * If the promise resolves before ms, returns its result.
 * If the timeout is reached first, returns the literal "timeout".
 */
export async function withTimeout<T>(
  p: Promise<T>,
  ms: number
): Promise<T | "timeout"> {
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ms);
    if (typeof timer.unref === "function") {
      timer.unref();
    }
  });

  try {
    return await Promise.race([p, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
