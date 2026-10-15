import { NextResponse } from "next/server";

export type ReadJsonBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

export interface ReadJsonBodyOptions {
  /** Maximum allowed request body size in bytes. Defaults to 64 KB (65,536 bytes). */
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 64 * 1024; // 64 KB default

/**
 * Safely parse a JSON request body with size bounds and runtime type guarding.
 * Returns either `{ ok: true, data }` or `{ ok: false, response }` with status 400.
 */
export async function readJsonBody<T>(
  req: Request,
  guard: (v: unknown) => v is T,
  opts?: ReadJsonBodyOptions
): Promise<ReadJsonBodyResult<T>> {
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

  // 3. Reject empty body
  if (!rawText.trim()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid_json" }, { status: 400 }),
    };
  }

  // 4. Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid_json" }, { status: 400 }),
    };
  }

  // 5. Apply type guard
  if (!guard(parsed)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid_body" }, { status: 400 }),
    };
  }

  return {
    ok: true,
    data: parsed,
  };
}
