import { copyFile, mkdir, open, readFile, rename, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

type AuthCredential = { type: "api_key"; key: string } | Record<string, unknown>;
type AuthData = Record<string, AuthCredential>;

const AUTH_DIR = path.join(homedir(), ".pi", "agent");
const AUTH_PATH = path.join(AUTH_DIR, "auth.json");

const ENV_KEYS = [
	"ANTHROPIC_API_KEY",
	"ATLASCLOUD_API_KEY",
	"OPENAI_API_KEY",
	"DEEPSEEK_API_KEY",
	"GOOGLE_API_KEY",
	"OPENROUTER_API_KEY",
	"XAI_API_KEY",
];

export interface AuthProviderStatus {
	id: string;
	type: string;
	configured: boolean;
}

export async function getAuthStatus() {
	const authFileExists = Boolean(await stat(AUTH_PATH).catch(() => null));
	const data = await readAuthData();
	const providers = Object.entries(data).map(([id, credential]) => ({
		id,
		type:
			credential && typeof credential === "object" && "type" in credential
				? String((credential as { type?: unknown }).type ?? "unknown")
				: "unknown",
		configured: true,
	}));
	const envKeys = ENV_KEYS.map((name) => ({ name, present: Boolean(process.env[name]) }));
	return { authFileExists, providers, envKeys };
}

async function readAuthData(): Promise<AuthData> {
	try {
		const raw = await readFile(AUTH_PATH, "utf8");
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as AuthData)
			: {};
	} catch {
		return {};
	}
}

async function writeFileAtomic(filePath: string, content: string): Promise<void> {
	const tmpPath = `${filePath}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
	const handle = await open(tmpPath, "w", 0o600);
	try {
		await handle.writeFile(content, "utf8");
		await handle.sync();
	} finally {
		await handle.close();
	}
	await rename(tmpPath, filePath);
}

export async function setAuthKey(provider: string, key: string): Promise<void> {
	const cleanProvider = provider.trim().toLowerCase();
	const cleanKey = key.trim();
	if (!cleanProvider) throw new Error("provider is required");
	if (!cleanKey) throw new Error("key is required");

	await mkdir(AUTH_DIR, { recursive: true, mode: 0o700 });
	const existing = await readAuthData();
	const existed = Boolean(await stat(AUTH_PATH).catch(() => null));
	const backupPath = `${AUTH_PATH}.bak.${Math.floor(Date.now() / 1000)}`;
	if (existed) await copyFile(AUTH_PATH, backupPath);

	const next: AuthData = {
		...existing,
		[cleanProvider]: { type: "api_key", key: cleanKey },
	};

	try {
		await writeFileAtomic(AUTH_PATH, JSON.stringify(next, null, 2) + "\n");
	} catch (err) {
		if (existed) await copyFile(backupPath, AUTH_PATH).catch(() => undefined);
		throw err;
	}
}

function redact(message: string, key: string | undefined): string {
	if (!key) return message;
	return message.split(key).join("[redacted]");
}

async function getStoredApiKey(provider: string): Promise<string | undefined> {
	const data = await readAuthData();
	const credential = data[provider];
	if (
		credential &&
		typeof credential === "object" &&
		(credential as { type?: unknown }).type === "api_key" &&
		typeof (credential as { key?: unknown }).key === "string"
	) {
		return (credential as { key: string }).key;
	}
	return undefined;
}

async function parseError(res: Response, key: string): Promise<string> {
	const raw = await res.text().catch(() => "");
	const text = raw ? `${res.status} ${res.statusText}: ${raw.slice(0, 500)}` : `${res.status} ${res.statusText}`;
	return redact(text, key);
}

async function testAnthropicLike(
	baseUrl: string,
	key: string,
	model: string,
	extraHeaders: Record<string, string> = {},
): Promise<void> {
	const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/messages`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": key,
			"anthropic-version": "2023-06-01",
			...extraHeaders,
		},
		body: JSON.stringify({
			model,
			max_tokens: 1,
			messages: [{ role: "user", content: "ping" }],
		}),
	});
	if (!res.ok) throw new Error(await parseError(res, key));
}

export async function testOpenAICompatible(baseUrl: string, key: string): Promise<void> {
	const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
		headers: { Authorization: `Bearer ${key}` },
	});
	if (!res.ok) throw new Error(await parseError(res, key));
}

export async function testAuthConnection(provider: string): Promise<{ ok: boolean; message?: string; error?: string }> {
	const cleanProvider = provider.trim().toLowerCase();
	const key = await getStoredApiKey(cleanProvider);
	if (!key) return { ok: false, error: "未找到该 provider 的已保存 key" };

	try {
		if (cleanProvider === "anthropic") {
			await testAnthropicLike("https://api.anthropic.com", key, "claude-haiku-4-5");
		} else if (cleanProvider === "atlas") {
			await testOpenAICompatible("https://api.atlascloud.ai/v1", key);
		} else if (cleanProvider === "openai") {
			await testOpenAICompatible("https://api.openai.com/v1", key);
		} else if (cleanProvider === "deepseek") {
			await testAnthropicLike("https://api.deepseek.com/anthropic", key, "deepseek-v4-flash");
		} else {
			return { ok: true, message: "已保存。该 provider 暂无内置连通测试。" };
		}
		return { ok: true, message: "连接成功，模型可用" };
	} catch (err) {
		return { ok: false, error: redact(err instanceof Error ? err.message : String(err), key) };
	}
}
