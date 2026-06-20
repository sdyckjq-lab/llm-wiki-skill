import { MessageCircle, Network } from "lucide-react";

import { cn } from "../lib/utils";

export type MainView = "chat" | "graph";

interface MainViewTabsProps {
	activeView: MainView;
	graphHasPendingUpdate?: boolean;
	onSelectView: (view: MainView) => void;
}

export function MainViewTabs({
	activeView,
	graphHasPendingUpdate = false,
	onSelectView,
}: MainViewTabsProps) {
	return (
		<div className="main-view-tabs" role="tablist" aria-label="主视图切换">
			<MainViewTab
				view="chat"
				active={activeView === "chat"}
				onSelectView={onSelectView}
				icon={<MessageCircle />}
			>
				对话
			</MainViewTab>
			<MainViewTab
				view="graph"
				active={activeView === "graph"}
				onSelectView={onSelectView}
				icon={<Network />}
				badge={graphHasPendingUpdate}
			>
				图谱
			</MainViewTab>
		</div>
	);
}

function MainViewTab({
	view,
	active,
	badge,
	icon,
	children,
	onSelectView,
}: {
	view: MainView;
	active: boolean;
	badge?: boolean;
	icon: React.ReactNode;
	children: React.ReactNode;
	onSelectView: (view: MainView) => void;
}) {
	return (
		<button
			type="button"
			role="tab"
			className={cn("main-view-tab", active && "main-view-tab-active")}
			aria-selected={active}
			onClick={() => onSelectView(view)}
		>
			{icon}
			<span>{children}</span>
			{badge && <span className="main-view-tab-dot" aria-hidden="true" />}
		</button>
	);
}
