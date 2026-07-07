import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiOrigin = process.env.LLM_WIKI_AGENT_API_ORIGIN || "http://localhost:8787";
const disableHmr = process.env.LLM_WIKI_AGENT_DISABLE_HMR === "1";

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": resolve(import.meta.dirname, "./src"),
		},
	},
	server: {
		// 用 5180 避开 Vite 默认 5173（其他项目可能占用）；strictPort 让冲突时直接报错，避免静默漂移
		port: 5180,
		strictPort: true,
		hmr: disableHmr ? false : undefined,
		proxy: {
			// dev 期同源访问后端，避免 CORS；生产由后端/Tauri 直接服务前端
			"/api": {
				target: apiOrigin,
				changeOrigin: true,
			},
		},
	},
});
