import { useEffect, useMemo, useRef, useState } from "react";
import {
	validateGraphRenameFilenameSyntax,
	type GraphRenameFilenameSyntaxReason,
	type GraphRenameApplyBody,
	type GraphRenameApplyData,
	type GraphRenameOperationData,
	type GraphRenamePreviewData,
	type GraphRenameRecoveryBody,
	type GraphRenameRecoveryData,
} from "@llm-wiki/workbench-contracts";

import { Button } from "./ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import {
	applyGraphRename,
	getGraphRenameRecovery,
	previewGraphRename,
	resolveGraphRenameRecovery,
} from "../lib/api/graph-renames";

export interface GraphRenameDialogApi {
	previewGraphRename: (kbPath: string, sourcePath: string, newName: string) => Promise<GraphRenamePreviewData>;
	applyGraphRename: (kbPath: string, request: GraphRenameApplyBody) => Promise<GraphRenameApplyData>;
	getGraphRenameRecovery: (kbPath: string) => Promise<GraphRenameRecoveryData>;
	resolveGraphRenameRecovery: (kbPath: string, request: GraphRenameRecoveryBody) => Promise<GraphRenameRecoveryData>;
}

const DEFAULT_API: GraphRenameDialogApi = {
	previewGraphRename,
	applyGraphRename,
	getGraphRenameRecovery,
	resolveGraphRenameRecovery,
};

interface Props {
	open: boolean;
	kbPath: string;
	sourcePath?: string;
	candidatePaths?: string[];
	recovery?: GraphRenameRecoveryData | null;
	onOpenChange: (open: boolean) => void;
	onRecoveryChange?: () => Promise<GraphRenameRecoveryData | null>;
	onOperationTerminal?: () => void;
	onRetryGraph?: () => Promise<void> | void;
	api?: GraphRenameDialogApi;
}

type Mode =
	| "choose-source"
	| "edit-name"
	| "loading-preview"
	| "review-preview"
	| "applying"
	| "committed"
	| "rolled-back"
	| "stale"
	| "rebuild-required"
	| "recovery-required"
	| "recovery-resolving"
	| "recovery-read-failed"
	| "recovery-blocked"
	| "recovery-terminal";

export function GraphRenameDialog({
	...props
}: Props) {
	const identity = [
		props.kbPath,
		props.sourcePath ?? "warning",
		props.candidatePaths?.join("\0") ?? "",
	].join("|");
	return <GraphRenameDialogState key={identity} {...props} />;
}

