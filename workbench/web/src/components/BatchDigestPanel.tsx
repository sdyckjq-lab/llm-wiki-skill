import { ExternalLink, X } from "lucide-react";
import type { BatchDigestEvent } from "../lib/api";
import { cn } from "../lib/utils";

export interface BatchDigestJob {
	id: string;
	kbPath: string;
	status: "running" | "done" | "error";
	total: number;
	completed: number;
	failed: number;
	current?: string;
	outputDir?: string;
	error?: string;
	files: BatchDigestFileState[];
	events: BatchDigestEvent[];
}

export interface BatchDigestFileState {
	index: number;
	filePath: string;
	status: "queued" | "running" | "done" | "error";
	chars?: number;
	outputPath?: string;
	error?: string;
}

interface Props {
	job: BatchDigestJob | null;
	onClose: () => void;
	onOpenOutput: (outputPath: string) => void;
}

export function BatchDigestPanel({ job, onClose, onOpenOutput }: Props) {
	if (!job) return null;
	const percent = job.total > 0 ? Math.round(((job.completed + job.failed) / job.total) * 100) : 0;
	return (
		<div className="batch-panel" aria-label="批量消化进度">
			<div className="batch-header">
				<div>
					<div className="batch-title">批量消化</div>
					<div className="batch-subtitle">
						{job.completed} 完成 / {job.failed} 失败 / {job.total} 总数
					</div>
				</div>
				<span className={cn("batch-status", `batch-status-${job.status}`)}>{statusLabel(job.status)}</span>
				<button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
					<X className="size-4" />
				</button>
			</div>
			<div className="batch-body">
				<div className="batch-progress" aria-label={`批量消化进度 ${percent}%`}>
					<div className="batch-progress-bar" style={{ width: `${percent}%` }} />
				</div>
				<div className="batch-progress-meta">
					<span>{percent}%</span>
					<span>{job.total - job.completed - job.failed} 排队/进行中</span>
				</div>
				{job.current && (
					<div className="batch-current">{job.current}</div>
				)}
				{job.files.map((file) => (
					<div
						key={`${file.index}:${file.filePath}`}
						className={cn("batch-file", `batch-file-${file.status}`)}
					>
						<FileStatusIcon status={file.status} />
						<div className="min-w-0">
							<div className="batch-file-name">{shortName(file.filePath)}</div>
							<div className="batch-file-detail">
								{file.status === "running"
									? `生成中${file.chars ? `，约 ${file.chars} 字` : ""}`
									: file.status === "done"
										? `已完成${file.chars ? `，约 ${file.chars} 字` : ""}`
										: file.status === "error"
											? file.error
											: "排队中"}
							</div>
						</div>
						{file.outputPath ? (
							<button
								type="button"
								className="batch-output-btn"
								onClick={() => onOpenOutput(file.outputPath as string)}
								aria-label="打开结果"
							>
								<ExternalLink className="size-3.5" />
							</button>
						) : (
							<span />
						)}
					</div>
				))}
				{job.status === "done" && (
					<div className="batch-result batch-result-done">已完成：{job.outputDir}</div>
				)}
				{job.status === "error" && (
					<div className="batch-result batch-result-error">{job.error}</div>
				)}
			</div>
		</div>
	);
}

function FileStatusIcon({ status }: { status: BatchDigestFileState["status"] }) {
	return <span className={cn("batch-dot", `batch-dot-${status}`)} />;
}

function shortName(filePath: string): string {
	return filePath.split("/").filter(Boolean).at(-1) ?? filePath;
}

function statusLabel(status: BatchDigestJob["status"]): string {
	if (status === "running") return "运行中";
	if (status === "done") return "完成";
	return "出错";
}
