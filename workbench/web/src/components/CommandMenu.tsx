import type { CommandItem as CommandItemType } from "../lib/api";
import { cn } from "../lib/utils";

interface Props {
	open: boolean;
	query: string;
	items: CommandItemType[];
	selectedIndex: number;
	onSelect: (item: CommandItemType) => void;
}

function sourceLabel(item: CommandItemType): string {
	if (item.source === "builtin") return item.skillPath ? "项目" : "内置";
	if (item.source === "pi-default") return "pi";
	return "全局";
}

export function CommandMenu({ open, query, items, selectedIndex, onSelect }: Props) {
	if (!open) return null;

	const groups = [
		{ label: "内置", items: items.filter((item) => item.source === "builtin" && !item.skillPath) },
		{ label: "项目 Skill", items: items.filter((item) => item.source === "builtin" && item.skillPath) },
		{ label: "pi 默认", items: items.filter((item) => item.source === "pi-default") },
		{ label: "用户全局", items: items.filter((item) => item.source === "user-global") },
	].filter((group) => group.items.length > 0);
	let index = -1;

	return (
		<div className="popup-menu popup-menu-command" role="listbox" aria-label="/ 调用命令">
			{groups.length === 0 ? (
				<div className="popup-menu-heading">
					<span className="popup-menu-symbol">/</span>
					<span>调用命令</span>
					{query && <span className="popup-menu-query">/ {query}</span>}
				</div>
			) : null}
			{groups.length === 0 ? (
				<div className="popup-item popup-item-empty">没有匹配命令</div>
			) : (
				groups.map((group) => (
					<div className="popup-group" key={group.label}>
						<div className="popup-menu-heading">
							<span className="popup-menu-symbol">/</span>
							{group.label}
							{query && <span className="popup-menu-query">/ {query}</span>}
						</div>
						{group.items.map((item) => {
							index += 1;
							const selected = index === selectedIndex;
							return (
								<button
									key={`${item.source}:${item.slug}`}
									type="button"
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => onSelect(item)}
									role="option"
									aria-selected={selected}
									className={cn("popup-item w-full text-left", selected && "popup-item-selected")}
								>
									<span className="popup-item-command">{item.slug}</span>
									<span className="min-w-0 flex-1">
										<span className="block truncate">{item.name}</span>
										<span className="popup-item-desc block truncate">{item.description}</span>
									</span>
									<span className="popup-source">{sourceLabel(item)}</span>
								</button>
							);
						})}
					</div>
				))
			)}
		</div>
	);
}
