import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import {
	createGraphWorkbenchCapabilities,
	createGraphEngine,
	buildCommunityAggregationMarkers,
	GraphDiffQueue,
	type GraphData,
	type GraphDiff,
	type GraphEngine,
	type GraphOpenPagePayload,
	type GraphVisibilityState,
	type PinMap,
	type Selection,
	type ThemeId,
} from "@llm-wiki/graph-engine";

import {
	getGraphData,
	getGraphLayout,
	putGraphLayout,
	rebuildGraph,
} from "../lib/api";
import type { GraphSelectionCommand } from "../lib/graph-summary-actions";
import { cn } from "../lib/utils";
import { DEFAULT_GRAPH_STATUS, type GraphStatusKind, type GraphStatusSnapshot } from "../lib/view-status";

interface Props {
	currentKnowledgeBaseName: string | null;
	currentKnowledgeBasePath: string | null;
	theme: "dark" | "light";
	graphBuildError?: { kbPath: string; message: string; rebuiltAt: string } | null;
	onOpenPage?: (payload: GraphOpenPagePayload) => void;
	onGraphDataChange?: (data: GraphData | null) => void;
	onGraphPinsChange?: (pins: PinMap) => void;
	onGraphVisibilityChange?: (state: GraphVisibilityState | null) => void;
	onSelectionChange?: (selection: Selection | null) => void;
	onStatusChange?: (snapshot: GraphStatusSnapshot) => void;
	onViewReset?: () => void;
	selectionCommand?: GraphSelectionCommand;
	focusPath?: string | null;
	pendingDiff?: GraphDiff | null;
	refreshToken?: number;
	onDiffConsumed?: () => void;
}

interface ResetNotice {
	pins: PinMap;
	count: number;
}

interface PendingAnimation {
	token: number;
	diff: GraphDiff;
}

