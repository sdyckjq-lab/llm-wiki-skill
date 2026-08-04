import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { testOpenAICompatible } from "./auth.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("testOpenAICompatible checks the provider models endpoint with bearer auth", async () => {
  const requests: Array<{ url: string; authorization: string | null }> = [];
  globalThis.fetch = (async (input, init) => {
    const headers = new Headers(init?.headers);
    requests.push({
      url: String(input),
      authorization: headers.get("Authorization"),
    });
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }) as typeof globalThis.fetch;

  await testOpenAICompatible("https://api.atlascloud.ai/v1/", "atlas-test-key");

  assert.deepEqual(requests, [
    {
      url: "https://api.atlascloud.ai/v1/models",
      authorization: "Bearer atlas-test-key",
    },
  ]);
});

test("testOpenAICompatible redacts the key from provider errors", async () => {
  const key = "atlas-secret-test-key";
  globalThis.fetch = (async () =>
    new Response(`invalid ${key}`, {
      status: 401,
      statusText: "Unauthorized",
    })) as typeof globalThis.fetch;

  await assert.rejects(
    testOpenAICompatible("https://api.atlascloud.ai/v1", key),
    (error: Error) => {
      assert.match(error.message, /\[redacted\]/);
      assert.equal(error.message.includes(key), false);
      return true;
    },
  );
});
