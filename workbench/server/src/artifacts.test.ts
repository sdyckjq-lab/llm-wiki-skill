import assert from "node:assert/strict";
import test from "node:test";

import { ArtifactIdSchema } from "@llm-wiki/workbench-contracts";

import { isValidArtifactId } from "./artifacts.js";

test("artifact service 与共享 schema 接受完全相同的编号范围", () => {
	for (const id of [
		"11111111-1111-4111-8111-111111111111",
		"11111111-1111-1111-8111-111111111111",
		"not-an-id",
	]) {
		assert.equal(isValidArtifactId(id), ArtifactIdSchema.safeParse(id).success, id);
	}
});
