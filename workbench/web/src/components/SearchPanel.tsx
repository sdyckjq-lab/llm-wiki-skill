import { ExternalLink, Link2, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { PageRef } from "../lib/api";
import { filterPageRefs } from "../lib/search-filter";
import { cn } from "../lib/utils";

interface Props {
	open: boolean;
	refs: PageRef[];
	loading?: boolean;
	error?: string | null;
	knowledgeBaseName?: string | null;
	onClose: () => void;
	onOpenPage: (path: string) => void;
	onInsertRef?: (path: string) => void;
}

export function SearchPanel({
	open,
	refs,
	loading = false,
	error = null,
	knowledgeBaseName,
	onClose,
	onOpenPage,
	onInsertRef,
}: Props) {
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState(0);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const results = useMemo(() => filterPageRefs(refs, query, 50), [query, refs]);
	const selectedResult = results[selected] ?? results[0] ?? null;

	useEffect(() => {
		if (!open) return;
		const timer = window.setTimeout(() => {
			setQuery("");
			setSelected(0);
			inputRef.current?.focus();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [open]);

	if (!open) return null;

	const openSelected = () => {
		if (!selectedResult) return;
		onOpenPage(selectedResult.ref.path);
		onClose();
	};

	return (
		<div className="search-overlay" role="presentation" onMouseDown={onClose}>
			<section
				className="search-panel"
				aria-label="当前库搜索"
				onMouseDown={(event) => event.stopPropagation()}
			>
				<header className="search-panel-header">
					<div>
						<div className="search-panel-title">搜索当前库</div>
						<div className="search-panel-subtitle">
							{knowledgeBaseName ? `${knowledgeBaseName} · ${refs.length} 个页面引用` : "请先选择知识库"}
						</div>
					</div>
					<button type="button" className="icon-btn" onClick={onClose} aria-label="关闭搜索">
						<X className="size-4" />
					</button>
				</header>
				<label className="search-input-wrap">
					<Search className="size-4" aria-hidden="true" />
					<input
						ref={inputRef}
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							setSelected(0);
						}}
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								event.preventDefault();
								onClose();
								return;
							}
							if (event.key === "ArrowDown") {
								event.preventDefault();
								setSelected((value) => Math.min(value + 1, Math.max(results.length - 1, 0)));
								return;
							}
							if (event.key === "ArrowUp") {
								event.preventDefault();
								setSelected((value) => Math.max(value - 1, 0));
								return;
							}
							if (event.key === "Enter") {
								event.preventDefault();
								openSelected();
							}
						}}
						placeholder="输入标题、路径、中文关键词..."
						aria-label="搜索当前库页面"
					/>
					<kbd>Enter</kbd>
				</label>
				<div className="search-panel-body">
					{loading && <div className="search-state">正在加载当前库页面...</div>}
					{error && <div className="search-state search-state-error">{error}</div>}
					{!loading && !error && !knowledgeBaseName && (
						<div className="search-state">请先选择知识库</div>
					)}
					{!loading && !error && knowledgeBaseName && refs.length === 0 && (
						<div className="search-state">当前库还没有可搜索页面</div>
					)}
					{!loading && !error && knowledgeBaseName && refs.length > 0 && results.length === 0 && (
						<div className="search-state">没有匹配结果</div>
					)}
					{!loading && !error && results.length > 0 && (
						<div className="search-results" role="listbox" aria-label="搜索结果">
							{results.map((result, index) => (
								<div
									key={result.ref.path}
									role="option"
									aria-selected={index === selected}
									className={cn("search-result", index === selected && "search-result-selected")}
									onMouseEnter={() => setSelected(index)}
								>
									<button
										type="button"
										className="search-result-main"
										onClick={() => {
											onOpenPage(result.ref.path);
											onClose();
										}}
									>
										<span className="search-result-kind">{result.ref.category}</span>
										<span className="search-result-copy">
											<span className="search-result-title">{result.ref.title}</span>
											<span className="search-result-path">{result.ref.path}</span>
										</span>
										<ExternalLink className="size-3.5" />
									</button>
									{onInsertRef && (
										<button
											type="button"
											className="search-insert-btn"
											onClick={(event) => {
												event.stopPropagation();
												onInsertRef(result.ref.path);
												onClose();
											}}
										>
											<Link2 className="size-3.5" />
											插入
										</button>
									)}
								</div>
							))}
						</div>
					)}
				</div>
			</section>
		</div>
	);
}
