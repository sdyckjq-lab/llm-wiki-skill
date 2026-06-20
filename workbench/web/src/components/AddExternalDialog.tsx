import React, { useEffect, useState } from "react";

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
	type AvailableModelInfo,
	chooseDirectory,
	fetchAvailableModels,
	getConfig,
	initExistingKnowledgeBase,
	inspectKnowledgeBasePath,
	type InspectPathResult,
	type ModelRef,
} from "../lib/api";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (path: string) => Promise<void>;
	onStartBatchDigest?: (input: {
		kbPath: string;
		filePaths: string[];
		sourceScanId?: string;
		digestModel?: ModelRef | null;
		concurrency: 1 | 3 | 5;
	}) => void;
}

/**
 * 通过选择本地文件夹创建或登记知识库。
 * 用户粘绝对路径，后端验证（存在 + 是目录 + 含 .wiki-schema.md）。
 */
export function AddExternalDialog({ open, onOpenChange, onSubmit, onStartBatchDigest }: Props) {
	const [path, setPath] = useState("");
	const [purpose, setPurpose] = useState("");
	const [digestAfterInit, setDigestAfterInit] = useState(true);
	const [concurrency, setConcurrency] = useState<1 | 3 | 5>(3);
	const [models, setModels] = useState<AvailableModelInfo[]>([]);
	const [digestModel, setDigestModel] = useState("");
	const [inspect, setInspect] = useState<InspectPathResult | null>(null);
	const [inspecting, setInspecting] = useState(false);
	const [choosing, setChoosing] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [conflicts, setConflicts] = useState<string[]>([]);
	const [dragHint, setDragHint] = useState<string | null>(null);

	const reset = () => {
		setPath("");
		setPurpose("");
		setDigestAfterInit(true);
		setConcurrency(3);
		setDigestModel("");
		setInspect(null);
		setError(null);
		setConflicts([]);
		setDragHint(null);
		setChoosing(false);
		setSubmitting(false);
	};

	useEffect(() => {
		if (!open || !path.trim()) {
			const timer = window.setTimeout(() => {
				setInspect(null);
				setInspecting(false);
			}, 0);
			return () => window.clearTimeout(timer);
		}
		let cancelled = false;
		const timer = window.setTimeout(() => {
			setInspecting(true);
			setError(null);
			inspectKnowledgeBasePath(path)
				.then((result) => {
					if (!cancelled) setInspect(result);
				})
				.catch((err) => {
					if (!cancelled) {
						setInspect(null);
						setError(err instanceof Error ? err.message : String(err));
					}
				})
				.finally(() => {
					if (!cancelled) setInspecting(false);
				});
		}, 300);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [open, path]);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		Promise.all([fetchAvailableModels(), getConfig()])
			.then(([availableModels, config]) => {
				if (cancelled) return;
				setModels(availableModels);
				setDigestModel(modelRefToValue(config.modelRoles?.digest));
			})
			.catch(() => {
				if (!cancelled) setModels([]);
			});
		return () => {
			cancelled = true;
		};
	}, [open]);

	const handleSubmit = async (overwrite = false) => {
		const trimmed = path.trim();
		if (!trimmed) {
			setError("路径不能为空");
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			if (inspect?.exists && inspect.isDirectory && !inspect.hasWikiSchema) {
				if (!purpose.trim()) {
					setError("请先填写研究方向");
					setSubmitting(false);
					return;
				}
				const result = await initExistingKnowledgeBase(trimmed, purpose, overwrite);
				await onSubmit(result.info.path);
				if (
					digestAfterInit &&
					inspect.ingestibleFiles?.paths.length &&
					onStartBatchDigest
				) {
					onStartBatchDigest({
						kbPath: result.info.path,
						filePaths: inspect.ingestibleFiles.paths,
						sourceScanId: inspect.ingestibleFiles.scanId,
						digestModel: valueToModelRef(digestModel),
						concurrency,
					});
				}
			} else {
				await onSubmit(trimmed);
			}
			reset();
			onOpenChange(false);
		} catch (err) {
			const maybeConflicts = (err as Error & { conflicts?: string[] }).conflicts ?? [];
			setConflicts(maybeConflicts);
			setError(err instanceof Error ? err.message : String(err));
			setSubmitting(false);
		}
	};

	const handleOpenChange = (newOpen: boolean) => {
		if (!newOpen) reset();
		onOpenChange(newOpen);
	};

	const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		const types = Array.from(event.dataTransfer.types);
		console.info("[llm-wiki-agent] dropped external path", {
			types,
			uriList: event.dataTransfer.getData("text/uri-list"),
			text: event.dataTransfer.getData("text/plain"),
			files: event.dataTransfer.files.length,
		});
		const parsed = parseDroppedPath(event.dataTransfer);
		if (parsed) {
			setPath(parsed);
			setDragHint(null);
		} else {
			setDragHint("Chrome 没给出真实路径，请点“选择文件夹”或粘贴路径");
		}
	};

	const handleChooseDirectory = async () => {
		setChoosing(true);
		setError(null);
		setDragHint(null);
		try {
			const selectedPath = await chooseDirectory();
			if (selectedPath) setPath(selectedPath);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setChoosing(false);
		}
	};

	return (
		<React.Fragment>
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="dialog-surface w-[calc(100vw-2rem)] overflow-hidden sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>新建知识库</DialogTitle>
					<DialogDescription>
						选择一个已有文件夹；如果它还不是知识库，可以在这里初始化成新的知识库。
					</DialogDescription>
				</DialogHeader>

				<div className="min-w-0 space-y-3 py-2">
					<div
						onDragOver={(event) => event.preventDefault()}
						onDrop={handleDrop}
						className="min-w-0 rounded-md border border-dashed border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-5 text-center text-xs text-[var(--app-muted)]"
					>
						<div>把文件夹拖到这里，或直接选择文件夹</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="mt-3"
							onClick={handleChooseDirectory}
							disabled={choosing}
						>
							{choosing ? "选择中…" : "选择文件夹"}
						</Button>
					</div>
					<Input
						value={path}
						onChange={(e) => setPath(e.target.value)}
						placeholder="~/Documents/我的知识库"
						className="form-field min-w-0 font-mono text-xs"
						onKeyDown={(e) => {
							if (e.key === "Enter" && !submitting) {
								e.preventDefault();
								handleSubmit();
							}
						}}
						autoFocus
					/>
					{dragHint && <div className="text-xs text-muted-foreground">{dragHint}</div>}
					{inspecting && <div className="text-xs text-muted-foreground">检查中…</div>}
					{inspect && (
						<div className="min-w-0 overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5 text-xs text-[var(--app-muted)]">
							<div>
								{!inspect.exists
									? "路径不存在"
									: !inspect.isDirectory
										? "这不是目录"
										: inspect.hasWikiSchema
											? "这是可添加的知识库"
											: `不是知识库，可初始化；发现 ${inspect.ingestibleFiles?.count ?? 0} 个可消化文件`}
							</div>
							{inspect.ingestibleFiles?.samples.length ? (
								<ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto opacity-70">
									{inspect.ingestibleFiles.samples.slice(0, 5).map((sample) => (
										<li key={sample} className="truncate">
											{sample}
										</li>
									))}
								</ul>
							) : null}
						</div>
					)}
					{inspect?.exists && inspect.isDirectory && !inspect.hasWikiSchema && (
						<div className="min-w-0 space-y-2 rounded-md border border-[var(--app-border)] p-2">
							<Input
								value={purpose}
								onChange={(e) => setPurpose(e.target.value)}
								placeholder="这个知识库研究什么？"
								className="form-field min-w-0"
							/>
							<label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
								<span>初始化后立即批量消化</span>
								<input
									type="checkbox"
									checked={digestAfterInit}
									onChange={(e) => setDigestAfterInit(e.target.checked)}
									className="size-4 accent-[var(--app-accent)]"
								/>
							</label>
							{digestAfterInit && (
								<div className="grid min-w-0 gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
									<select
										value={concurrency}
										onChange={(e) => setConcurrency(Number(e.target.value) as 1 | 3 | 5)}
										className="form-field h-8 min-w-0 text-xs"
									>
										<option value={1}>并发 1</option>
										<option value={3}>并发 3</option>
										<option value={5}>并发 5</option>
									</select>
									<select
										value={digestModel}
										onChange={(e) => setDigestModel(e.target.value)}
										className="form-field h-8 min-w-0 text-xs"
									>
										<option value="">沿用全局消化模型</option>
										{models.map((model) => (
											<option
												key={`${model.provider}/${model.modelId}`}
												value={`${model.provider}/${model.modelId}`}
												disabled={!model.hasAuth}
											>
												{model.provider}/{model.modelId}
												{model.hasAuth ? "" : "（未配置）"}
											</option>
										))}
									</select>
								</div>
							)}
						</div>
					)}
					{conflicts.length > 0 && (
						<div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-300">
							<div>这些文件会先备份再覆盖：</div>
							<div className="mt-1 break-all">{conflicts.join(", ")}</div>
						</div>
					)}
					{error && (
						<div className="rounded-md border border-destructive bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
							{error}
						</div>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
						取消
					</Button>
					{conflicts.length > 0 ? (
						<Button onClick={() => handleSubmit(true)} disabled={submitting}>
							{submitting ? "处理中…" : "备份并继续"}
						</Button>
					) : (
						<Button onClick={() => handleSubmit(false)} disabled={submitting}>
							{submitting
								? "处理中…"
								: inspect?.exists && inspect.isDirectory && !inspect.hasWikiSchema
									? "初始化并添加"
									: "添加"}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
		</React.Fragment>
	);
}

function modelRefToValue(ref?: ModelRef | null): string {
	return ref ? `${ref.provider}/${ref.modelId}` : "";
}

function valueToModelRef(value: string): ModelRef | null {
	const [provider, ...rest] = value.split("/");
	const modelId = rest.join("/");
	if (!provider || !modelId) return null;
	return { provider, modelId };
}

function parseDroppedPath(dataTransfer: DataTransfer): string | null {
	for (const type of ["text/uri-list", "text/plain"]) {
		const raw = dataTransfer.getData(type).trim();
		if (!raw) continue;
		const first = raw
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => line && !line.startsWith("#"));
		if (!first) continue;
		if (first.startsWith("file://")) return decodeURIComponent(new URL(first).pathname);
		if (first.startsWith("/") || first.startsWith("~/")) return first;
	}
	return null;
}
