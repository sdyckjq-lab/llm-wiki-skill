import { X } from "lucide-react";
import type { GraphRenameRecoveryData } from "@llm-wiki/workbench-contracts";

type Receipt = Extract<GraphRenameRecoveryData, { status: "clear" }>["retained_evidence_receipts"][number];

interface Props {
	receipts: Receipt[];
	onDismiss: (operationId: string) => void;
}

export function GraphRenameEvidenceNotice({ receipts, onDismiss }: Props) {
	if (receipts.length === 0) return null;
	return (
		<section className="graph-rename-evidence-notice" role="region" aria-label="保留的改名冲突证据">
			<header>
				<div>
					<strong>改名冲突证据仍在保留期内</strong>
					<p>这些未选版本不会阻止新的安全改名，到期后会自动删除。</p>
				</div>
			</header>
			{receipts.map((receipt) => (
				<article key={receipt.operation_id}>
					<div className="graph-rename-evidence-operation">
						<span>操作 {receipt.operation_id}</span>
						<button type="button" onClick={() => onDismiss(receipt.operation_id)} aria-label="隐藏这条证据提示">
							<X aria-hidden="true" />
						</button>
					</div>
					<ul>{receipt.retained_evidence.map((evidence) => (
						<li key={evidence.relative_path}>
							<code>{evidence.relative_path}</code>
							<span>摘要 {evidence.sha256}</span>
							<span>自动删除时间 {evidence.expires_at}</span>
						</li>
					))}</ul>
				</article>
			))}
		</section>
	);
}
