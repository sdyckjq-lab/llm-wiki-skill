import React from "react";

import { formatToolStatusItem, type ToolStatusGroup } from "../lib/tool-status-format";
import type { ToolStatusCompletedItem, ToolStatusState } from "../lib/tool-status-model";

export const TOOL_HISTORY_DETAIL_LIMIT = 50;

interface Props {
	state: ToolStatusState;
	defaultExpanded?: boolean;
}

interface GroupSummary {
	group: ToolStatusGroup;
	label: string;
	items: ToolStatusCompletedItem[];
}

const GROUP_LABELS: Record<ToolStatusGroup, string> = {
	file: "文件",
	command: "命令",
	search: "搜索",
	skill: "Skill",
	other: "其他",
};

const GROUP_ORDER: ToolStatusGroup[] = ["file", "command", "search", "skill", "other"];

export function ToolHistorySummary({ state, defaultExpanded = false }: Props) {
	const [expanded, setExpanded] = React.useState(defaultExpanded);
	const completed = state.completed;
	if (completed.length === 0) return null;

	const groups = groupCompletedItems(completed);
	const visibleRows = completed.slice(0, TOOL_HISTORY_DETAIL_LIMIT);
	const remainingCount = Math.max(0, completed.length - visibleRows.length + state.completedOverflowCount);
	const totalCount = completed.length + state.completedOverflowCount;

	return (
		<React.Fragment>
			<div className="tool-history-summary">
				<button
					type="button"
					className="tool-history-header"
					aria-expanded={expanded}
					onClick={() => setExpanded((current) => !current)}
				>
					<span className="tool-history-title">已完成 {totalCount} 项工具调用</span>
					<span className="tool-history-groups" aria-label="工具分组">
						{groups.map((group) => (
							<span key={group.group} className={`tool-history-group tool-history-group-${group.group}`}>
								{group.label} {group.items.length}
							</span>
						))}
					</span>
				</button>
				{expanded && <div className="tool-history-detail">
					{visibleRows.map((item) => {
						const formatted = formatCompletedItem(item);
						return (
							<div key={`${item.toolCallId}-${item.lastSeq}`} className={`tool-history-row tool-history-row-${item.status}`}>
								<span className="tool-history-row-status">{statusLabel(item.status)}</span>
								<span className="tool-history-row-action">{formatted.action}</span>
								<span className="tool-history-row-target">{formatted.target}</span>
								{item.summary && <span className="tool-history-row-summary">{item.summary}</span>}
							</div>
						);
					})}
					{remainingCount > 0 && <div className="tool-history-more">还有 {remainingCount} 项</div>}
				</div>}
			</div>
		</React.Fragment>
	);
}

function groupCompletedItems(items: ToolStatusCompletedItem[]): GroupSummary[] {
	const groups = new Map<ToolStatusGroup, ToolStatusCompletedItem[]>();
	for (const item of items) {
		const formatted = formatCompletedItem(item);
		const current = groups.get(formatted.group) ?? [];
		current.push(item);
		groups.set(formatted.group, current);
	}
	return GROUP_ORDER.flatMap((group) => {
		const groupItems = groups.get(group);
		if (!groupItems?.length) return [];
		return [
			{
				group,
				label: GROUP_LABELS[group],
				items: groupItems,
			},
		];
	});
}

function formatCompletedItem(item: ToolStatusCompletedItem) {
	return formatToolStatusItem({
		toolName: item.toolName,
		action: item.action,
		target: item.target,
		args: item.args,
		maxTargetLength: 56,
	});
}

function statusLabel(status: ToolStatusCompletedItem["status"]): string {
	if (status === "done") return "完成";
	if (status === "failed") return "失败";
	return "取消";
}