function GraphRenameDialogState({
	open,
	kbPath,
	sourcePath,
	candidatePaths = [],
	recovery = null,
	onOpenChange,
	onRecoveryChange: _onRecoveryChange,
	onOperationTerminal: _onOperationTerminal,
	onRetryGraph: _onRetryGraph,
	api = DEFAULT_API,
}: Props) {
	const candidates = useMemo(() => [...new Set(candidatePaths)], [candidatePaths]);
	const [mode, setMode] = useState<Mode>(() => initialMode(recovery, sourcePath, candidates.length));
	const [selectedSource, setSelectedSource] = useState(sourcePath ?? "");
	const [newName, setNewName] = useState(() => defaultNewName(sourcePath));
	const [preview, setPreview] = useState<GraphRenamePreviewData | null>(null);
	const [resolutions, setResolutions] = useState<Record<string, string>>({});
	const [confirmed, setConfirmed] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [operation, setOperation] = useState<GraphRenameOperationData | null>(() => (
		recovery && "operation" in recovery ? recovery.operation : null
	));
	const operationRef = useRef(operation);
	const [activeRecovery, setActiveRecovery] = useState<GraphRenameRecoveryData | null>(recovery);
	const [recoveryAction, setRecoveryAction] = useState<"finish_commit" | "finish_rollback" | null>(null);
	const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
	const [rebuildRetrying, setRebuildRetrying] = useState(false);
	const applyInFlightRef = useRef(false);
	const returnFocusRef = useRef<HTMLElement | null>(
		typeof document !== "undefined" && document.activeElement instanceof HTMLElement
			? document.activeElement
			: null,
	);

	const filenameError = mode === "edit-name" ? validateRenameFilename(newName) : null;
	const previewReady = preview !== null
		&& preview.ambiguous_choices.every((choice) => Boolean(resolutions[choice.occurrence_id]));

	useEffect(() => {
		if (!recovery) return;
		let cancelled = false;
		queueMicrotask(() => {
			if (cancelled) return;
			setActiveRecovery(recovery);
			setRecoveryAction(null);
			if (recovery.status === "required") {
				operationRef.current = recovery.operation;
				setOperation(recovery.operation);
				setMode("recovery-required");
				return;
			}
			if (recovery.status === "rebuild_required") {
				operationRef.current = recovery.operation;
				setOperation(recovery.operation);
				setMode("rebuild-required");
				return;
			}
			if (recovery.status === "blocked") {
				setMode("recovery-blocked");
				return;
			}
			setMode((currentMode) => {
				const currentOperation = operationRef.current;
				if (
					currentMode === "rebuild-required"
					|| (currentMode === "recovery-read-failed" && currentOperation?.state === "committed")
					|| (currentMode === "applying" && currentOperation?.state === "committed")
				) return "committed";
				if (
					["recovery-required", "recovery-resolving", "recovery-read-failed", "recovery-blocked"].includes(currentMode)
					|| (currentMode === "applying" && currentOperation?.state === "conflicted")
				) {
					return "recovery-terminal";
				}
				return currentMode;
			});
		});
		return () => { cancelled = true; };
	}, [recovery]);

	const showAuthoritativeRecovery = (
		result: GraphRenameRecoveryData,
		completedOperation: GraphRenameOperationData | null,
	) => {
		setActiveRecovery(result);
		setRecoveryAction(null);
		if (result.status === "required") {
			operationRef.current = result.operation;
			setOperation(result.operation);
			setMode("recovery-required");
		} else if (result.status === "rebuild_required") {
			operationRef.current = result.operation;
			setOperation(result.operation);
			setMode("rebuild-required");
		} else if (result.status === "blocked") {
			setMode("recovery-blocked");
		} else if (completedOperation?.state === "committed") {
			setMode("committed");
		} else {
			setMode("recovery-terminal");
		}
	};

	const readAuthoritativeRecovery = async () => (
		_onRecoveryChange
			? _onRecoveryChange()
			: api.getGraphRenameRecovery(kbPath)
	);

	const retryAuthoritativeRecovery = async () => {
		if (applyInFlightRef.current) return;
		applyInFlightRef.current = true;
		setRecoveryMessage(null);
		try {
			const recoveryData = await readAuthoritativeRecovery();
			if (recoveryData) {
				showAuthoritativeRecovery(recoveryData, operationRef.current);
				return;
			}
			setRecoveryMessage("恢复状态正在重新同步，请稍后重试。");
			setMode("recovery-read-failed");
		} catch (cause) {
			setRecoveryMessage(cause instanceof Error ? cause.message : "恢复状态读取失败，请重试");
			setMode("recovery-read-failed");
		} finally {
			applyInFlightRef.current = false;
		}
	};

	const retryGraph = async () => {
		if (!_onRetryGraph || applyInFlightRef.current) return;
		applyInFlightRef.current = true;
		setRebuildRetrying(true);
		setRecoveryMessage(null);
		try {
			await _onRetryGraph();
		} catch (cause) {
			setRecoveryMessage(cause instanceof Error ? cause.message : "图谱更新失败，请重试");
			setMode("rebuild-required");
		} finally {
			applyInFlightRef.current = false;
			setRebuildRetrying(false);
		}
	};

	const loadPreview = async () => {
		if (!selectedSource || validateRenameFilename(newName)) return;
		setMode("loading-preview");
		setError(null);
		try {
			const result = await api.previewGraphRename(kbPath, selectedSource, newName);
			setPreview(result);
			setResolutions({});
			setConfirmed(false);
			setMode("review-preview");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "预览生成失败，请重试");
			setMode("edit-name");
		}
	};

	const applyPreview = async () => {
		if (!preview || !previewReady || !confirmed || applyInFlightRef.current) return;
		applyInFlightRef.current = true;
		setMode("applying");
		setError(null);
		const request: GraphRenameApplyBody = {
			operation_id: preview.operation_id,
			expires_at: preview.expires_at,
			source_path: preview.source_path,
			new_name: newName,
			preview_digest: preview.preview_digest,
			resolutions: preview.ambiguous_choices.map((choice) => ({
				occurrence_id: choice.occurrence_id,
				target_path: resolutions[choice.occurrence_id]!,
			})),
			confirmed: true,
		};
		try {
			const result = await api.applyGraphRename(kbPath, request);
			if (result.outcome === "preview_stale") {
				setError(result.reason);
				setMode("stale");
				return;
			}
			operationRef.current = result.operation;
			setOperation(result.operation);
			if (result.operation.state === "conflicted") {
				try {
					const recoveryData = await readAuthoritativeRecovery();
					if (recoveryData) showAuthoritativeRecovery(recoveryData, result.operation);
				} catch (cause) {
					setRecoveryMessage(cause instanceof Error ? cause.message : "恢复状态读取失败，请重试");
					setMode("recovery-read-failed");
				}
				return;
			}
			if (result.operation.state === "rolled_back") {
				setMode("rolled-back");
				return;
			}
			if (result.operation.state === "committed" && result.operation.graph_rebuild === "succeeded") {
				setMode("committed");
				return;
			}
			if (result.operation.state === "committed") {
				try {
					const recoveryData = await readAuthoritativeRecovery();
					if (recoveryData) showAuthoritativeRecovery(recoveryData, result.operation);
				} catch (cause) {
					setRecoveryMessage(cause instanceof Error ? cause.message : "恢复状态读取失败，请重试更新图谱");
					setMode("recovery-read-failed");
				}
				return;
			}
			setError("改名尚未完成，请按恢复提示继续处理");
			setMode("review-preview");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "改名失败，请重试");
			setMode("review-preview");
		} finally {
			applyInFlightRef.current = false;
		}
	};

	const resolveRecovery = async () => {
		if (activeRecovery?.status !== "required" || !recoveryAction || applyInFlightRef.current) return;
		applyInFlightRef.current = true;
		setMode("recovery-resolving");
		setRecoveryMessage(null);
		try {
			const result = await api.resolveGraphRenameRecovery(kbPath, {
				operation_id: activeRecovery.operation.operation_id,
				action: recoveryAction,
				observed_conflicts: activeRecovery.operation.conflicts.map((conflict) => (
					conflict.current_state === "present"
						? {
							source_path: conflict.source_path,
							current_state: "present" as const,
							current_sha256: conflict.current_sha256,
						}
						: {
							source_path: conflict.source_path,
							current_state: "missing" as const,
						}
				)),
			});
			const authoritative = _onRecoveryChange ? await _onRecoveryChange() : result;
			if (!authoritative) {
				setRecoveryMessage("恢复状态正在重新同步，请稍后重试。");
				setMode("recovery-required");
				return;
			}
			showAuthoritativeRecovery(authoritative, "operation" in authoritative ? authoritative.operation : operation);
			if (authoritative.status === "required") {
				setRecoveryMessage("冲突集合已变化，已刷新为当前完整状态。请重新核对后确认。");
			}
		} catch (cause) {
			setRecoveryMessage(cause instanceof Error ? cause.message : "恢复失败，请重新核对后重试");
			setMode("recovery-required");
		} finally {
			applyInFlightRef.current = false;
		}
	};

	const dismissible = !["applying", "rolled-back", "rebuild-required", "recovery-required", "recovery-resolving", "recovery-read-failed"].includes(mode);
	const requestOpenChange = (nextOpen: boolean) => {
		if (!nextOpen && !dismissible) return;
		onOpenChange(nextOpen);
		if (!nextOpen) {
			queueMicrotask(() => returnFocusRef.current?.focus());
		}
	};

	return (
		<Dialog open={open} onOpenChange={requestOpenChange}>
			<DialogContent className="dialog-surface graph-rename-dialog" showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>安全改名</DialogTitle>
					<DialogDescription>
						先预览所有受影响链接，再决定是否写入知识库。
					</DialogDescription>
				</DialogHeader>

				{mode === "choose-source" ? (
					<section className="graph-rename-step" aria-labelledby="graph-rename-source-title">
						<h3 id="graph-rename-source-title">先选择要改名的页面</h3>
						<div className="graph-rename-choice-list" role="radiogroup" aria-label="要改名的页面">
							{candidates.map((candidate) => (
								<label key={candidate}>
									<input
										type="radio"
										name="graph-rename-source"
										value={candidate}
										checked={selectedSource === candidate}
										onChange={() => setSelectedSource(candidate)}
									/>
									<code>{candidate}</code>
								</label>
							))}
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => requestOpenChange(false)}>取消</Button>
							<Button
								type="button"
								disabled={!selectedSource}
								onClick={() => {
									setNewName(defaultNewName(selectedSource));
									setMode("edit-name");
								}}
							>
								下一步
							</Button>
						</DialogFooter>
					</section>
				) : mode === "edit-name" ? (
					<section className="graph-rename-step" aria-labelledby="graph-rename-name-title">
						<h3 id="graph-rename-name-title">输入新文件名</h3>
						<p className="graph-rename-source-path"><span>当前页面</span><code>{selectedSource}</code></p>
						<label className="graph-rename-field">
							<span>新文件名</span>
							<Input
								aria-label="新文件名"
								value={newName}
								onChange={(event) => setNewName(event.target.value)}
								autoFocus
							/>
						</label>
						{(filenameError || error) && <p role="alert" className="graph-rename-error">{filenameError ?? error}</p>}
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => requestOpenChange(false)}>取消</Button>
							<Button type="button" disabled={Boolean(filenameError)} onClick={() => void loadPreview()}>生成预览</Button>
						</DialogFooter>
					</section>
				) : mode === "loading-preview" ? (
					<section className="graph-rename-step" aria-live="polite" aria-busy="true">
						<h3>正在生成预览</h3>
						<p>正在核对页面、链接和固定位置，不会写入文件。</p>
					</section>
				) : mode === "recovery-required" && activeRecovery?.status === "required" ? (
					<section className="graph-rename-step graph-rename-recovery" aria-labelledby="graph-rename-recovery-title">
						<h3 id="graph-rename-recovery-title">需要处理改名冲突</h3>
						<p>请核对当前完整冲突集合。确认前不会覆盖或删除任何外部内容。</p>
						{recoveryMessage && <p role="alert" className="graph-rename-error">{recoveryMessage}</p>}
						<ul className="graph-rename-conflicts">
							{activeRecovery.operation.conflicts.map((conflict, index) => (
								<li key={`${conflict.source_path}:${index}`}>
									<div className="graph-rename-conflict-heading">
										<code>{conflict.source_path}</code>
										<span>{conflict.current_state === "present" ? "当前文件存在" : "已被外部删除"}</span>
									</div>
									{conflict.preserved_variants.length > 0 && (
										<ul className="graph-rename-variants">
											{conflict.preserved_variants.map((variant) => (
												<li key={`${variant.kind}:${variant.relative_path}`}>
													<span>{variantLabel(variant.kind)}</span>
													<code>{variant.relative_path}</code>
												</li>
											))}
										</ul>
									)}
								</li>
							))}
						</ul>
						<fieldset className="graph-rename-recovery-action">
							<legend>选择恢复方式</legend>
							<label>
								<input
									type="radio"
									name="graph-rename-recovery-action"
									checked={recoveryAction === "finish_commit"}
									onChange={() => setRecoveryAction("finish_commit")}
								/>
								<span>完成提交</span>
							</label>
							<label>
								<input
									type="radio"
									name="graph-rename-recovery-action"
									checked={recoveryAction === "finish_rollback"}
									onChange={() => setRecoveryAction("finish_rollback")}
								/>
								<span>恢复原状</span>
							</label>
						</fieldset>
						<DialogFooter>
							<Button type="button" disabled={!recoveryAction} onClick={() => void resolveRecovery()}>确认恢复</Button>
						</DialogFooter>
					</section>
				) : mode === "recovery-resolving" ? (
					<section className="graph-rename-step" role="status" aria-live="polite" aria-busy="true">
						<h3>正在安全恢复</h3>
						<p>正在重新核对完整冲突集合，请不要关闭。</p>
					</section>
				) : mode === "recovery-read-failed" ? (
					<section className="graph-rename-step graph-rename-recovery" role="alert">
						<h3>恢复状态暂时无法读取</h3>
						<p>为避免覆盖服务器上的最新状态，新的改名仍保持禁用。请重新读取后继续。</p>
						{recoveryMessage && <p className="graph-rename-error">{recoveryMessage}</p>}
						<DialogFooter>
							<Button type="button" onClick={() => void retryAuthoritativeRecovery()}>重新读取恢复状态</Button>
						</DialogFooter>
					</section>
				) : mode === "applying" ? (
					<section className="graph-rename-step" role="status" aria-live="polite" aria-busy="true">
						<h3>正在安全写入</h3>
						<p>正在核对并更新知识库，请不要关闭。</p>
					</section>
				) : mode === "committed" && operation ? (
					<section className="graph-rename-step graph-rename-terminal" role="status" aria-live="polite">
						<h3>页面已安全改名</h3>
						<p><code>{operation.target_path}</code></p>
						<DialogFooter>
							<Button type="button" onClick={() => {
								_onOperationTerminal?.();
								requestOpenChange(false);
							}}>完成</Button>
						</DialogFooter>
					</section>
				) : mode === "rolled-back" && operation ? (
					<section className="graph-rename-step graph-rename-terminal" role="status" aria-live="polite">
						<h3>已恢复原状</h3>
						<p>这次改名没有保留，原页面和链接已经安全恢复。</p>
						<p><code>{operation.source_path}</code></p>
						<DialogFooter>
							<Button type="button" onClick={() => {
								_onOperationTerminal?.();
								onOpenChange(false);
								queueMicrotask(() => returnFocusRef.current?.focus());
							}}>完成</Button>
						</DialogFooter>
					</section>
				) : mode === "stale" ? (
					<section className="graph-rename-step graph-rename-stale">
						<h3>预览已失效</h3>
						<p role="alert">{error ?? "知识库内容已经变化，请重新生成预览。"}</p>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => requestOpenChange(false)}>取消</Button>
							<Button type="button" onClick={() => void loadPreview()}>重新生成预览</Button>
						</DialogFooter>
					</section>
				) : mode === "rebuild-required" && operation ? (
					<section className="graph-rename-step graph-rename-rebuild" role="status" aria-live="polite">
						<h3>内容已保存，图谱尚未更新</h3>
						<p>页面改名已经完成。重试只会更新图谱，不会再次修改知识库内容。</p>
						<p><code>{operation.target_path}</code></p>
						{recoveryMessage && <p className="graph-rename-error" role="alert">{recoveryMessage}</p>}
						<DialogFooter>
							<Button type="button" disabled={rebuildRetrying} onClick={() => void retryGraph()}>
								{rebuildRetrying ? "正在重试更新图谱" : "重试更新图谱"}
							</Button>
						</DialogFooter>
					</section>
				) : mode === "recovery-blocked" && activeRecovery?.status === "blocked" ? (
					<section className="graph-rename-step graph-rename-blocked" role="alert">
						<h3>无法自动处理这项恢复</h3>
						<p>{blockedRecoveryMessage(activeRecovery.reason)}</p>
						<p>系统没有改写任何文件。请保留知识库现状并检查操作记录。</p>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => requestOpenChange(false)}>知道了</Button>
						</DialogFooter>
					</section>
				) : mode === "recovery-terminal" && activeRecovery?.status === "clear" ? (
					<section className="graph-rename-step graph-rename-terminal" role="status" aria-live="polite">
						<h3>恢复处理完成</h3>
						<RetainedEvidenceList receipts={activeRecovery.retained_evidence_receipts} />
						<DialogFooter>
							<Button type="button" onClick={() => {
								_onOperationTerminal?.();
								requestOpenChange(false);
							}}>完成</Button>
						</DialogFooter>
					</section>
				) : preview ? (
					<section className="graph-rename-step graph-rename-review" aria-labelledby="graph-rename-review-title">
						<h3 id="graph-rename-review-title">确认影响</h3>
						<div className="graph-rename-path-change" aria-label="改名前后路径">
							<code>{preview.source_path}</code>
							<span aria-hidden="true">→</span>
							<code>{preview.target_path}</code>
						</div>
						<div className="graph-rename-summary" aria-label="改名影响摘要">
							<span>{preview.summary.editable_files} 个可编辑文件</span>
							<span>{preview.summary.editable_occurrences} 处可编辑引用</span>
							<span>{preview.summary.read_only_occurrences} 处只读引用</span>
						</div>

						{preview.editable_files.length > 0 && (
							<section className="graph-rename-impact-block" aria-label="将自动更新的文件">
								<h4>将自动更新</h4>
								<ul>{preview.editable_files.map((file) => (
									<li key={file.source_path}>
										<code>{file.source_path}</code>
										<span>{file.occurrences.length} 处</span>
									</li>
								))}</ul>
							</section>
						)}

						{preview.read_only_references.length > 0 && (
							<section className="graph-rename-impact-block graph-rename-readonly" role="note" aria-label="只读引用">
								<h4>以下引用只读，不会修改</h4>
								<ul>{preview.read_only_references.map((occurrence) => (
									<li key={occurrence.occurrence_id}><code>{occurrence.source_path}</code></li>
								))}</ul>
							</section>
						)}

						{preview.layout_change.present && (
							<p className="graph-rename-layout-note">固定位置将随页面迁移</p>
						)}

						{preview.ambiguous_choices.map((choice, index) => (
							<fieldset className="graph-rename-ambiguity" key={choice.occurrence_id}>
								<legend>歧义引用 {index + 1} · {choice.source_path}</legend>
								{choice.candidates.map((candidate) => (
									<label key={candidate.target_path}>
										<input
											type="radio"
											name={`resolution-${choice.occurrence_id}`}
											value={candidate.target_path}
											checked={resolutions[choice.occurrence_id] === candidate.target_path}
											onChange={() => setResolutions((current) => ({
												...current,
												[choice.occurrence_id]: candidate.target_path,
											}))}
										/>
										<code>{candidate.target_path}</code>
									</label>
								))}
							</fieldset>
						))}

						<label className="graph-rename-confirmation">
							<input
								type="checkbox"
								checked={confirmed}
								onChange={(event) => setConfirmed(event.target.checked)}
							/>
							<span>我已核对完整预览，并确认执行安全改名</span>
						</label>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => requestOpenChange(false)}>取消</Button>
							<Button type="button" disabled={!previewReady || !confirmed} onClick={() => void applyPreview()}>确认并改名</Button>
						</DialogFooter>
					</section>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

