import React, { useState } from "react";

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

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (name: string, purpose: string) => Promise<void>;
}

export function NewWikiDialog({ open, onOpenChange, onSubmit }: Props) {
	const [name, setName] = useState("");
	const [purpose, setPurpose] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const reset = () => {
		setName("");
		setPurpose("");
		setError(null);
		setSubmitting(false);
	};

	const handleSubmit = async () => {
		if (!name.trim() || !purpose.trim()) {
			setError("名称和研究方向都需要填写");
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			await onSubmit(name.trim(), purpose.trim());
			reset();
			onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setSubmitting(false);
		}
	};

	const handleOpenChange = (newOpen: boolean) => {
		if (!newOpen) reset();
		onOpenChange(newOpen);
	};

	return (
		<React.Fragment>
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="dialog-surface sm:max-w-md">
				<DialogHeader>
					<DialogTitle>新建知识库</DialogTitle>
					<DialogDescription>在默认目录下创建一个完整的 llm-wiki 知识库。</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 py-2">
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="stage2-research"
						autoFocus
						className="form-field"
					/>
					<Input
						value={purpose}
						onChange={(e) => setPurpose(e.target.value)}
						placeholder="研究方向"
						className="form-field"
						onKeyDown={(e) => {
							if (e.key === "Enter" && !submitting) {
								e.preventDefault();
								handleSubmit();
							}
						}}
					/>
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
					<Button onClick={handleSubmit} disabled={submitting}>
						{submitting ? "创建中..." : "创建"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
		</React.Fragment>
	);
}
