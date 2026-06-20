import React, { useState } from "react";
import {
	BookOpen,
	ChevronRight,
	Download,
	MessagesSquare,
	Network,
	PanelLeftClose,
	PanelLeftOpen,
	Plus,
	RefreshCw,
	Settings,
} from "lucide-react";

import { AddExternalDialog } from "./AddExternalDialog";
import { NewWikiDialog } from "./NewWikiDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import type { ConversationInfo, KnowledgeBaseInfo } from "../lib/api";
import { cn } from "../lib/utils";

export type MainView = "chat" | "graph";

interface Props {
	knowledgeBases: KnowledgeBaseInfo[];
	currentKbPath: string | null;
	conversations: ConversationInfo[];
	currentConversationId: string | null;
	loading: boolean;
	error: string | null;
	collapsed: boolean;
	activeView: MainView;
	graphHasPendingUpdate?: boolean;
	onSelectKb: (item: KnowledgeBaseInfo) => void;
	onSelectConversation: (item: ConversationInfo) => void;
	onSelectView: (view: MainView) => void;
	onNewConversation: () => void;
	onRefresh: () => void;
	onOpenSettings?: () => void;
	onToggleCollapsed: () => void;
	onAddExternal: (path: string) => Promise<void>;
	onCreateWiki: (name: string, purpose: string) => Promise<void>;
	onStartBatchDigest?: (input: {
		kbPath: string;
		filePaths: string[];
		sourceScanId?: string;
		digestModel?: { provider: string; modelId: string } | null;
		concurrency: 1 | 3 | 5;
	}) => void;
}

export function Sidebar({
	knowledgeBases,
	currentKbPath,
	conversations,
	currentConversationId,
	loading,
	error,
	collapsed,
	activeView,
	graphHasPendingUpdate = false,
	onSelectKb,
	onSelectConversation,
	onSelectView,
	onNewConversation,
	onRefresh,
	onOpenSettings,
	onToggleCollapsed,
	onAddExternal,
	onCreateWiki,
	onStartBatchDigest,
}: Props) {
	const [dialogOpen, setDialogOpen] = useState(false);
	const [newWikiOpen, setNewWikiOpen] = useState(false);
	const [expanded, setExpanded] = useState<Set<string>>(new Set());

	const currentExpanded = currentKbPath ? expanded.has(currentKbPath) : false;
	const currentKb = knowledgeBases.find((item) => item.path === currentKbPath) ?? null;
	const toggleExpanded = (path: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	};

	const openCurrentKb = () => {
		if (!currentKb || !currentKb.valid) return;
		onSelectKb(currentKb);
		setExpanded(new Set([currentKb.path]));
	};

	if (collapsed) {
		return (
			<aside className="shell-sidebar shell-sidebar-collapsed" aria-label="折叠侧栏">
				<div className="sidebar-rail">
					<RailButton label="展开侧栏" onClick={onToggleCollapsed}>
						<PanelLeftOpen />
					</RailButton>
					<div className="sidebar-rail-separator" />
					<RailButton
						label={currentKb ? `当前知识库：${currentKb.name}` : "当前知识库"}
						onClick={openCurrentKb}
						disabled={!currentKb?.valid}
						active={Boolean(currentKb)}
					>
						<BookOpen />
					</RailButton>
					<RailButton
						label="对话"
						onClick={() => onSelectView("chat")}
						active={activeView === "chat"}
						disabled={!currentKb?.valid}
					>
						<MessagesSquare />
					</RailButton>
					<RailButton
						label="图谱"
						onClick={() => onSelectView("graph")}
						active={activeView === "graph"}
						disabled={!currentKb?.valid}
						badge={graphHasPendingUpdate}
					>
						<Network />
					</RailButton>
					<RailButton label="刷新" onClick={onRefresh} disabled={loading}>
						<RefreshCw className={cn(loading && "animate-spin")} />
					</RailButton>
					<div className="sidebar-rail-spacer" />
					<RailButton label="新建知识库" onClick={() => setNewWikiOpen(true)}>
						<Plus />
					</RailButton>
					<RailButton label="添加现有库" onClick={() => setDialogOpen(true)}>
						<Download />
					</RailButton>
					<RailButton label="设置" onClick={onOpenSettings}>
						<Settings />
					</RailButton>
				</div>
				<NewWikiDialog
					open={newWikiOpen}
					onOpenChange={setNewWikiOpen}
					onSubmit={onCreateWiki}
				/>
				<AddExternalDialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					onSubmit={onAddExternal}
					onStartBatchDigest={onStartBatchDigest}
				/>
			</aside>
		);
	}

	return (
		<aside className="shell-sidebar">
			<div className="sidebar-header">
				<div className="sidebar-brand">
					<span className="sidebar-brand-dot" />
					<span>llm-wiki-agent</span>
				</div>
				<div className="flex items-center gap-0.5">
					<button
						className="icon-btn"
						type="button"
						onClick={onToggleCollapsed}
						title="折叠侧栏"
						aria-label="折叠侧栏"
					>
						<PanelLeftClose />
					</button>
					<button className="icon-btn" type="button" onClick={onRefresh} disabled={loading} title="刷新">
						<RefreshCw className={cn(loading && "animate-spin")} />
					</button>
					<button className="icon-btn" type="button" onClick={onOpenSettings} title="设置" aria-label="设置">
						<Settings />
					</button>
				</div>
			</div>

			<div className="sidebar-body">
				{error && (
					<div className="rounded-md border border-destructive bg-destructive/10 p-2 text-xs text-destructive">
						{error}
					</div>
				)}

				<div className="main-view-switch" aria-label="主视图切换">
					<button
						type="button"
						className={cn("main-view-btn", activeView === "chat" && "main-view-btn-active")}
						onClick={() => onSelectView("chat")}
						disabled={!currentKb?.valid}
					>
						<MessagesSquare className="size-3.5" />
						<span>对话</span>
					</button>
					<button
						type="button"
						className={cn("main-view-btn", activeView === "graph" && "main-view-btn-active")}
						onClick={() => onSelectView("graph")}
						disabled={!currentKb?.valid}
						data-pending-update={graphHasPendingUpdate ? "true" : "false"}
					>
						<Network className="size-3.5" />
						<span>图谱</span>
						{graphHasPendingUpdate && <span className="graph-update-dot" aria-label="图谱有更新" />}
					</button>
				</div>

				<Section title="知识库">
					{knowledgeBases.length === 0 ? (
						<EmptyHint text="还没有知识库" />
					) : (
						knowledgeBases.map((item) => {
							const active = item.path === currentKbPath;
							const opened = active && currentExpanded;
							return (
								<div key={item.path}>
									<KbItem
										item={item}
										active={active}
										expanded={opened}
										onClick={() => {
											if (!item.valid) return;
											if (active) {
												toggleExpanded(item.path);
											} else {
												onSelectKb(item);
												setExpanded(new Set([item.path]));
											}
										}}
										onToggle={() => toggleExpanded(item.path)}
									/>
									{opened && (
										<div className="kb-children">
											<button type="button" onClick={onNewConversation} className="conv-new-btn">
												<Plus className="size-3" />
												<span>新对话</span>
											</button>
											{conversations.length === 0 ? (
												<EmptyHint text="暂无对话" />
											) : (
												conversations.map((c) => (
													<ConversationItem
														key={c.id}
														item={c}
														active={c.id === currentConversationId}
														onClick={() => onSelectConversation(c)}
													/>
												))
											)}
										</div>
									)}
								</div>
							);
						})
					)}
				</Section>
			</div>

			<div className="sidebar-footer">
				<button
					type="button"
					className="sidebar-footer-btn sidebar-footer-btn-primary"
					onClick={() => setNewWikiOpen(true)}
				>
					<Plus className="size-4" />
					<span>新建知识库</span>
				</button>
				<button
					type="button"
					className="sidebar-footer-btn"
					onClick={() => setDialogOpen(true)}
				>
					<Download className="size-4" />
					<span>添加现有库</span>
				</button>
			</div>

			<NewWikiDialog
				open={newWikiOpen}
				onOpenChange={setNewWikiOpen}
				onSubmit={onCreateWiki}
			/>
			<AddExternalDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				onSubmit={onAddExternal}
				onStartBatchDigest={onStartBatchDigest}
			/>
		</aside>
	);
}

