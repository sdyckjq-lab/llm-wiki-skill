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
		<div className="popup-menu">
			{groups.length === 0 ? (
				<div className="popup-item text-[var(--app-muted)]">没有匹配命令</div>
			) : (
				groups.map((group) => (
					<div key={group.label}>
						<div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--app-muted)]">
							{group.label}
							{query && <span className="normal-case opacity-70"> / {query}</span>}
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
									className={cn("popup-item w-full text-left", selected && "popup-item-selected")}
								>
									<span className="min-w-20 font-mono text-xs text-[var(--app-accent)]">{item.slug}</span>
									<span className="min-w-0 flex-1">
										<span className="block truncate">{item.name}</span>
										<span className="popup-item-desc block truncate">{item.description}</span>
									</span>
									<span className="shrink-0 text-[10px] text-[var(--app-muted)]">{sourceLabel(item)}</span>
								</button>
							);
						})}
					</div>
				))
			)}
		</div>
	);
}
