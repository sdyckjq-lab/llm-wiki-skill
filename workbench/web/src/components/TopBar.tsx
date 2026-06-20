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
import React from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import type { KnowledgeBaseInfo, ModelInfo } from "../lib/api";
import type { ThemeMode } from "../lib/appearance";
import { cn } from "../lib/utils";

interface TopBarProps {
	knowledgeBase: KnowledgeBaseInfo | null;
	model: ModelInfo | null;
	theme: ThemeMode;
	appearanceOpen?: boolean;
	searchDisabled?: boolean;
	modelDisabled?: boolean;
	newConversationDisabled?: boolean;
	onSearch: () => void;
	onOpenModelSelector: () => void;
	onNewConversation: () => void;
	onToggleTheme: () => void;
	onOpenAppearance: () => void;
}

export function TopBar({
	knowledgeBase,
	model,
	theme,
	appearanceOpen = false,
	searchDisabled = false,
	modelDisabled = false,
	newConversationDisabled = false,
	onSearch,
	onOpenModelSelector,
	onNewConversation,
	onToggleTheme,
	onOpenAppearance,
}: TopBarProps) {
	const kbLabel = knowledgeBase?.name ?? "未选择知识库";
	const modelLabel = model ? `${model.provider}/${model.id}` : "沿用默认模型";
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

				<TopBarHint label="切换主对话模型">
					<button
						type="button"
						className="topbar-model"
						onClick={onOpenModelSelector}
						disabled={modelDisabled}
						aria-label="切换主对话模型"
					>
						<Bot />
						<span>{modelLabel}</span>
						<ChevronDown />
					</button>
				</TopBarHint>

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

function TopBarHint({ label, children }: { label: string; children: React.ReactElement }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