function defaultNewName(sourcePath: string | undefined): string {
	if (!sourcePath) return "";
	const basename = sourcePath.split("/").at(-1) ?? "";
	return basename.replace(/\.md$/i, "");
}

function initialMode(recovery: GraphRenameRecoveryData | null, sourcePath: string | undefined, candidateCount: number): Mode {
	if (recovery?.status === "required") return "recovery-required";
	if (recovery?.status === "rebuild_required") return "rebuild-required";
	if (recovery?.status === "blocked") return "recovery-blocked";
	if (recovery?.status === "clear" && !sourcePath && candidateCount === 0) return "recovery-terminal";
	return sourcePath ? "edit-name" : "choose-source";
}

function variantLabel(kind: "current" | "original" | "intended"): string {
	if (kind === "current") return "当前版本";
	if (kind === "original") return "原始版本";
	return "计划版本";
}

function blockedRecoveryMessage(reason: Extract<GraphRenameRecoveryData, { status: "blocked" }>["reason"]): string {
	if (reason === "unsafe_current_type") return "发现不安全的文件类型，恢复已停止。";
	if (reason === "invalid_journal") return "操作记录不完整或已损坏，恢复已停止。";
	return "操作记录包含无法识别的状态，恢复已停止。";
}

function RetainedEvidenceList({
	receipts,
}: {
	receipts: Extract<GraphRenameRecoveryData, { status: "clear" }>["retained_evidence_receipts"];
}) {
	if (receipts.length === 0) return <p>没有需要继续保留的冲突证据。</p>;
	return (
		<section className="graph-rename-retained-evidence" aria-label="保留的冲突证据">
			<h4>未选版本将暂时保留</h4>
			{receipts.map((receipt) => (
				<div key={receipt.operation_id}>
					<p>操作 {receipt.operation_id}</p>
					<ul>{receipt.retained_evidence.map((evidence) => (
						<li key={evidence.relative_path}>
							<code>{evidence.relative_path}</code>
							<span>摘要 {evidence.sha256}</span>
							<span>自动删除时间 {evidence.expires_at}</span>
						</li>
					))}</ul>
				</div>
			))}
		</section>
	);
}

function validateRenameFilename(input: string): string | null {
	const result = validateGraphRenameFilenameSyntax(input);
	if (result.ok === false) return filenameErrorMessage(result.reason);
	return null;
}

function filenameErrorMessage(reason: GraphRenameFilenameSyntaxReason): string {
	if (reason === "empty_name") return "请输入新文件名";
	if (reason === "trailing_dot_or_space") return "文件名不能以空格或句点结尾";
	if (reason === "obsidian_breaking_token") return "这个名称会破坏页面链接，不能使用";
	return "这个名称不能作为文件名";
}
