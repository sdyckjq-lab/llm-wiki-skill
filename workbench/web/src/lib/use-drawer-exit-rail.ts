import { useCallback, useReducer, type Dispatch, type SetStateAction } from "react";

import { closedDrawer, type DrawerState } from "./drawer-state";

/**
 * 进入社区退场轨道（#120）：抽屉当前状态和退出快照必须一起变化。
 * 这样退出被 Escape / 知识库切换 / graphData 刷新打断时，可以在同一次
 * drawer 更新里清掉退出快照，不需要 render 期 ref 或 effect 兜底。
 */
export type SetDrawer = Dispatch<SetStateAction<DrawerState>>;

export interface DrawerExitRail {
	readonly drawer: DrawerState;
	readonly exitSnapshot: DrawerState | null;
	/** drawer === exitSnapshot：RightDrawer 的 exiting prop。引用守卫，退场被打断即翻 false。 */
	readonly isExiting: boolean;
	/** App 的唯一 drawer setter：会在 drawer 引用变化时同步清理退出快照。 */
	setDrawer: SetDrawer;
	/** 暂存退场快照（或传 null 取消）。 */
	stage: (snapshot: DrawerState | null) => void;
	/** 退场定时器到点：落回 closed 并清空快照。 */
	complete: () => void;
	/** setDrawer updater 内使用：保护正在退场的 drawer 引用。 */
	isProtected: (current: DrawerState) => boolean;
}

interface DrawerExitRailState {
	drawer: DrawerState;
	exitSnapshot: DrawerState | null;
}

type DrawerExitRailAction =
	| { type: "set-drawer"; next: SetStateAction<DrawerState> }
	| { type: "stage"; snapshot: DrawerState | null }
	| { type: "complete" };

function drawerExitRailReducer(state: DrawerExitRailState, action: DrawerExitRailAction): DrawerExitRailState {
	if (action.type === "set-drawer") {
		const nextDrawer = typeof action.next === "function" ? action.next(state.drawer) : action.next;
		const nextExitSnapshot = state.exitSnapshot && nextDrawer === state.exitSnapshot ? state.exitSnapshot : null;
		if (nextDrawer === state.drawer && nextExitSnapshot === state.exitSnapshot) return state;
		return { drawer: nextDrawer, exitSnapshot: nextExitSnapshot };
	}
	if (action.type === "stage") {
		if (state.exitSnapshot === action.snapshot) return state;
		return { ...state, exitSnapshot: action.snapshot };
	}
	return { drawer: closedDrawer(), exitSnapshot: null };
}

export function useDrawerExitRail(): DrawerExitRail {
	const [{ drawer, exitSnapshot }, dispatch] = useReducer(drawerExitRailReducer, undefined, () => ({
		drawer: closedDrawer(),
		exitSnapshot: null,
	}));

	const setDrawer = useCallback((next: SetStateAction<DrawerState>): void => {
		dispatch({ type: "set-drawer", next });
	}, []);

	const stage = useCallback((snapshot: DrawerState | null): void => {
		dispatch({ type: "stage", snapshot });
	}, []);

	const complete = useCallback((): void => {
		dispatch({ type: "complete" });
	}, []);

	const isProtected = useCallback((current: DrawerState): boolean => {
		return exitSnapshot != null && current === exitSnapshot;
	}, [exitSnapshot]);

	return {
		drawer,
		exitSnapshot,
		isExiting: exitSnapshot != null && drawer === exitSnapshot,
		setDrawer,
		stage,
		complete,
		isProtected,
	};
}
