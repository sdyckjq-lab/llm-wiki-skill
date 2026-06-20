import type { PageRef } from "../lib/api";
import { cn } from "../lib/utils";

interface Props {
	open: boolean;
	query: string;
	items: PageRef[];
	selectedIndex: number;
	onSelect: (item: PageRef) => void;
}

export function RefMenu({ open, query, items, selectedIndex, onSelect }: Props) {
	if (!open) return null;
	return (
		<div className="popup-menu">
			<div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--app-muted)]">
				@ 引用 {query && <span className="normal-case opacity-70">/ {query}</span>}
			</div>
			{items.length === 0 ? (
				<div className="popup-item text-[var(--app-muted)]">没有匹配页面</div>
			) : (
				items.map((item, index) => (
					<button
						key={item.path}
						type="button"
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => onSelect(item)}
						className={cn("popup-item w-full text-left", index === selectedIndex && "popup-item-selected")}
					>
						<span className="min-w-20 text-xs text-[var(--app-muted)]">{item.category}</span>
						<span className="min-w-0 flex-1">
							<span className="block truncate">{item.title}</span>
							<span className="popup-item-desc block truncate font-mono">{item.path}</span>
						</span>
					</button>
				))
			)}
		</div>
	);
}
