import { NextResponse } from "next/server";
import type { z } from "zod";

export type ReadJsonBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

export interface ReadJsonBodyOptions {
  /** Maximum allowed request body size in bytes. Defaults to 64 KB (65,536 bytes). */
  maxBytes?: number;
  /** Parse an empty body as `{}` instead of rejecting it with `invalid_json`. */
  allowEmpty?: boolean;
}

export type BodyIssue = { path: string; message: string };

const DEFAULT_MAX_BYTES = 64 * 1024; // 64 KB default

/**
 * Safely parse a JSON request body with size bounds and zod schema validation.
 * Returns either `{ ok: true, data }` or `{ ok: false, response }` with status 400.
 * A schema mismatch responds `{ error: "invalid_body", issues: BodyIssue[] }`.
 */
export async function readJsonBody<S extends z.ZodType>(
  req: Request,
  schema: S,
  opts?: ReadJsonBodyOptions
): Promise<ReadJsonBodyResult<z.output<S>>> {
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;

  // 1. Check Content-Length header if present
  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = parseInt(contentLengthHeader, 10);
    if (!Number.isNaN(contentLength) && contentLength > maxBytes) {
      return {
        ok: false,
        response: NextResponse.json({ error: "payload_too_large" }, { status: 400 }),
      };
    }
  }

  // 2. Read body safely with stream byte counting
  let rawText = "";
  try {
    if (req.body) {
      const reader = req.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            reader.cancel().catch(() => {});
            return {
              ok: false,
              response: NextResponse.json({ error: "payload_too_large" }, { status: 400 }),
            };
          }
          chunks.push(value);
        }
      }

      const merged = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      rawText = new TextDecoder().decode(merged);
    } else {
      rawText = await req.text();
      if (rawText.length > maxBytes) {
        return {
          ok: false,
          response: NextResponse.json({ error: "payload_too_large" }, { status: 400 }),
        };
      }
    }
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid_json" }, { status: 400 }),
    };
  }

  // 3. Parse JSON; an empty body is rejected unless allowEmpty is set
  let parsed: unknown;
  if (!rawText.trim()) {
    if (!opts?.allowEmpty) {
      return {
        ok: false,
        response: NextResponse.json({ error: "invalid_json" }, { status: 400 }),
      };
    }
    parsed = {};
  } else {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return {
        ok: false,
        response: NextResponse.json({ error: "invalid_json" }, { status: 400 }),
      };
    }
  }

  // 4. Validate against the schema
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues: BodyIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    }));
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid_body", issues }, { status: 400 }),
    };
  }

  return {
    ok: true,
    data: result.data,
  };
}
