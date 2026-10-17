import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai", () => ({ aiProvider: { generate: vi.fn() } }));

import { generateJson } from "./generate-json";
import { AiProviderError, AiUnavailableError } from "./errors";

function fakeProvider(...replies: (string | Error)[]) {
  const generate = vi.fn(async () => {
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return next ?? "";
  });
  return { generate };
}

const parseA = (obj: unknown) => {
  const a = (obj as { a?: unknown }).a;
  if (typeof a !== "number") throw new Error("bad shape");
  return { a };
};

describe("generateJson", () => {
  it("parses JSON wrapped in a markdown fence", async () => {
    const provider = fakeProvider('```json\n{"a":1}\n```');
    await expect(generateJson("p", parseA, { provider })).resolves.toEqual({ a: 1 });
    expect(provider.generate).toHaveBeenCalledWith("p", 30_000);
  });

  it("retries when the first reply is garbage", async () => {
    const provider = fakeProvider("not json at all", '{"a":2}');
    await expect(generateJson("p", parseA, { provider })).resolves.toEqual({ a: 2 });
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it("throws AiUnavailableError when every attempt is garbage", async () => {
    const provider = fakeProvider("garbage", "still garbage");
    await expect(generateJson("p", parseA, { provider })).rejects.toBeInstanceOf(
      AiUnavailableError
    );
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it("retries when parse throws on a wrong shape", async () => {
    const provider = fakeProvider('{"a":"x"}', '{"a":3}');
    await expect(generateJson("p", parseA, { provider })).resolves.toEqual({ a: 3 });
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable provider error (not configured)", async () => {
    const provider = fakeProvider(
      new AiProviderError("OpenAI not configured", { retryable: false }),
      '{"a":1}'
    );
    await expect(generateJson("p", parseA, { provider })).rejects.toBeInstanceOf(
      AiUnavailableError
    );
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });

  it("retries retryable provider errors such as timeouts", async () => {
    const provider = fakeProvider(
      new AiProviderError("OpenAI request failed: timeout", { retryable: true }),
      '{"a":4}'
    );
    await expect(generateJson("p", parseA, { provider })).resolves.toEqual({ a: 4 });
  });

  it("honours custom attempts and timeoutMs", async () => {
    const provider = fakeProvider("x", "y", '{"a":5}');
    await expect(
      generateJson("p", parseA, { provider, attempts: 3, timeoutMs: 1000 })
    ).resolves.toEqual({ a: 5 });
    expect(provider.generate).toHaveBeenCalledTimes(3);
    expect(provider.generate).toHaveBeenLastCalledWith("p", 1000);
  });
});
