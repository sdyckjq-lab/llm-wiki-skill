import React, { useState } from "react";
import {
	BookOpen,
	MessagesSquare,
	Network,
	PanelLeftClose,
	PanelLeftOpen,
	Plus,
	Settings,
} from "lucide-react";

import { AddExternalDialog } from "./AddExternalDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import type { MainView } from "./MainViewTabs";
import type { ConversationInfo, KnowledgeBaseInfo } from "../lib/api";
import { cn } from "../lib/utils";

interface Props {
	knowledgeBases: KnowledgeBaseInfo[];
	currentKbPath: string | null;
	conversations: ConversationInfo[];
	currentConversationId: string | null;
	error: string | null;
	collapsed: boolean;
	activeView: MainView;
	graphHasPendingUpdate?: boolean;
	onSelectKb: (item: KnowledgeBaseInfo) => void;
	onSelectConversation: (item: ConversationInfo) => void;
	onSelectView: (view: MainView) => void;
	onNewConversation: () => void;
	onOpenSettings?: () => void;
	onToggleCollapsed: () => void;
	onAddExternal: (path: string) => Promise<void>;
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
	error,
	collapsed,
	activeView,
	graphHasPendingUpdate = false,
	onSelectKb,
	onSelectConversation,
	onSelectView,
	onNewConversation,
	onOpenSettings,
	onToggleCollapsed,
	onAddExternal,
	onStartBatchDigest,
}: Props) {
	const [dialogOpen, setDialogOpen] = useState(false);

	const currentKb = knowledgeBases.find((item) => item.path === currentKbPath) ?? null;

	const openCurrentKb = () => {
		if (!currentKb || !currentKb.valid) return;
		onSelectKb(currentKb);
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
						label="图谱活地图"
						onClick={() => onSelectView("graph")}
						active={activeView === "graph"}
						disabled={!currentKb?.valid}
						badge={graphHasPendingUpdate}
					>
						<Network />
					</RailButton>
					<div className="sidebar-rail-spacer" />
					<RailButton label="设置" onClick={onOpenSettings}>
						<Settings />
					</RailButton>
					<RailButton label="新建知识库" onClick={() => setDialogOpen(true)}>
						<Plus />
					</RailButton>
				</div>
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
				<button
					className="icon-btn"
					type="button"
					onClick={onToggleCollapsed}
					title="折叠侧栏"
					aria-label="折叠侧栏"
				>
					<PanelLeftClose />
				</button>
			</div>

			<div className="sidebar-body">
				{error && (
					<div className="sidebar-error rounded-md border border-destructive bg-destructive/10 p-2 text-xs text-destructive">
						{error}
					</div>
				)}

				<Section title="笔记本">
					{knowledgeBases.length === 0 ? (
						<EmptyHint text="还没有知识库" />
					) : (
						knowledgeBases.map((item) => (
							<KbItem
								key={item.path}
								item={item}
								active={item.path === currentKbPath}
								onClick={() => {
									if (item.valid) onSelectKb(item);
								}}
							/>
						))
					)}
				</Section>

				<Section
					title="会话"
					action={
						<button type="button" className="section-action" onClick={onNewConversation} aria-label="新对话">
							<Plus className="size-3" />
						</button>
					}
				>
					{conversations.length === 0 ? (
						<EmptyHint text="暂无对话" />
					) : (
						conversations.map((item) => (
							<ConversationItem
								key={item.id}
								item={item}
								active={item.id === currentConversationId}
								onClick={() => onSelectConversation(item)}
							/>
						))
					)}
				</Section>
			</div>

			<div className="sidebar-footer sidebar-footer-v2">
				<button
					type="button"
					className={cn("sidebar-footer-btn", activeView === "graph" && "sidebar-footer-btn-active")}
					onClick={() => onSelectView("graph")}
					disabled={!currentKb?.valid}
				>
					<Network className="size-4" />
					<span>图谱活地图</span>
					{graphHasPendingUpdate && <span className="graph-update-dot" aria-label="图谱有更新" />}
				</button>
				<button
					type="button"
					className="sidebar-footer-btn"
					onClick={onOpenSettings}
				>
					<Settings className="size-4" />
					<span>设置</span>
				</button>
				<button
					type="button"
					className="sidebar-footer-btn sidebar-footer-btn-primary"
					onClick={() => setDialogOpen(true)}
				>
					<Plus className="size-4" />
					<span>新建知识库</span>
				</button>
			</div>

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

function Section({
	title,
	action,
	children,
}: {
	title: string;
	action?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="sidebar-section">
			<div className="sidebar-section-head">
				<div className="sidebar-section-label">{title}</div>
				{action}
			</div>
			<div className="sidebar-section-body">{children}</div>
		</div>
	);
}

function EmptyHint({ text }: { text: string }) {
	return <div className="px-2 py-1 text-xs italic text-[var(--app-muted)]">{text}</div>;
}

function KbItem({
	item,
	active,
	onClick,
}: {
	item: KnowledgeBaseInfo;
	active: boolean;
	onClick: () => void;
}) {
	const isDisabled = !item.valid;

	const inner = (
		<button
			type="button"
			onClick={onClick}
			disabled={isDisabled}
			className={cn("kb-row", active && "kb-row-active", isDisabled && "kb-row-disabled")}
			title={item.path}
		>
			<span className="kb-name">{item.name}</span>
			{!item.valid ? (
				<span className="kb-badge kb-badge-invalid">不可用</span>
			) : item.origin === "external" ? (
				<span className="kb-badge kb-badge-external">外部</span>
			) : (
				<span className="kb-badge">默认</span>
			)}
		</button>
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
