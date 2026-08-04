import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

export const ATLAS_PROVIDER_ID = "atlas";
export const ATLAS_DEFAULT_MODEL = "deepseek-ai/deepseek-v4-pro";
export const ATLAS_BASE_URL = "https://api.atlascloud.ai/v1";

export function registerAtlasProvider(
  registry: Pick<ModelRegistry, "registerProvider">,
): void {
  registry.registerProvider(ATLAS_PROVIDER_ID, {
    name: "Atlas Cloud",
    baseUrl: ATLAS_BASE_URL,
    apiKey: "$ATLASCLOUD_API_KEY",
    api: "openai-completions",
    models: [
      {
        id: ATLAS_DEFAULT_MODEL,
        name: "DeepSeek V4 Pro",
        reasoning: true,
        input: ["text"],
        cost: { input: 1.68, output: 3.38, cacheRead: 0.13, cacheWrite: 0 },
        contextWindow: 1_048_576,
        maxTokens: 393_216,
      },
    ],
  });
}
