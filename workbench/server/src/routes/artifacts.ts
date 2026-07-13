import { readFile } from "node:fs/promises";

import { Hono } from "hono";
import { z } from "zod";

import {
	ArtifactIdSchema,
	ArtifactListDataSchema,
	ArtifactListQuerySchema,
	ArtifactManifestDataSchema,
	type ArtifactManifest,
} from "@llm-wiki/workbench-contracts";

import {
	getArtifact,
	listArtifacts,
	resolveArtifactFile,
} from "../artifacts.js";
import { HttpContractError, parseValidatedInput } from "../http/request.js";
import { jsonOk } from "../http/response.js";

export interface ArtifactFileData {
	body: Uint8Array;
	mimeType: string;
	sizeBytes: number;
}

export interface ArtifactRouteService {
	listArtifacts: (conversationId?: string) => ArtifactManifest[];
	getArtifact: (id: string) => ArtifactManifest | null;
	readArtifactFile: (
		id: string,
		filename: string,
	) => Promise<ArtifactFileData | null>;
}

export const defaultArtifactRouteService: ArtifactRouteService = {
	listArtifacts,
	getArtifact,
	readArtifactFile: async (id, filename) => {
		const manifest = getArtifact(id);
		if (!manifest || !manifest.files.some((file) => file.name === filename)) {
			return null;
		}
		const file = resolveArtifactFile(id, filename);
		return {
			body: await readFile(file.path),
			mimeType: file.mimeType,
			sizeBytes: file.sizeBytes,
		};
	},
};

const ArtifactFilenameSchema = z
	.string()
	.min(1)
	.refine(
		(filename) =>
			!filename.includes("/") &&
			!filename.includes("\\") &&
			!filename.includes(".."),
		{ message: "文件名不安全" },
	);

export function createArtifactRoutes(service: ArtifactRouteService): Hono {
	const router = new Hono();

	router.get("/artifacts", (c) => {
		const query = parseValidatedInput(ArtifactListQuerySchema, {
			conversation: c.req.query("conversation"),
		});
		return jsonOk(
			c,
			ArtifactListDataSchema.parse(service.listArtifacts(query.conversation)),
		);
	});

	router.get("/artifacts/:id", (c) => {
		const id = parseValidatedInput(ArtifactIdSchema, c.req.param("id"));
		const manifest = service.getArtifact(id);
		if (!manifest) {
			throw new HttpContractError("NOT_FOUND", "产物不存在");
		}
		return jsonOk(c, ArtifactManifestDataSchema.parse(manifest));
	});

	router.get("/artifacts/:id/files/:filename", async (c) => {
		const id = parseValidatedInput(ArtifactIdSchema, c.req.param("id"));
		const filename = parseValidatedInput(
			ArtifactFilenameSchema,
			c.req.param("filename"),
		);
		let file: ArtifactFileData | null;
		try {
			file = await service.readArtifactFile(id, filename);
		} catch (err) {
			if ((err as { code?: unknown }).code === "ENOENT") {
				throw new HttpContractError("NOT_FOUND", "产物文件不存在");
			}
			throw err;
		}
		if (!file) {
			throw new HttpContractError("NOT_FOUND", "产物文件不存在");
		}
		return new Response(file.body, {
			headers: {
				"Content-Type": file.mimeType,
				"Content-Length": String(file.sizeBytes),
				"Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
			},
		});
	});

	return router;
}
