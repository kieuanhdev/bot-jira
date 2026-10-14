/**
 * Hide credential-looking fragments in raw job and service errors before rendering in UI.
 */
export function maskSecrets(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/(token|password|bearer|auth|apiKey|secret)[=:\s]+[^\s,;]+/gi, "$1=***")
    .slice(0, 500);
}