export function GraphPanel({
	currentKnowledgeBaseName,
	currentKnowledgeBasePath,
	theme,
	graphBuildError = null,
	onOpenPage,
	onGraphDataChange,
	onGraphPinsChange,
	onGraphVisibilityChange,
	onSelectionChange,
	onStatusChange,
	onViewReset,
	selectionCommand,
	focusPath,
	pendingDiff,
	refreshToken = 0,
	onDiffConsumed,
}: Props) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const engineRef = useRef<GraphEngine | null>(null);
	const engineKbPathRef = useRef<string | null>(null);
	const engineDataRef = useRef<GraphData | null>(null);
	const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const resetNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const activeKbPathRef = useRef<string | null>(currentKnowledgeBasePath);
	const graphThemeRef = useRef<ThemeId>(theme === "dark" ? "mo-ye" : "shan-shui");
	const layoutPinsRef = useRef<PinMap>({});
	const loadRequestRef = useRef(0);
	const onOpenPageRef = useRef(onOpenPage);
	const onGraphDataChangeRef = useRef(onGraphDataChange);
	const onGraphPinsChangeRef = useRef(onGraphPinsChange);
	const onGraphVisibilityChangeRef = useRef(onGraphVisibilityChange);
	const onSelectionChangeRef = useRef(onSelectionChange);
	const onViewResetRef = useRef(onViewReset);
	const diffQueueRef = useRef(new GraphDiffQueue({ visible: true }));
	const lastRefreshTokenRef = useRef(refreshToken);
	const devGraphTestRef = useRef("");
	const animationTokenRef = useRef(0);
	const lastSelectionCommandRef = useRef<GraphSelectionCommand | undefined>(selectionCommand);
	const [data, setData] = useState<GraphData | null>(null);
	const [dataKnowledgeBasePath, setDataKnowledgeBasePath] = useState<string | null>(currentKnowledgeBasePath);
	const [resetNotice, setResetNotice] = useState<ResetNotice | null>(null);
	const [status, setStatus] = useState<GraphStatusKind>("idle");
	const [error, setError] = useState<string | null>(null);
	const [buildState, setBuildState] = useState<"none" | "started" | "queued">("none");
	const [animationState, setAnimationState] = useState<"idle" | "playing" | "queued">("idle");
	const [pendingAnimation, setPendingAnimation] = useState<PendingAnimation | null>(null);
	const [animationReadyToken, setAnimationReadyToken] = useState(0);
	const lastDragStateRef = useRef(false);
	const aggregationMarkers = useMemo(
		() => data ? buildCommunityAggregationMarkers(data, { pins: layoutPinsRef.current, minCommunitySize: 6 }) : [],
		[data],
	);

	const graphTheme: ThemeId = theme === "dark" ? "mo-ye" : "shan-shui";

	useLayoutEffect(() => {
		activeKbPathRef.current = currentKnowledgeBasePath;
		layoutPinsRef.current = {};
		lastDragStateRef.current = false;
		setData(null);
		setDataKnowledgeBasePath(currentKnowledgeBasePath);
	}, [currentKnowledgeBasePath]);

	useEffect(() => {
		return () => {
			onStatusChange?.(DEFAULT_GRAPH_STATUS);
		};
	}, [onStatusChange]);

	useEffect(() => {
		if (!graphBuildError || graphBuildError.kbPath !== currentKnowledgeBasePath) return;
		setData(null);
		setDataKnowledgeBasePath(currentKnowledgeBasePath);
		onGraphDataChangeRef.current?.(null);
		onGraphVisibilityChangeRef.current?.(null);
		onSelectionChangeRef.current?.(null);
		setBuildState("none");
		setError(graphBuildError.message);
		setStatus("error");
	}, [currentKnowledgeBasePath, graphBuildError]);

	useLayoutEffect(() => {
		graphThemeRef.current = graphTheme;
	}, [graphTheme]);

	useLayoutEffect(() => {
		onOpenPageRef.current = onOpenPage;
	}, [onOpenPage]);

	useLayoutEffect(() => {
		onGraphDataChangeRef.current = onGraphDataChange;
	}, [onGraphDataChange]);

	useLayoutEffect(() => {
		onGraphPinsChangeRef.current = onGraphPinsChange;
	}, [onGraphPinsChange]);

	useLayoutEffect(() => {
		onGraphVisibilityChangeRef.current = onGraphVisibilityChange;
	}, [onGraphVisibilityChange]);

	useLayoutEffect(() => {
		onSelectionChangeRef.current = onSelectionChange;
	}, [onSelectionChange]);

	useLayoutEffect(() => {
		onStatusChange?.({
			status,
			summary: graphStatusSummary(status, Boolean(currentKnowledgeBasePath), buildState, error, data, animationState),
			animation: animationState,
		});
	}, [animationState, buildState, currentKnowledgeBasePath, data, error, onStatusChange, status]);

	useLayoutEffect(() => {
		onViewResetRef.current = onViewReset;
	}, [onViewReset]);

	const applyLayoutPins = useCallback((pins: PinMap): void => {
		layoutPinsRef.current = pins;
		onGraphPinsChangeRef.current?.(pins);
	}, []);

	const runWhenDragIdle = useCallback((operation: () => void): () => void => {
		let cancelled = false;
		const run = () => {
			if (cancelled) return;
			if (lastDragStateRef.current || engineRef.current?.isDragging()) {
				window.setTimeout(run, 40);
				return;
			}
			operation();
		};
		run();
		return () => {
			cancelled = true;
		};
	}, []);

	const loadGraph = useCallback(async () => {
		const requestId = ++loadRequestRef.current;
		const kbPath = currentKnowledgeBasePath;
		if (!kbPath) {
			setData(null);
			setDataKnowledgeBasePath(null);
			onGraphDataChangeRef.current?.(null);
			onGraphVisibilityChangeRef.current?.(null);
			applyLayoutPins({});
			onSelectionChangeRef.current?.(null);
			setStatus("idle");
			setError(null);
			return true;
		}
		setStatus((current) => (current === "building" ? "building" : "loading"));
		setError(null);
		try {
			const [result, layout] = await Promise.all([getGraphData(kbPath), getGraphLayout(kbPath)]);
			if (loadRequestRef.current !== requestId || activeKbPathRef.current !== kbPath) return false;
			const nextPins = { ...layout.layout.pins, ...layoutPinsRef.current };
			applyLayoutPins(nextPins);
			if (result.needsBuild) {
				setData(null);
				setDataKnowledgeBasePath(kbPath);
				onGraphDataChangeRef.current?.(null);
				onGraphVisibilityChangeRef.current?.(null);
				onSelectionChangeRef.current?.(null);
				setStatus("building");
				const nextBuildState = await rebuildGraph(kbPath);
				if (loadRequestRef.current !== requestId || activeKbPathRef.current !== kbPath) return false;
				setBuildState(nextBuildState);
				return true;
			}
			setData(result.data);
			setDataKnowledgeBasePath(kbPath);
			onGraphDataChangeRef.current?.(result.data);
			setStatus("ready");
			setBuildState("none");
			return true;
		} catch (err) {
			if (loadRequestRef.current !== requestId || activeKbPathRef.current !== kbPath) return false;
			setData(null);
			setDataKnowledgeBasePath(kbPath);
			onGraphDataChangeRef.current?.(null);
			onGraphVisibilityChangeRef.current?.(null);
			applyLayoutPins({});
			onSelectionChangeRef.current?.(null);
			setStatus("error");
			setError(err instanceof Error ? err.message : String(err));
			return false;
		}
	}, [applyLayoutPins, currentKnowledgeBasePath]);

	useEffect(() => {
		void loadGraph();
	}, [loadGraph]);

	useEffect(() => {
		return () => {
			if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
			if (resetNoticeTimerRef.current) window.clearTimeout(resetNoticeTimerRef.current);
			engineRef.current?.destroy();
			engineRef.current = null;
			engineKbPathRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (persistTimerRef.current) {
			window.clearTimeout(persistTimerRef.current);
			persistTimerRef.current = null;
		}
		diffQueueRef.current = new GraphDiffQueue({ visible: true });
		setResetNotice(null);
		setPendingAnimation(null);
		setAnimationState("idle");
	}, [currentKnowledgeBasePath]);

	const persistPins = useCallback(async (pins: PinMap): Promise<void> => {
		const kbPath = activeKbPathRef.current;
		applyLayoutPins(pins);
		if (!kbPath) return;
		if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
		persistTimerRef.current = null;
		void putGraphLayout(kbPath, pins).catch((err) => {
			if (activeKbPathRef.current !== kbPath) return;
			setError(err instanceof Error ? err.message : String(err));
		});
	}, [applyLayoutPins]);

	const writePinsImmediately = useCallback(async (pins: PinMap): Promise<void> => {
		const kbPath = activeKbPathRef.current;
		applyLayoutPins(pins);
		engineRef.current?.setPins(pins);
		if (!kbPath) return;
		if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
		try {
			await putGraphLayout(kbPath, pins);
		} catch (err) {
			if (activeKbPathRef.current !== kbPath) return;
			setError(err instanceof Error ? err.message : String(err));
		}
	}, [applyLayoutPins]);

	const dismissResetNoticeLater = useCallback(() => {
		if (resetNoticeTimerRef.current) window.clearTimeout(resetNoticeTimerRef.current);
		resetNoticeTimerRef.current = window.setTimeout(() => {
			setResetNotice(null);
			resetNoticeTimerRef.current = null;
		}, 8000);
	}, []);

	const resetLayout = useCallback(() => {
		const previousPins = layoutPinsRef.current;
		const previousCount = Object.keys(previousPins).length;
		engineRef.current?.resetLayout();
		if (previousCount === 0) {
			setResetNotice(null);
			return;
		}
		setResetNotice({ pins: previousPins, count: previousCount });
		dismissResetNoticeLater();
	}, [dismissResetNoticeLater]);

	const undoResetLayout = useCallback(() => {
		const notice = resetNotice;
		if (!notice) return;
		if (resetNoticeTimerRef.current) window.clearTimeout(resetNoticeTimerRef.current);
		resetNoticeTimerRef.current = null;
		setResetNotice(null);
		void writePinsImmediately(notice.pins);
	}, [resetNotice, writePinsImmediately]);

	const playDiff = useCallback(async function run(diff: GraphDiff): Promise<void> {
		const engine = engineRef.current;
		if (!engine) {
			setAnimationState("queued");
			return;
		}
		setAnimationState("playing");
		await engine.applyDiff(diff);
		const decision = diffQueueRef.current.finishAnimation();
		if (decision.action === "consume" && decision.diff) {
			void run(decision.diff);
			return;
		}
		setAnimationState("idle");
	}, []);

	const enqueueDiff = useCallback(async (diff: GraphDiff) => {
		const queue = diffQueueRef.current;
		const engine = engineRef.current;
		queue.setVisible(status === "ready");
		if (engine?.isDragging()) queue.setDragging(true);
		const decision = queue.push(diff);
		if (decision.action === "consume" && decision.diff) {
			await playDiff(decision.diff);
		} else if (decision.snapshot.pending) {
			setAnimationState("queued");
		}
	}, [playDiff, status]);

	useEffect(() => {
		if (!hostRef.current || !data || dataKnowledgeBasePath !== currentKnowledgeBasePath) {
			engineRef.current?.destroy();
			engineRef.current = null;
			engineKbPathRef.current = null;
			engineDataRef.current = null;
			lastSelectionCommandRef.current = selectionCommand;
			return;
		}
		if (engineRef.current && engineKbPathRef.current === currentKnowledgeBasePath) {
			if (engineDataRef.current !== data) {
				engineRef.current.setData(data, layoutPinsRef.current);
				engineDataRef.current = data;
			} else {
				engineRef.current.setPins(layoutPinsRef.current);
			}
			engineRef.current.setAggregationMarkers(aggregationMarkers);
			return;
		}
		engineRef.current?.destroy();
		const engine = createGraphEngine(hostRef.current, {
			data,
			pins: layoutPinsRef.current,
			theme: graphThemeRef.current,
			aggregationMarkers,
			capabilities: createGraphWorkbenchCapabilities({
				onOpenPage: (payload) => onOpenPageRef.current?.(payload),
				onSelectionChange: (nextSelection) => onSelectionChangeRef.current?.(nextSelection),
				onSelectionClear: () => onSelectionChangeRef.current?.(null),
				onViewReset: () => onViewResetRef.current?.(),
				onAsk: (nextSelection) => onSelectionChangeRef.current?.(nextSelection),
				persistPins,
				onDragStateChange: (dragging) => {
					lastDragStateRef.current = dragging;
					const decision = diffQueueRef.current.setDragging(dragging);
					if (!dragging && decision.action === "consume" && decision.diff) {
						void playDiff(decision.diff);
					}
				},
				onVisibilityStateChange: (state) => onGraphVisibilityChangeRef.current?.(state),
			}).capabilities,
		});
		engineRef.current = engine;
		engineKbPathRef.current = currentKnowledgeBasePath;
		engineDataRef.current = data;
	}, [aggregationMarkers, currentKnowledgeBasePath, data, dataKnowledgeBasePath, persistPins, playDiff, selectionCommand]);

	useEffect(() => {
		engineRef.current?.setTheme(graphTheme);
	}, [graphTheme]);

	useEffect(() => {
		if (!selectionCommand || status !== "ready") return;
		if (lastSelectionCommandRef.current === selectionCommand) return;
		lastSelectionCommandRef.current = selectionCommand;
		if (selectionCommand.type === "clear") {
			engineRef.current?.clearInteraction();
			onSelectionChangeRef.current?.(null);
		}
		if (selectionCommand.type === "clear-selection") {
			engineRef.current?.clearSelection();
			onSelectionChangeRef.current?.(null);
		}
		if (selectionCommand.type === "neighbors") {
			const selected = engineRef.current?.select({ kind: "neighbors", id: selectionCommand.id });
			if (selected) onSelectionChangeRef.current?.(selected);
		}
		if (selectionCommand.type === "enter-community") {
			const selected = engineRef.current?.focusCommunity(selectionCommand.id);
			if (selected) onSelectionChangeRef.current?.(selected);
		}
		if (selectionCommand.type === "enter-community-node") {
			const selected = engineRef.current?.select({ kind: "node", id: selectionCommand.nodeId });
			engineRef.current?.focusCommunity(selectionCommand.id);
			if (selected) onSelectionChangeRef.current?.(selected);
		}
		if (selectionCommand.type === "preview-node") {
			engineRef.current?.previewNode(selectionCommand.nodeId);
		}
		if (selectionCommand.type === "set-fixed-position") {
			engineRef.current?.setNodeFixed(selectionCommand.nodeId, selectionCommand.mode);
		}
		if (selectionCommand.type === "show-temporary-object") {
			engineRef.current?.showTemporaryObject(selectionCommand.object);
		}
		if (selectionCommand.type === "clear-temporary-object-display") {
			engineRef.current?.clearTemporaryObjectDisplay();
		}
	}, [selectionCommand, status]);

	useEffect(() => {
		if (
			!data
			|| status !== "ready"
			|| !engineRef.current
			|| !pendingAnimation
			|| animationReadyToken !== pendingAnimation.token
		) return;
		const diff = pendingAnimation.diff;
		setPendingAnimation(null);
		void enqueueDiff(diff);
	}, [animationReadyToken, data, enqueueDiff, pendingAnimation, status]);

	useEffect(() => {
		const decision = diffQueueRef.current.setVisible(status === "ready");
		if (decision.action === "consume" && decision.diff) {
			void playDiff(decision.diff);
		} else if (decision.snapshot.pending) {
			setAnimationState("queued");
		}
	}, [playDiff, status]);

	useEffect(() => {
		if (!pendingDiff) return;
		const token = ++animationTokenRef.current;
		lastRefreshTokenRef.current = refreshToken;
		setAnimationState("queued");
		setPendingAnimation({
			token,
			diff: pendingDiff,
		});
		return runWhenDragIdle(() => {
			void loadGraph().then((loaded) => {
				if (!loaded) return;
				setAnimationReadyToken(token);
				onDiffConsumed?.();
			});
		});
	}, [loadGraph, onDiffConsumed, pendingDiff, refreshToken, runWhenDragIdle]);

	useEffect(() => {
		if (pendingDiff) return;
		if (lastRefreshTokenRef.current === refreshToken) return;
		lastRefreshTokenRef.current = refreshToken;
		return runWhenDragIdle(() => {
			void loadGraph();
		});
	}, [loadGraph, pendingDiff, refreshToken, runWhenDragIdle]);

	useEffect(() => {
		if (!focusPath || !engineRef.current || status !== "ready") return;
		engineRef.current.focusNode(focusPath);
	}, [data, focusPath, status]);

	useEffect(() => {
		if (!import.meta.env?.DEV || !data || !engineRef.current || status !== "ready") return;
		const params = new URLSearchParams(window.location.search);
		const mode = params.get("graphTest");
		if (mode !== "reduced" && mode !== "motion") return;
		const key = `${mode}:${data.meta.build_date}:${data.nodes.length}:${data.edges.length}`;
		if (devGraphTestRef.current === key) return;
		devGraphTestRef.current = key;
		const diff = sampleDiffForGraphTest(data);
		void engineRef.current.applyDiff(diff, {
			reducedMotion: mode === "reduced",
			durationMs: mode === "motion" ? 650 : undefined,
		});
	}, [data, status]);

	const hasReadyGraph = status === "ready" && data;
	return (
		<div className="graph-screen" data-graph-status={status} data-graph-theme={graphTheme} data-graph-animation={animationState}>
			<div className="graph-shell">
				<header className="graph-shell-toolbar" aria-label="图谱工具栏">
					<div className="graph-shell-toolbar-left">
						<span className={cn("graph-shell-toolbar-dot", status === "building" && "graph-shell-toolbar-dot-warn", status === "error" && "graph-shell-toolbar-dot-error")} />
						<div className="graph-shell-toolbar-title">
							<span>{currentKnowledgeBaseName ?? "未选择知识库"}</span>
							<small>图谱活地图</small>
						</div>
						<span className="graph-shell-toolbar-chip">{statusLabel(status)}</span>
						{hasReadyGraph && (
							<span className="graph-shell-toolbar-chip graph-shell-toolbar-chip-muted">
								{data.nodes.length} 节点 · {data.edges.length} 关联
							</span>
						)}
						<div className="graph-shell-legend" aria-label="图谱图例">
							<span><span className="graph-legend-dot graph-legend-dot-node" />节点</span>
							<span><span className="graph-legend-line" />关系</span>
							<span><span className="graph-legend-cloud" />社区</span>
						</div>
					</div>
					<div className="graph-shell-toolbar-actions">
						<button
							type="button"
							className="graph-shell-toolbar-button"
							onClick={resetLayout}
							disabled={!currentKnowledgeBasePath || status !== "ready"}
							title="重置布局"
						>
							<RotateCcw />
							重置布局
						</button>
						<button
							type="button"
							className="graph-shell-toolbar-button"
							onClick={() => {
								const kbPath = activeKbPathRef.current;
								if (!kbPath) return;
								setStatus("building");
								void rebuildGraph(kbPath)
									.then((next) => {
										if (activeKbPathRef.current === kbPath) setBuildState(next);
									})
									.catch((err) => {
										if (activeKbPathRef.current !== kbPath) return;
										setStatus("error");
										setError(err instanceof Error ? err.message : String(err));
									});
							}}
							disabled={!currentKnowledgeBasePath || status === "building"}
							title="重新构建图谱"
						>
							<RefreshCw className={cn(status === "building" && "animate-spin")} />
							重构
						</button>
					</div>
				</header>

				<div className="graph-stage">
					<div ref={hostRef} className={cn("graph-host", !data && "graph-host-empty")} />
					{status !== "ready" && (
						<div className="graph-state" data-testid="graph-state">
							<div className="graph-state-title">{statusTitle(status)}</div>
							<div className="graph-state-copy">
								{statusCopy(status, Boolean(currentKnowledgeBasePath), buildState, error)}
							</div>
						</div>
					)}
					{animationState !== "idle" && (
						<div className="graph-growth-indicator" data-testid="graph-growth-indicator">
							{animationState === "playing" ? "图谱更新中" : "图谱更新待播放"}
						</div>
					)}
					{resetNotice && (
						<div className="graph-toast" role="status">
							<span>已重置 {resetNotice.count} 个钉位</span>
							<button type="button" onClick={undoResetLayout}>
								撤销
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function statusLabel(status: GraphStatusKind): string {
	if (status === "idle") return "空闲";
	if (status === "loading") return "读取中";
	if (status === "building") return "构建中";
	if (status === "ready") return "就绪";
	if (status === "error") return "错误";
	return status;
}

function statusTitle(status: GraphStatusKind): string {
	if (status === "idle") return "选择知识库后查看图谱";
	if (status === "loading") return "正在读取图谱";
	if (status === "building") return "图谱构建中";
	if (status === "error") return "图谱暂时不可用";
	return "";
}

function statusCopy(
	status: GraphStatusKind,
	hasKnowledgeBase: boolean,
	buildState: "none" | "started" | "queued",
	error: string | null,
): string {
	if (!hasKnowledgeBase) return "左侧选择一个知识库后，这里会显示它的图谱活地图。";
	if (status === "loading") return "正在读取当前知识库的图谱数据。";
	if (status === "building") {
		return buildState === "queued"
			? "已有构建在进行，新的构建请求已排队。"
			: "还没有图谱数据，正在后台构建。完成后会自动刷新。";
	}
	if (status === "error") return error ?? "请稍后重试。";
	return "";
}

function graphStatusSummary(
	status: GraphStatusKind,
	hasKnowledgeBase: boolean,
	buildState: "none" | "started" | "queued",
	error: string | null,
	data: GraphData | null,
	animationState: GraphStatusSnapshot["animation"],
): string {
	if (status === "ready" && data) {
		if (animationState === "playing") return "图谱更新动画播放中";
		if (animationState === "queued") return "图谱更新等待播放";
		return `${data.nodes.length} 节点 · ${data.edges.length} 关联`;
	}
	return statusCopy(status, hasKnowledgeBase, buildState, error);
}

function sampleDiffForGraphTest(data: GraphData): GraphDiff {
	const node = data.nodes[0];
	const edge = data.edges[0];
	const community = node?.community ? String(node.community) : null;
	return {
		addedNodes: node ? [node.id] : [],
		removedNodes: [],
		recoloredNodes: [],
		addedEdges: edge ? [edge.id] : [],
		removedEdges: [],
		newCommunities: community ? [community] : [],
		stats: {
			nodeCount: data.nodes.length,
			edgeCount: data.edges.length,
			communityCount: new Set(data.nodes.map((item) => item.community).filter(Boolean)).size,
		},
	};
}
