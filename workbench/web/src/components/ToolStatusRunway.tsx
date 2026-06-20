import React from "react";

import { formatToolStatusItem } from "../lib/tool-status-format";
import type { ToolDisplay } from "../lib/api";
import type { ToolStatusCompletedItem, ToolStatusState } from "../lib/tool-status-model";

export const TOOL_RUNWAY_DETAIL_LIMIT = 50;
export const TOOL_RUNWAY_UPDATE_CADENCE_MS = 100;

type RunwayStatus = "running" | "done" | "failed" | "cancelled";

interface Props {
	state: ToolStatusState;
}

export function ToolStatusRunway({ state }: Props) {
	const active = state.active.at(-1);
	const latest = active ?? state.completed.at(-1);
	if (!latest && !state.cancelReason && !state.error) return null;

	const status = getRunwayStatus(state, latest);
	const formatted = latest
		? formatToolStatusItem({
				toolName: latest.toolName,
				action: latest.action,
				target: latest.target,
				args: "args" in latest ? latest.args : {},
				detail: "detail" in latest ? latest.detail : undefined,
				maxTargetLength: 64,
			})
		: null;
	const statusLabel = getStatusLabel(status, state);
	const prefix = status === "running" ? "正在" : statusLabel;

	return (
		<React.Fragment>
		<div className={`tool-runway tool-runway-${status}`} aria-label={`工具状态：${statusLabel}`}>
			<div className="tool-runway-pulse" aria-hidden="true" />
			<div className="tool-runway-main">
				<div className="tool-runway-current">
					<span className="tool-runway-status">{prefix}</span>
					{formatted && <span className="tool-runway-action">{formatted.action}</span>}
					{formatted && <span className="tool-runway-target">{formatted.target}</span>}
					{active && state.active.length > 1 && (
						<span className="tool-runway-meta">另有 {state.active.length - 1} 项</span>
					)}
				</div>
			</div>
		</div>
		</React.Fragment>
	);
}

function getRunwayStatus(
	state: ToolStatusState,
	latest: ToolStatusCompletedItem | ToolDisplay | undefined,
): RunwayStatus {
	if (state.error) return "failed";
	if (state.cancelReason) return "cancelled";
	if (!latest) return "done";
	if ("status" in latest) return latest.status;
	return "running";
}

function getStatusLabel(status: RunwayStatus, state: ToolStatusState): string {
	if (status === "running") return "运行中";
	if (status === "failed") return state.error ? "失败" : "工具失败";
	if (status === "cancelled") return state.cancelReason ?? "已取消";
	return "已完成";
}
