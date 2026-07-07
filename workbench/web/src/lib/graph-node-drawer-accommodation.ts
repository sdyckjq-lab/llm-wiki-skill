// #122：社区阅读单击节点打开右侧详情抽屉时的镜头让位策略。
//
// 抽屉布局分两种（见 workbench/web/src/index.css）：
//   - 宽屏并排（window > 900px）：抽屉在 flex 流里占位，画布变窄，存在"剩余画布"，
//     镜头把被选节点带到剩余画布的舒适位置。
//   - 窄屏覆盖（@media max-width 900px）：抽屉 position:fixed 覆盖画布，画布不变窄，
//     不存在"剩余画布"，不应按它重算相机。
// 全屏阅读面板覆盖整个视口，同样不变窄画布。
//
// reduced motion 不在这里决策：引擎层 moveSigmaCamera 会直跳（setState）保持节点可见，
// 取消大幅动画过渡，符合"仍打开详情并保持节点可见，但取消大幅镜头移动"。

// CSS 里抽屉从并排切到覆盖的断点（index.css @media (max-width: 900px)）。
export const GRAPH_DRAWER_OVERLAY_BREAKPOINT_PX = 900;

export interface NodeDrawerAccommodationContext {
	/** 窄屏覆盖抽屉：画布不变窄，不存在剩余画布。 */
	overlay: boolean;
	/** 全屏阅读面板：覆盖整个视口，画布不变窄。 */
	drawerFullscreen: boolean;
}

export function shouldAccommodateNodeDrawer(context: NodeDrawerAccommodationContext): boolean {
	return !context.overlay && !context.drawerFullscreen;
}

/**
 * 读取当前窗口是否落在窄屏覆盖抽屉断点下。默认读 window.matchMedia；测试可注入 view。
 */
export function graphDrawerOverlayActive(
	view: Window | null | undefined = typeof window === "undefined" ? undefined : window,
	breakpointPx: number = GRAPH_DRAWER_OVERLAY_BREAKPOINT_PX
): boolean {
	if (!view || typeof view.matchMedia !== "function") return false;
	return view.matchMedia(`(max-width: ${breakpointPx}px)`).matches;
}
