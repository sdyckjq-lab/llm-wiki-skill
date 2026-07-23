const CONTROL_OR_UNSAFE = /[\u0000-\u001f\u007f-\u009f<>:"/\\|?*]/u;
const RESERVED_STEM = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu;

/**
 * @typedef {"empty_name" | "leading_or_trailing_space" | "illegal_character" | "trailing_dot_or_space" | "obsidian_breaking_token" | "windows_reserved_name"} GraphRenameFilenameSyntaxReason
 */

/**
 * @typedef {{ ok: true, normalized_name: string } | { ok: false, reason: GraphRenameFilenameSyntaxReason }} GraphRenameFilenameSyntaxResult
 */

/**
 * @param {string} input
 * @returns {GraphRenameFilenameSyntaxResult}
 */
export function validateGraphRenameFilenameSyntax(input) {
	const rawName = String(input ?? "");
	if (!rawName) return { ok: false, reason: "empty_name" };
	if (rawName !== rawName.trim()) return { ok: false, reason: "leading_or_trailing_space" };

	const withoutMarkdownExtension = /\.md$/iu.test(rawName)
		? rawName.slice(0, -3)
		: rawName;
	if (!withoutMarkdownExtension || withoutMarkdownExtension === "." || withoutMarkdownExtension === "..") {
		return { ok: false, reason: "empty_name" };
	}

	const normalizedName = `${withoutMarkdownExtension}.md`;
	if (CONTROL_OR_UNSAFE.test(normalizedName)) return { ok: false, reason: "illegal_character" };
	if (/[ .]$/u.test(withoutMarkdownExtension)) return { ok: false, reason: "trailing_dot_or_space" };
	if (
		/[#|^]/u.test(normalizedName)
		|| normalizedName.includes("[[")
		|| normalizedName.includes("]]")
		|| normalizedName.includes("%%")
	) {
		return { ok: false, reason: "obsidian_breaking_token" };
	}

	const deviceStem = withoutMarkdownExtension.split(".", 1)[0] ?? "";
	if (RESERVED_STEM.test(deviceStem)) return { ok: false, reason: "windows_reserved_name" };

	return { ok: true, normalized_name: normalizedName };
}

/**
 * @param {string} input
 * @returns {string}
 */
export function normalizeGraphRenameFilename(input) {
	const result = validateGraphRenameFilenameSyntax(input);
	if (!result.ok) {
		throw Object.assign(new Error(`invalid graph rename filename: ${result.reason}`), {
			code: "INVALID_REQUEST",
			reason: result.reason,
		});
	}
	return result.normalized_name;
}
