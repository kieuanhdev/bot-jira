import { randomBytes } from "crypto";

/** Generate a short, sortable correlation id for tracing a chat command end to end. */
export function newCorrelationId(): string {
  return `cc_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}
