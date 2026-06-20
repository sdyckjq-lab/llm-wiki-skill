import {
	BookOpen,
	Bot,
	CheckCircle2,
	ChevronDown,
	Moon,
	Plus,
	Search,
	Settings2,
	Sun,
	XCircle,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import {
	fetchAvailableModels,
	getConfig,
	setConfig,
	type AvailableModelInfo,
	type KnowledgeBaseInfo,
	type ModelInfo,
} from "../lib/api";
import type { ThemeMode } from "../lib/appearance";
import { modelInfoToValue, modelRefToValue, modelValueLabel, valueToModelRef } from "../lib/model-roles";
import { cn } from "../lib/utils";
import type { ChatStatusSnapshot, GraphStatusSnapshot } from "../lib/view-status";

interface TopBarProps {
	knowledgeBase: KnowledgeBaseInfo | null;
	model: ModelInfo | null;
	theme: ThemeMode;
	chatStatus?: ChatStatusSnapshot;
	graphStatus?: GraphStatusSnapshot;
	appearanceOpen?: boolean;
	searchDisabled?: boolean;
	modelDisabled?: boolean;
	newConversationDisabled?: boolean;
	onSearch: () => void;
	onConfigChanged?: () => void;
	onNewConversation: () => void;
	onToggleTheme: () => void;
	onOpenAppearance: () => void;
}

export function TopBar({
	knowledgeBase,
	model,
	theme,
	chatStatus,
	graphStatus,
	appearanceOpen = false,
	searchDisabled = false,
	modelDisabled = false,
	newConversationDisabled = false,
	onSearch,
	onConfigChanged,
	onNewConversation,
	onToggleTheme,
	onOpenAppearance,
}: TopBarProps) {
	const kbLabel = knowledgeBase?.name ?? "未选择知识库";
	const valid = knowledgeBase?.valid !== false;
	const originLabel = knowledgeBase?.origin === "external" ? "外部" : "默认";

	return (
		<header className="topbar" aria-label="全局顶栏">
			<div className="topbar-kb" aria-label="当前知识库">
				<span className={cn("topbar-kb-icon", valid ? "topbar-kb-icon-valid" : "topbar-kb-icon-invalid")}>
					<BookOpen />
				</span>
				<div className="topbar-kb-copy">
					<span className="topbar-kb-name" title={kbLabel}>
						{kbLabel}
					</span>
					<div className="topbar-kb-meta">
						{knowledgeBase && <span className="topbar-kb-badge">{originLabel}</span>}
						{knowledgeBase && (
							<span
								className={cn("topbar-kb-badge", valid ? "topbar-kb-badge-valid" : "topbar-kb-badge-invalid")}
								title={knowledgeBase.reason}
							>
								{valid ? (
									<CheckCircle2 aria-hidden="true" />
								) : (
									<XCircle aria-hidden="true" />
								)}
								{valid ? "可用" : "失效"}
							</span>
						)}
					</div>
				</div>
			</div>

			<div className="topbar-status" aria-label="运行状态">
				<TopBarStatusPill kind="chat" snapshot={chatStatus} />
				<TopBarStatusPill kind="graph" snapshot={graphStatus} />
			</div>

			<div className="topbar-actions" aria-label="全局操作">
				<TopBarHint label="搜索当前知识库">
					<button
						type="button"
						className="topbar-search"
						onClick={onSearch}
						disabled={searchDisabled || !knowledgeBase?.valid}
					>
						<Search />
						<span>搜索</span>
						<kbd>⌘K</kbd>
					</button>
				</TopBarHint>

				<TopBarModelSelector
					currentModel={model}
					disabled={modelDisabled}
					onConfigChanged={onConfigChanged}
				/>

				<TopBarHint label="新对话">
					<button
						type="button"
						className="topbar-icon-action topbar-text-action"
						onClick={onNewConversation}
						disabled={newConversationDisabled || !knowledgeBase?.valid}
					>
						<Plus />
						<span>新对话</span>
					</button>
				</TopBarHint>

				<TopBarHint label={theme === "dark" ? "切换浅色暖纸" : "切换夜灯主题"}>
					<button
						type="button"
						className="topbar-icon-action"
						onClick={onToggleTheme}
						aria-label={theme === "dark" ? "切换浅色暖纸" : "切换夜灯主题"}
					>
						{theme === "dark" ? <Sun /> : <Moon />}
					</button>
				</TopBarHint>

				<TopBarHint label="外观偏好">
					<button
						type="button"
						className={cn("topbar-icon-action", appearanceOpen && "topbar-icon-action-active")}
						onClick={onOpenAppearance}
						aria-label="外观偏好"
						aria-pressed={appearanceOpen}
					>
						<Settings2 />
					</button>
				</TopBarHint>
			</div>
		</header>
	);
}

function TopBarStatusPill({
	kind,
	snapshot,
}: {
	kind: "chat" | "graph";
	snapshot?: ChatStatusSnapshot | GraphStatusSnapshot;
}) {
	const label = kind === "chat"
		? chatStatusLabel(snapshot as ChatStatusSnapshot | undefined)
		: graphStatusLabel(snapshot as GraphStatusSnapshot | undefined);
	const tone = statusTone(snapshot?.status ?? "idle");
	const title = snapshot?.summary ? `${label}：${snapshot.summary}` : label;
	return (
		<span className={cn("topbar-status-pill", `topbar-status-pill-${tone}`)} title={title}>
			<span className="topbar-status-dot" aria-hidden="true" />
			<span>{label}</span>
		</span>
	);
}

function chatStatusLabel(snapshot?: ChatStatusSnapshot): string {
	if (snapshot?.status === "streaming") return "对话回复中";
	if (snapshot?.status === "error") return "对话出错";
	return "对话空闲";
}

function graphStatusLabel(snapshot?: GraphStatusSnapshot): string {
	if (snapshot?.status === "loading") return "图谱读取中";
	if (snapshot?.status === "building") return "图谱构建中";
	if (snapshot?.status === "ready") {
		if (snapshot.animation === "playing") return "图谱更新中";
		if (snapshot.animation === "queued") return "图谱待更新";
		return "图谱就绪";
	}
	if (snapshot?.status === "error") return "图谱出错";
	return "图谱空闲";
}

function statusTone(status: ChatStatusSnapshot["status"] | GraphStatusSnapshot["status"]): "idle" | "busy" | "ready" | "error" {
	if (status === "error") return "error";
	if (status === "streaming" || status === "loading" || status === "building") return "busy";
	if (status === "ready") return "ready";
	return "idle";
}

function TopBarModelSelector({
	currentModel,
	disabled = false,
	onConfigChanged,
}: {
	currentModel: ModelInfo | null;
	disabled?: boolean;
	onConfigChanged?: () => void;
}) {
	const rootRef = useRef<HTMLDivElement | null>(null);
	const [open, setOpen] = useState(false);
	const [models, setModels] = useState<AvailableModelInfo[]>([]);
	const [value, setValue] = useState("");
	const [loading, setLoading] = useState(false);
	const [savingValue, setSavingValue] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const displayedValue = value || modelInfoToValue(currentModel);
	const label = modelValueLabel(displayedValue);

	const loadModels = async () => {
		setLoading(true);
		setError(null);
		try {
			const [config, availableModels] = await Promise.all([getConfig(), fetchAvailableModels()]);
			setValue(modelRefToValue(config.modelRoles?.main));
			setModels(availableModels);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	};

	const toggleOpen = () => {
		if (open) {
			setOpen(false);
			return;
		}
		setOpen(true);
		void loadModels();
	};

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	const saveModel = async (nextValue: string) => {
		setSavingValue(nextValue);
		setError(null);
		try {
			await setConfig({ modelRoles: { main: valueToModelRef(nextValue) } });
			setValue(nextValue);
			onConfigChanged?.();
			setOpen(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setSavingValue(null);
		}
	};

	return (
		<div className="topbar-model-wrap" ref={rootRef}>
			<TopBarHint label="切换主对话模型">
				<button
					type="button"
					className={cn("topbar-model", open && "topbar-model-active")}
					onClick={toggleOpen}
					disabled={disabled}
					aria-expanded={open}
					aria-haspopup="listbox"
					aria-label={`切换主对话模型：${label}`}
				>
					<Bot />
					<span>{label}</span>
					<ChevronDown />
				</button>
			</TopBarHint>

			{open && (
				<div className="topbar-model-menu" role="listbox" aria-label="主对话模型">
					<button
						type="button"
						role="option"
						aria-selected={value === ""}
						className={cn("topbar-model-option", value === "" && "topbar-model-option-active")}
						onClick={() => saveModel("")}
						disabled={savingValue !== null}
					>
						<span>沿用 pi 默认</span>
						{savingValue === "" && <span className="topbar-model-option-note">保存中</span>}
					</button>

					{loading && <div className="topbar-model-state">加载模型中...</div>}
					{error && <div className="topbar-model-state topbar-model-state-error">{error}</div>}
					{!loading && !error && models.length === 0 && (
						<div className="topbar-model-state">暂无可选模型</div>
					)}
					{models.map((item) => {
						const optionValue = `${item.provider}/${item.modelId}`;
						const selected = optionValue === value;
						return (
							<button
								key={optionValue}
								type="button"
								role="option"
								aria-selected={selected}
								className={cn("topbar-model-option", selected && "topbar-model-option-active")}
								onClick={() => saveModel(optionValue)}
								disabled={!item.hasAuth || savingValue !== null}
								title={item.hasAuth ? item.name : "未配置认证"}
							>
								<span>{optionValue}</span>
								<span className="topbar-model-option-note">
									{savingValue === optionValue ? "保存中" : item.hasAuth ? item.name : "未配置"}
								</span>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}

function TopBarHint({ label, children }: { label: string; children: React.ReactElement }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