function RailButton({
	label,
	active,
	disabled,
	badge,
	onClick,
	children,
}: {
	label: string;
	active?: boolean;
	disabled?: boolean;
	badge?: boolean;
	onClick?: () => void;
	children: React.ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					className={cn("sidebar-rail-btn", active && "sidebar-rail-btn-active")}
					onClick={onClick}
					disabled={disabled}
					aria-label={label}
				>
					{children}
					{badge && <span className="sidebar-rail-badge" />}
				</button>
			</TooltipTrigger>
			<TooltipContent side="right">
				<div className="text-xs">{label}</div>
			</TooltipContent>
		</Tooltip>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="sidebar-section-label">{title}</div>
			<div>{children}</div>
		</div>
	);
}

function EmptyHint({ text }: { text: string }) {
	return <div className="px-2 py-1 text-xs italic text-[var(--app-muted)]">{text}</div>;
}

function KbItem({
	item,
	active,
	expanded,
	onClick,
	onToggle,
}: {
	item: KnowledgeBaseInfo;
	active: boolean;
	expanded: boolean;
	onClick: () => void;
	onToggle: () => void;
}) {
	const isDisabled = !item.valid;

	const inner = (
		<div className={cn("kb-row", active && "kb-row-active", isDisabled && "kb-row-disabled")}>
			<button
				type="button"
				onClick={(event) => {
					event.stopPropagation();
					onToggle();
				}}
				disabled={isDisabled || !active}
				className={cn("kb-chevron", expanded && "kb-chevron-open")}
				aria-label="展开对话"
			>
				<ChevronRight className="size-3" />
			</button>
			<button
				type="button"
				onClick={onClick}
				disabled={isDisabled}
				className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed"
				title={item.path}
			>
				<span className="kb-name">{item.name}</span>
			</button>
			{!item.valid ? (
				<span className="kb-badge kb-badge-invalid">不可用</span>
			) : item.origin === "external" ? (
				<span className="kb-badge kb-badge-external">外部</span>
			) : (
				<span className="kb-badge">默认</span>
			)}
		</div>
	);

	if (!item.valid && item.reason) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<div>{inner}</div>
				</TooltipTrigger>
				<TooltipContent side="right">
					<div className="text-xs">{item.reason}</div>
					<div className="mt-1 text-[10px] opacity-70">{item.path}</div>
				</TooltipContent>
			</Tooltip>
		);
	}

	return inner;
}

function ConversationItem({
	item,
	active,
	onClick,
}: {
	item: ConversationInfo;
	active: boolean;
	onClick: () => void;
}) {
	const time = item.modifiedAt ? new Date(item.modifiedAt) : null;
	const timeLabel = time ? `${time.getMonth() + 1}/${time.getDate()} ${pad(time.getHours())}:${pad(time.getMinutes())}` : "";
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn("conv-row", active && "conv-row-active")}
			title={item.firstMessage}
		>
			<div className="conv-title">{item.firstMessage || "（无消息）"}</div>
			{timeLabel && <div className="conv-time">{timeLabel}</div>}
		</button>
	);
}

function pad(n: number): string {
	return n < 10 ? `0${n}` : `${n}`;
}
