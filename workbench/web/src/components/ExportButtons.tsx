import { FileDown, FileText, Globe, Presentation, Table } from "lucide-react";
import type { ComponentType } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import type { ExportKind } from "../lib/api";

const EXPORTS: Array<{
	kind: ExportKind;
	label: string;
	icon: ComponentType<{ className?: string }>;
}> = [
	{ kind: "pdf", label: "PDF", icon: FileDown },
	{ kind: "docx", label: "Word", icon: FileText },
	{ kind: "pptx", label: "PPT", icon: Presentation },
	{ kind: "xlsx", label: "Excel", icon: Table },
	{ kind: "html", label: "HTML", icon: Globe },
];

interface Props {
	disabled: boolean;
	disabledReason: string;
	onExport: (kind: ExportKind) => void;
}

export function ExportButtons({ disabled, disabledReason, onExport }: Props) {
	return (
		<div className="export-bar" aria-label="导出当前对话">
			<div className="export-bar-head">
				<span className="export-label">导出</span>
				<span className="export-hint">把当前对话整理成文件</span>
			</div>
			{EXPORTS.map((item) => {
				const Icon = item.icon;
				return (
					<Tooltip key={item.kind}>
						<TooltipTrigger asChild>
							<span>
								<button
									type="button"
									disabled={disabled}
									onClick={() => onExport(item.kind)}
									className="export-btn"
									aria-label={`导出为 ${item.label}`}
								>
									<Icon className="size-3.5" />
									{item.label}
								</button>
							</span>
						</TooltipTrigger>
						<TooltipContent side="top">
							{disabled ? disabledReason : `导出为 ${item.label}`}
						</TooltipContent>
					</Tooltip>
				);
			})}
		</div>
	);
}
