import type { ModelInfo, ModelRef } from "./api";

export function modelRefToValue(ref?: ModelRef | null): string {
	return ref ? `${ref.provider}/${ref.modelId}` : "";
}

export function modelInfoToValue(model?: ModelInfo | null): string {
	return model ? `${model.provider}/${model.id}` : "";
}

export function valueToModelRef(value: string): ModelRef | null {
	const [provider, ...rest] = value.split("/");
	const modelId = rest.join("/");
	if (!provider || !modelId) return null;
	return { provider, modelId };
}

export function modelValueLabel(value: string, fallback = "沿用默认模型"): string {
	return value || fallback;
}
