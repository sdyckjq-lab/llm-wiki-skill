import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";

import {
  ATLAS_BASE_URL,
  ATLAS_DEFAULT_MODEL,
  ATLAS_PROVIDER_ID,
  registerAtlasProvider,
} from "./atlas-provider.js";

test("registerAtlasProvider exposes the Atlas Cloud default model", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "llm-wiki-atlas-provider-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const authStorage = AuthStorage.create(path.join(root, "auth.json"));
  const registry = ModelRegistry.inMemory(authStorage);

  registerAtlasProvider(registry);

  const model = registry.find(ATLAS_PROVIDER_ID, ATLAS_DEFAULT_MODEL);
  assert.ok(model);
  assert.equal(model.provider, ATLAS_PROVIDER_ID);
  assert.equal(model.baseUrl, ATLAS_BASE_URL);
  assert.equal(model.api, "openai-completions");
  assert.equal(model.reasoning, true);
  assert.deepEqual(model.input, ["text"]);
  assert.equal(model.contextWindow, 1_048_576);
  assert.equal(model.maxTokens, 393_216);
  assert.deepEqual(model.cost, {
    input: 1.68,
    output: 3.38,
    cacheRead: 0.13,
    cacheWrite: 0,
  });
});
