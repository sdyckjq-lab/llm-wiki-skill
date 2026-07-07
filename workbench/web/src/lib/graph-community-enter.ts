import type { GraphEngine, Selection } from "@llm-wiki/graph-engine";
import type { DrawerState } from "./drawer-state";

/**
 * Entering a community records where the user came from, then changes the graph
 * route to Sigma community reading. Source context is separate from selection:
 * it can restore the global highlight on return without making every node in
 * that community look selected/core inside the reading view.
 */
export function applyCommunityEnter(engine: GraphEngine, communityId: string): Selection | null {
	engine.clearSelection();
	engine.setSourceCommunityContext(communityId);
	engine.focusCommunity(communityId);
	return null;
}

/**
 * 进入社区时的布局过渡时长（毫秒）。落在设计文档 §动效节奏的
 * 「布局/抽屉/镜头过渡」250–450ms 区间内：这段时间里社区摘要抽屉退场、
 * 画布随宽度过渡平滑扩展，镜头复用 #118 的 Sigma 视图过渡基座继续推进
 * 到社区阅读近景。退出社区（#121）不属于本票，故这里只服务进入路径。
 *
 * RightDrawer 用它做退场 setTimeout（到点卸载抽屉）。index.css 里
 * `.drawer-panel[data-drawer-exiting]` 的 width 过渡时长（280ms）须 ≤ 此值，
 * 否则卸载时宽度还没收完。改这里记得同步 CSS。
 */
export const COMMUNITY_ENTER_EXIT_DURATION_MS = 320;

export interface CommunityEnterExitPlan {
	/** 立即下发的工作台命令：进入 Sigma 社区阅读主路径。 */
	selectionCommand: { id: string; type: "enter-community" };
	/**
	 * 抽屉退场编排。null 表示跳过退场（减少动态效果，或抽屉本就关闭），
	 * 直接落回 closed。否则 RightDrawer 在 durationMs 内保留摘要挂载、
	 * 移除宽度 class 让画布平滑扩展，结束后才真正关闭——退场而非瞬间消失。
	 */
	exit: { drawer: DrawerState; durationMs: number } | null;
}

/**
 * 规划「全局进入社区」这一段连续过渡的工作台侧编排。相机推进本身已由
 * #118 的共享 Sigma 视图过渡基座承担（focusCommunity → spotlight camera
 * → startSigmaGlobalViewTransition，含 reduced motion 直跳与用户打断接管）；
 * 本函数只决定抽屉是退场还是直接关，以及下发的进入命令——不另写相机逻辑。
 */
export function planCommunityEnterExit(options: {
	communityId: string;
	drawer: DrawerState;
	reducedMotion: boolean;
	durationMs?: number;
}): CommunityEnterExitPlan {
	const { communityId, drawer, reducedMotion } = options;
	const selectionCommand = { id: communityId, type: "enter-community" as const };
	if (reducedMotion || drawer.mode === "closed") {
		return { selectionCommand, exit: null };
	}
	return {
		selectionCommand,
		exit: {
			drawer,
			durationMs: options.durationMs ?? COMMUNITY_ENTER_EXIT_DURATION_MS,
		},
	};
}
