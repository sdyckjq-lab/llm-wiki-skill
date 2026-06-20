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
		<div className="popup-menu popup-menu-ref" role="listbox" aria-label="@ 引用页面">
			<div className="popup-menu-heading">
				<span className="popup-menu-symbol">@</span>
				<span>引用页面</span>
				{query && <span className="popup-menu-query">/ {query}</span>}
			</div>
			{items.length === 0 ? (
				<div className="popup-item popup-item-empty">没有匹配页面</div>
			) : (
				items.map((item, index) => (
					<button
						key={item.path}
						type="button"
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => onSelect(item)}
						role="option"
						aria-selected={index === selectedIndex}
						className={cn("popup-item w-full text-left", index === selectedIndex && "popup-item-selected")}
					>
						<span className="popup-item-kind">{item.category}</span>
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
