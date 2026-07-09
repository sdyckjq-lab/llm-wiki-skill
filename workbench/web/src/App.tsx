import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import {
	resolveSelection,
	type GraphData,
	type GraphDiff,
	type GraphOpenPagePayload,
	type GraphSummaryCommand,
	type GraphSummaryObjectRef,
	type GraphVisibilityState,
	type PinMap,
	type Selection,
} from "@llm-wiki/graph-engine";

import { BatchDigestPanel, type BatchDigestJob } from "@/components/BatchDigestPanel";
import { AppearancePanel } from "@/components/AppearancePanel";
import { ChatPanel } from "@/components/ChatPanel";
import { GraphPanel } from "@/components/GraphPanel";
import { MainViewTabs, type MainView } from "@/components/MainViewTabs";
import { RightDrawer } from "@/components/RightDrawer";
import { SearchPanel } from "@/components/SearchPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
	type ActiveContext,
	type ConversationInfo,
	createNewConversation,
	type ArtifactManifest,
	getActiveContext,
	type KnowledgeBaseInfo,
	listArtifacts,
	listConversations,
	listKnowledgeBases,
	listRefs,
	type ModelRef,
	type PageRef,
	registerExternalKnowledgeBase,
	readPage,
	selectConversation,
	selectKnowledgeBase,
	streamBatchDigest,
	type GraphEvent,
	type UIMessage,
} from "@/lib/api";
import {
	artifactDrawer,
	closedDrawer,
	type DrawerState,
	graphCommunitySummaryDrawer,
	graphReaderDrawer,
	graphSelectionDrawer,
	shouldApplyGraphReaderResult,
	wikiDrawer,
} from "@/lib/drawer-state";
import type { GraphReaderActionId } from "@/lib/graph-reader";
import { buildSelectionPromptPayload } from "@/lib/graph-selection";
import { graphCloseCommandForDrawer, shouldCloseDrawerAfterGraphSelectionClear } from "@/lib/graph-drawer-close";
import {
	drawerAfterGraphDataRefresh,
	drawerForGraphNodeVisibility,
	graphReaderFilteredHidden,
	graphReaderStaleAfterRefresh,
	sameGraphDrawerTarget,
	temporaryObjectAfterGraphDataRefresh,
	visibilityWithTemporaryObject,
} from "@/lib/graph-data-refresh";
import {
	graphCommunityDrawerViewModel,
	graphGroupDrawerPromptAction,
	graphSelectionGroupDrawerViewModel,
} from "@/lib/graph-group-drawer";
import {
	drawerForGraphSelection,
	drawerForGraphSummaryNode,
	graphOpenPagePayloadForCommand,
	graphSelectionCommandForOpenDetail,
	graphSelectionCommandForSummaryCommand,
	type GraphSelectionCommand,
} from "@/lib/graph-summary-actions";
import {
	COMMUNITY_ENTER_EXIT_DURATION_MS,
	planCommunityEnterExit,
} from "@/lib/graph-community-enter";
import { useDrawerExitRail } from "@/lib/use-drawer-exit-rail";
import { WIKI_LINK_SEEN_EVENT } from "@/lib/wiki-links";
import {
	applyAppearance,
	mergeAppearance,
	readAppearance,
	writeAppearance,
	type AppearancePrefs,
	type ThemeMode,
} from "@/lib/appearance";
import {
	DEFAULT_CHAT_STATUS,
	DEFAULT_GRAPH_STATUS,
	type ChatStatusSnapshot,
	type GraphStatusSnapshot,
} from "@/lib/view-status";
import {
	DEFAULT_DRAWER_WIDTH,
	clampDrawerWidthForViewport,
	sidebarLayoutWidth,
} from "@/lib/drawer-layout";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "llm-wiki-agent-sidebar-collapsed";
const DRAWER_WIDTH_STORAGE_KEY = "llm-wiki-agent-drawer-width";
const MAIN_VIEW_STORAGE_KEY = "llm-wiki-agent-main-view";
const SEARCH_REF_LIMIT = 5000;

function getSidebarLayoutWidth(collapsed: boolean): number {
	if (typeof window === "undefined") return 0;
	return sidebarLayoutWidth(collapsed, window.innerWidth);
}

function clampDrawerWidth(width: number, sidebarCollapsed: boolean): number {
	if (typeof window === "undefined") return DEFAULT_DRAWER_WIDTH;
	return clampDrawerWidthForViewport(width, {
		viewportWidth: window.innerWidth,
		sidebarWidth: getSidebarLayoutWidth(sidebarCollapsed),
	});
}

/**
 * 阶段一 step 8 - 阶段一完结
 *
 * Layout:
 *   [TopBar 预留]
 *   [Sidebar 知识库 + 对话列表] [ChatPanel/GraphPanel 主区] [RightDrawer]
 *
 * 切库联动：
 *   1. POST /api/knowledge-base → 后端自动选/新建该库最近对话
 *   2. 拿到 active 后刷新 conversations 列表
 *   3. chatKey++ 让 ChatPanel 重挂载（载入历史消息）
 *
 * 切对话联动：
 *   1. POST /api/conversations { kbPath, conversationId }
 *   2. ChatPanel 重挂载
 *
 * 新建对话：
 *   1. POST /api/conversations/new
 *   2. 刷新 conversations 列表（含合成 stub）
 *   3. ChatPanel 重挂载
 */
function App() {
	const [appearance, setAppearance] = useState(readAppearance);
	const theme: ThemeMode = appearance.theme;
	const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
		if (typeof window === "undefined") return false;
		return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
	});
	const [drawerWidth, setDrawerWidthState] = useState(() => {
		if (typeof window === "undefined") return DEFAULT_DRAWER_WIDTH;
		const stored = window.localStorage.getItem(DRAWER_WIDTH_STORAGE_KEY);
		if (!stored) return clampDrawerWidth(DEFAULT_DRAWER_WIDTH, sidebarCollapsed);
		const raw = Number(stored);
		return Number.isFinite(raw) ? clampDrawerWidth(raw, sidebarCollapsed) : DEFAULT_DRAWER_WIDTH;
	});
	const [kbs, setKbs] = useState<KnowledgeBaseInfo[]>([]);
	const [active, setActive] = useState<ActiveContext | null>(null);
	const [conversations, setConversations] = useState<ConversationInfo[]>([]);
	const [sidebarError, setSidebarError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [chatKey, setChatKey] = useState(0);
	const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [appearanceOpen, setAppearanceOpen] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchRefs, setSearchRefs] = useState<PageRef[]>([]);
	const [searchRefsLoading, setSearchRefsLoading] = useState(false);
	const [searchRefsError, setSearchRefsError] = useState<string | null>(null);
	const [chatStatus, setChatStatus] = useState<ChatStatusSnapshot>(DEFAULT_CHAT_STATUS);
	const [graphStatus, setGraphStatus] = useState<GraphStatusSnapshot>(DEFAULT_GRAPH_STATUS);
	const [artifacts, setArtifacts] = useState<ArtifactManifest[]>([]);
	const [drawerFullscreen, setDrawerFullscreen] = useState(false);
	// 进入社区退场轨道（#120）：exit 期间保留社区摘要挂载做退场，结束后落回 closed。
	const {
		drawer,
		setDrawer,
		isExiting: drawerExitIsExiting,
		stage: stageDrawerExit,
		complete: handleDrawerExitComplete,
		isProtected: isDrawerExitProtected,
	} = useDrawerExitRail();
	const [batchJob, setBatchJob] = useState<BatchDigestJob | null>(null);
	const [pendingGraphPrompt, setPendingGraphPrompt] = useState<{
		id: string;
		message: string;
		displayText: string;
	} | null>(null);
	const [pendingInsertRef, setPendingInsertRef] = useState<{ id: string; path: string } | null>(null);
	const [graphFocusPath, setGraphFocusPath] = useState<string | null>(null);
	const [pendingGraphDiff, setPendingGraphDiff] = useState<GraphDiff | null>(null);
	const [graphRefreshToken, setGraphRefreshToken] = useState(0);
	const [graphHasPendingUpdate, setGraphHasPendingUpdate] = useState(false);
	const [graphBuildError, setGraphBuildError] = useState<Extract<GraphEvent, { type: "graph_error" }> | null>(null);
	const [graphData, setGraphData] = useState<GraphData | null>(null);
	const [graphPins, setGraphPins] = useState<PinMap>({});
	const [graphVisibilityState, setGraphVisibilityState] = useState<GraphVisibilityState | null>(null);
	const [graphTemporaryObject, setGraphTemporaryObject] = useState<GraphSummaryObjectRef | null>(null);
	const [selectionCommand, setSelectionCommand] = useState<GraphSelectionCommand | undefined>();
	const [mainView, setMainView] = useState<MainView>(() => {
		if (typeof window === "undefined") return "chat";
		return window.localStorage.getItem(MAIN_VIEW_STORAGE_KEY) === "graph" ? "graph" : "chat";
	});
	const mainViewRef = useRef(mainView);
	const graphTemporaryObjectRef = useRef<GraphSummaryObjectRef | null>(null);
	const activeConversationId = active?.conversation.id ?? null;

	useEffect(() => {
		applyAppearance(appearance);
		writeAppearance(appearance);
	}, [appearance]);

	const toggleTheme = useCallback(() => {
		setAppearance((value) => mergeAppearance(value, {
			theme: value.theme === "dark" ? "light" : "dark",
		}));
	}, []);

	const updateAppearance = useCallback((patch: Partial<AppearancePrefs>) => {
		setAppearance((value) => mergeAppearance(value, patch));
	}, []);

	useEffect(() => {
		window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
	}, [sidebarCollapsed]);

	useEffect(() => {
		window.localStorage.setItem(MAIN_VIEW_STORAGE_KEY, mainView);
		mainViewRef.current = mainView;
	}, [mainView]);

	useEffect(() => {
		if (!active?.kb.path) return;
		const events = new EventSource("/api/events");
		events.addEventListener("graph_updated", (message) => {
			const event = JSON.parse((message as MessageEvent).data) as GraphEvent;
			if (event.type !== "graph_updated" || event.kbPath !== active.kb.path) return;
			setGraphBuildError(null);
			setGraphRefreshToken((token) => token + 1);
			setPendingGraphDiff(event.diff);
			if (mainViewRef.current !== "graph" && event.diff) setGraphHasPendingUpdate(true);
		});
		events.addEventListener("graph_error", (message) => {
			const event = JSON.parse((message as MessageEvent).data) as GraphEvent;
			if (event.type === "graph_error" && event.kbPath === active.kb.path) {
				setSidebarError(event.message);
				setGraphBuildError(event);
			}
		});
		return () => events.close();
	}, [active?.kb.path]);

	useEffect(() => {
		if (mainView === "graph") setGraphHasPendingUpdate(false);
	}, [mainView]);

	useEffect(() => {
		graphTemporaryObjectRef.current = graphTemporaryObject;
	}, [graphTemporaryObject]);

	useEffect(() => {
		const handleWikiLinkSeenEvent = (event: Event) => {
			const path = (event as CustomEvent<string>).detail;
			if (typeof path === "string" && path.startsWith("wiki/")) setGraphFocusPath(path);
		};
		window.addEventListener(WIKI_LINK_SEEN_EVENT, handleWikiLinkSeenEvent);
		return () => window.removeEventListener(WIKI_LINK_SEEN_EVENT, handleWikiLinkSeenEvent);
	}, []);

	useEffect(() => {
		const handleResize = () => setDrawerWidthState((width) => clampDrawerWidth(width, sidebarCollapsed));
		handleResize();
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [sidebarCollapsed]);

	const setDrawerWidth = useCallback((width: number) => {
		setDrawerWidthState(() => {
			const next = clampDrawerWidth(width, sidebarCollapsed);
			window.localStorage.setItem(DRAWER_WIDTH_STORAGE_KEY, String(next));
			return next;
		});
	}, [sidebarCollapsed]);

	const refreshConversations = useCallback(async (kbPath: string) => {
		try {
			const items = await listConversations(kbPath);
			setConversations(items);
		} catch (err) {
			setSidebarError(err instanceof Error ? err.message : String(err));
		}
	}, []);

	const refreshAll = useCallback(async () => {
		setLoading(true);
		setSidebarError(null);
		try {
			const [items, currentActive] = await Promise.all([
				listKnowledgeBases(),
				getActiveContext(),
			]);
			setKbs(items);
			setActive(currentActive);
			if (currentActive) {
				setInitialMessages(currentActive.conversation.messages);
				setChatKey((k) => k + 1);
				await refreshConversations(currentActive.kb.path);
			} else {
				setInitialMessages([]);
				setConversations([]);
				setArtifacts([]);
				setGraphBuildError(null);
				setDrawer(closedDrawer());
			}
		} catch (err) {
			setSidebarError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [refreshConversations, setDrawer]);

	useEffect(() => {
		refreshAll();
	}, [refreshAll]);

	useEffect(() => {
		if (!activeConversationId) return;
		let cancelled = false;
		listArtifacts(activeConversationId)
			.then((items) => {
				if (cancelled) return;
				setArtifacts(items);
				setDrawer((current) => {
					if (current.mode !== "artifacts") return current;
					const activeArtifactId = current.activeArtifactId && items.some((item) => item.id === current.activeArtifactId)
						? current.activeArtifactId
						: items.at(-1)?.id ?? null;
					return artifactDrawer(items, activeArtifactId);
				});
			})
			.catch((err) => {
				if (!cancelled) setSidebarError(err instanceof Error ? err.message : String(err));
			});
		return () => {
			cancelled = true;
		};
	}, [activeConversationId, setDrawer]);

	const applyActive = (ctx: ActiveContext) => {
		setActive(ctx);
		setInitialMessages(ctx.conversation.messages);
		setChatKey((k) => k + 1);
		setChatStatus(DEFAULT_CHAT_STATUS);
		setGraphStatus(DEFAULT_GRAPH_STATUS);
		setDrawer(closedDrawer());
		setArtifacts([]);
		setPendingGraphDiff(null);
		setGraphBuildError(null);
		setGraphHasPendingUpdate(false);
		setGraphData(null);
		setGraphPins({});
		setSelectionCommand({ id: Math.random().toString(36).slice(2, 10), type: "clear" });
		setGraphFocusPath(null);
	};

	const handleSelectKb = async (item: KnowledgeBaseInfo) => {
		if (!item.valid) return;
		if (item.path === active?.kb.path) return;

		setSidebarError(null);
		try {
			const ctx = await selectKnowledgeBase(item.path);
			applyActive(ctx);
			await refreshConversations(item.path);
		} catch (err) {
			setSidebarError(err instanceof Error ? err.message : String(err));
		}
	};

	const handleSelectConversation = async (item: ConversationInfo) => {
		if (!active) return;
		setMainView("chat");
		if (item.id === active.conversation.id) return;

		setSidebarError(null);
		try {
			const ctx = await selectConversation(active.kb.path, item.id);
			applyActive(ctx);
			await refreshConversations(active.kb.path);
		} catch (err) {
			setSidebarError(err instanceof Error ? err.message : String(err));
		}
	};

	const handleNewConversation = async () => {
		if (!active) return;
		setMainView("chat");
		setSidebarError(null);
		try {
			const ctx = await createNewConversation(active.kb.path);
			applyActive(ctx);
			await refreshConversations(active.kb.path);
		} catch (err) {
			setSidebarError(err instanceof Error ? err.message : String(err));
		}
	};

	const handleAskSelection = async (input: { message: string; displayText: string; newConversation: boolean }) => {
		if (!active) return;
		setSidebarError(null);
		try {
			if (input.newConversation) {
				const ctx = await createNewConversation(active.kb.path);
				applyActive(ctx);
				await refreshConversations(active.kb.path);
			}
			setMainView("chat");
			setPendingGraphPrompt({
				id: Math.random().toString(36).slice(2, 10),
				message: input.message,
				displayText: input.displayText,
			});
		} catch (err) {
			setSidebarError(err instanceof Error ? err.message : String(err));
		}
	};

	const handleGraphSelectionChange = useCallback((selection: Selection | null) => {
		if (!selection) {
			setDrawer((current) => {
				// 退场轨道进行时，clearSelection 是 applyCommunityEnter 的副作用，
				// 抽屉关闭由退场轨道接管，这里不要硬切。
				if (isDrawerExitProtected(current)) return current;
				return shouldCloseDrawerAfterGraphSelectionClear(current) ? closedDrawer() : current;
			});
			return;
		}
		if (drawer.mode === "graph-reader" && selection.nodeIds.length === 1 && drawer.payload.node.id === selection.nodeIds[0]) {
			return;
		}
		setDrawer((current) => drawerForGraphSelection(graphData, selection, current, {
			pins: graphPins,
			selection: selection.input,
			searchResultIds: graphVisibilityState?.searchResultIds ?? [],
		}));
	}, [drawer, graphData, graphPins, graphVisibilityState, isDrawerExitProtected, setDrawer]);

	const handleGraphVisibilityChange = useCallback((state: GraphVisibilityState | null) => {
		setGraphVisibilityState(state);
		const nextTemporaryObject = temporaryObjectAfterGraphDataRefresh(graphData, state?.temporaryObject ?? null);
		graphTemporaryObjectRef.current = nextTemporaryObject;
		setGraphTemporaryObject(nextTemporaryObject);
		const effectiveState = visibilityWithTemporaryObject(state, nextTemporaryObject);
		setDrawer((current) => {
			if (current.mode === "graph-node-summary") {
				if (
					effectiveState?.temporaryObject?.kind === "node"
					&& effectiveState.temporaryObject.nodeId === current.payload.nodeId
					&& current.payload.commands.some((command) => command.kind === "clear-temporary-object-display")
				) {
					return current;
				}
				const next = drawerForGraphNodeVisibility(graphData, current.payload.nodeId, current, {
					pins: graphPins,
					visibility: effectiveState,
				});
				return sameGraphDrawerTarget(current, next) ? current : next;
			}
			if (current.mode === "graph-excluded-object" && current.payload.object.kind === "node") {
				const next = drawerForGraphNodeVisibility(graphData, current.payload.object.nodeId, current, {
					pins: graphPins,
					visibility: effectiveState,
				});
				return sameGraphDrawerTarget(current, next) ? current : next;
			}
			if (current.mode === "graph-reader") {
				const filteredHidden = graphReaderFilteredHidden(current.payload.node.id, effectiveState);
				return current.filteredHidden === filteredHidden ? current : { ...current, filteredHidden };
			}
			return current;
		});
	}, [graphData, graphPins, setDrawer]);

	const clearStaleGraphReaderFocus = useCallback(() => {
		setGraphFocusPath(null);
		setSelectionCommand({
			id: `clear-stale-reader-${Math.random().toString(36).slice(2, 10)}`,
			type: "clear-selection",
		});
	}, []);

	const handleGraphDataChange = useCallback((nextData: GraphData | null) => {
		setGraphData(nextData);
		const nextTemporaryObject = temporaryObjectAfterGraphDataRefresh(nextData, graphTemporaryObjectRef.current);
		graphTemporaryObjectRef.current = nextTemporaryObject;
		setGraphTemporaryObject(nextTemporaryObject);
		const effectiveState = visibilityWithTemporaryObject(graphVisibilityState, nextTemporaryObject);
		setDrawer((current) => {
			if (graphReaderStaleAfterRefresh(current, nextData, effectiveState)) clearStaleGraphReaderFocus();
			const next = drawerAfterGraphDataRefresh(current, nextData, {
				pins: graphPins,
				visibility: graphVisibilityState,
				temporaryObject: nextTemporaryObject,
			});
			return sameGraphDrawerTarget(current, next) ? current : next;
		});
	}, [clearStaleGraphReaderFocus, graphPins, graphVisibilityState, setDrawer]);

	const handleGraphViewReset = useCallback(() => {
		setGraphFocusPath(null);
		setDrawer((current) => (
			current.mode === "graph-reader"
				? drawerForGraphSummaryNode(graphData, current.payload.node.id, current, { pins: graphPins })
				: current
		));
	}, [graphData, graphPins, setDrawer]);

	const handleGraphSelectionTextChange = useCallback((value: string) => {
		setDrawer((current) => (
			current.mode === "graph-selection"
				? graphSelectionDrawer(current.selection, current.title, value)
				: current
		));
	}, [setDrawer]);

	const handleGraphSelectionAsk = (actionId: string | null, newConversation: boolean) => {
		if (!graphData || drawer.mode !== "graph-selection") return;
		const recommendedActionId = graphSelectionGroupDrawerViewModel(drawer.title, drawer.selection).recommendedActionId;
		const action = graphGroupDrawerPromptAction(actionId, recommendedActionId, drawer.freeText, newConversation);
		const payload = buildSelectionPromptPayload(graphData, drawer.selection, action, drawer.freeText);
		void handleAskSelection({
			message: payload.expandedText,
			displayText: payload.displayText,
			newConversation,
		});
		setDrawer(closedDrawer());
		setSelectionCommand({ id: Math.random().toString(36).slice(2, 10), type: "clear" });
	};

	const handleGraphCommunityTextChange = useCallback((value: string) => {
		setDrawer((current) => (
			current.mode === "graph-community-summary"
				? graphCommunitySummaryDrawer(current.payload, value)
				: current
		));
	}, [setDrawer]);

	const handleGraphCommunityAsk = (actionId: string | null, newConversation: boolean) => {
		if (!graphData || drawer.mode !== "graph-community-summary") return;
		const selection = resolveSelection(graphData, { kind: "community", id: drawer.payload.communityId });
		const recommendedActionId = graphCommunityDrawerViewModel(drawer.payload).recommendedActionId;
		const action = graphGroupDrawerPromptAction(actionId, recommendedActionId, drawer.freeText, newConversation);
		const payload = buildSelectionPromptPayload(graphData, selection, action, drawer.freeText);
		void handleAskSelection({
			message: payload.expandedText,
			displayText: payload.displayText,
			newConversation,
		});
		setDrawer(closedDrawer());
		setSelectionCommand({ id: Math.random().toString(36).slice(2, 10), type: "clear" });
	};

	const handleGraphReaderAction = (actionId: GraphReaderActionId) => {
		if (drawer.mode !== "graph-reader") return;
		if (actionId === "find_related_pages") {
			setSelectionCommand({
				id: drawer.payload.node.id,
				type: "neighbors",
			});
			return;
		}
		if (!graphData) return;
		const selection = resolveSelection(graphData, { kind: "node", id: drawer.payload.node.id });
		const action = selection.actions?.find((item) => item.id === actionId) ?? null;
		const payload = buildSelectionPromptPayload(graphData, selection, action, "");
		void handleAskSelection({
			message: payload.expandedText,
			displayText: payload.displayText,
			newConversation: false,
		});
		setDrawer(closedDrawer());
		setSelectionCommand({ id: Math.random().toString(36).slice(2, 10), type: "clear" });
	};

	const handleCloseDrawer = useCallback((reason: "button" | "escape") => {
		setDrawer((current) => {
			const clearCommand = graphCloseCommandForDrawer(current, reason);
			if (clearCommand) {
				setSelectionCommand(clearCommand);
				setGraphFocusPath(null);
				if (clearCommand.type === "select-community-summary") return current;
			}
			return closedDrawer();
		});
	}, [setDrawer]);

	const handleAddExternal = async (path: string) => {
		const { info } = await registerExternalKnowledgeBase(path);
		await refreshAll();
		if (info.valid) await handleSelectKb(info);
	};

	const handleMessageSent = async () => {
		// 用户发了一次消息后，刷新对话列表，把 "(新对话)" stub 替换为带 firstMessage 的真实条目
		if (active) await refreshConversations(active.kb.path);
	};

	const handleOpenPage = async (pagePath: string) => {
		if (!active) return;
		const normalizedPagePath = toRelativePagePath(pagePath, active.kb.path) ?? pagePath;
		if (normalizedPagePath.startsWith("wiki/")) setGraphFocusPath(normalizedPagePath);
		setDrawer(wikiDrawer(normalizedPagePath, { loading: true }));
		try {
			const content = await readPage(active.kb.path, normalizedPagePath);
			setDrawer(wikiDrawer(normalizedPagePath, { content }));
		} catch (err) {
			setDrawer(wikiDrawer(normalizedPagePath, { error: err instanceof Error ? err.message : String(err) }));
		}
	};

	const handleOpenGraphPage = useCallback(async (
		payload: GraphOpenPagePayload,
		options: { syncGraphFocus?: boolean } = {},
	) => {
		if (!active) return;
		const syncGraphFocus = options.syncGraphFocus ?? true;
		const normalizedPagePath = toRelativePagePath(payload.path, active.kb.path) ?? payload.path;
		const normalizedPayload = {
			...payload,
			path: normalizedPagePath,
			node: {
				...payload.node,
				sourcePath: toRelativePagePath(payload.node.sourcePath, active.kb.path) ?? payload.node.sourcePath,
			},
		};
		if (syncGraphFocus && normalizedPagePath.startsWith("wiki/")) setGraphFocusPath(normalizedPagePath);
		setDrawer(graphReaderDrawer(normalizedPayload, { loading: true }, {
			filteredHidden: graphReaderFilteredHidden(normalizedPayload.node.id, graphVisibilityState),
		}));
		try {
			const content = await readPage(active.kb.path, normalizedPagePath);
			setDrawer((current) => (
				current.mode === "graph-reader" && shouldApplyGraphReaderResult(current, normalizedPayload)
					? graphReaderDrawer(normalizedPayload, { content }, { filteredHidden: current.filteredHidden })
					: current
			));
		} catch (err) {
			setDrawer((current) => (
				current.mode === "graph-reader" && shouldApplyGraphReaderResult(current, normalizedPayload)
					? graphReaderDrawer(normalizedPayload, { error: err instanceof Error ? err.message : String(err) }, { filteredHidden: current.filteredHidden })
				: current
			));
		}
	}, [active, graphVisibilityState, setDrawer]);

	const handleGraphSummaryCommand = useCallback((command: GraphSummaryCommand) => {
		if (command.kind === "open-detail-read" || command.kind === "enter-node-community") {
			const payload = graphOpenPagePayloadForCommand(graphData, command);
			const focusCommand = command.kind === "open-detail-read"
				? graphSelectionCommandForOpenDetail(graphData, command)
				: graphSelectionCommandForSummaryCommand(command);
			if (focusCommand?.type === "enter-community-node") {
				setSelectionCommand({
					commandId: `open-detail-${command.nodeId}-${Math.random().toString(36).slice(2, 10)}`,
					id: focusCommand.id,
					nodeId: focusCommand.nodeId,
					type: "enter-community-node",
				});
			}
			if (payload) void handleOpenGraphPage(payload, { syncGraphFocus: focusCommand?.type !== "enter-community-node" });
			return;
		}
		if (command.kind === "enter-community") {
			// 进入社区是一段连续过渡：社区摘要退场、画布平滑扩展，镜头复用 #118 的
			// Sigma 视图过渡基座继续推进到社区阅读近景。这里只编排工作台侧——下发的
			// enter-community 命令触发 GraphPanel.applyCommunityEnter（clearSelection /
			// setSourceCommunityContext / focusCommunity），相机过渡由 spotlight camera
			// 承担，不另写接管逻辑。减少动态效果下跳过退场，抽屉直接落回 closed。
			// 副作用写在 setDrawer updater 外：updater 必须纯（React 19 StrictMode 会
			// 双调用 updater），drawer 从闭包读取（callback 已依赖 drawer，始终最新）。
			const plan = planCommunityEnterExit({
				communityId: command.communityId,
				drawer,
				reducedMotion: prefersReducedMotion(),
			});
			setSelectionCommand(plan.selectionCommand);
			stageDrawerExit(plan.exit ? plan.exit.drawer : null);
			setDrawer(plan.exit ? drawer : closedDrawer());
			return;
		}
		if (command.kind === "select-neighbors") {
			const neighborsCommand = graphSelectionCommandForSummaryCommand(command);
			if (neighborsCommand) setSelectionCommand(neighborsCommand);
			return;
		}
		if (command.kind === "set-fixed-position") {
			setSelectionCommand({
				id: `${command.mode}-${command.nodeId}-${Math.random().toString(36).slice(2, 10)}`,
				nodeId: command.nodeId,
				mode: command.mode,
				type: "set-fixed-position",
			});
			return;
		}
		if (command.kind === "show-this-object") {
			graphTemporaryObjectRef.current = command.object;
			setGraphTemporaryObject(command.object);
			setSelectionCommand({
				id: `show-${Math.random().toString(36).slice(2, 10)}`,
				object: command.object,
				type: "show-temporary-object",
			});
			if (command.object.kind === "node") {
				const nodeId = command.object.nodeId;
				const temporaryObject = command.object;
				setDrawer((current) => {
					const next = drawerForGraphNodeVisibility(graphData, nodeId, current, {
						pins: graphPins,
						visibility: {
							searchQuery: graphVisibilityState?.searchQuery ?? "",
							searchResultIds: graphVisibilityState?.searchResultIds ?? [],
							typeFilters: graphVisibilityState?.typeFilters ?? {},
							temporaryObject,
							focusCommunityId: graphVisibilityState?.focusCommunityId ?? null,
							hiddenReadingNodeId: graphVisibilityState?.hiddenReadingNodeId ?? null,
						},
					});
					return sameGraphDrawerTarget(current, next) ? current : next;
				});
			}
			return;
		}
		if (command.kind === "clear-temporary-object-display") {
			graphTemporaryObjectRef.current = null;
			setGraphTemporaryObject(null);
			setSelectionCommand({
				id: `clear-temporary-${Math.random().toString(36).slice(2, 10)}`,
				type: "clear-temporary-object-display",
			});
			setDrawer((current) => {
				if (current.mode !== "graph-node-summary") return current;
				const next = drawerForGraphNodeVisibility(graphData, current.payload.nodeId, current, {
					pins: graphPins,
					visibility: graphVisibilityState ? { ...graphVisibilityState, temporaryObject: null } : null,
				});
				return sameGraphDrawerTarget(current, next) ? current : next;
			});
		}
	}, [drawer, graphData, graphPins, graphVisibilityState, handleOpenGraphPage, setDrawer, stageDrawerExit]);

	useEffect(() => {
		const nextTemporaryObject = temporaryObjectAfterGraphDataRefresh(graphData, graphTemporaryObjectRef.current);
		graphTemporaryObjectRef.current = nextTemporaryObject;
		setGraphTemporaryObject(nextTemporaryObject);
		const effectiveState = visibilityWithTemporaryObject(graphVisibilityState, nextTemporaryObject);
		setDrawer((current) => {
			if (!isGraphInteractionDrawer(current)) return current;
			// 退场轨道进行时，进入社区会带新一轮 visibility state；这里不要重建抽屉对象，
			// 否则 drawer 引用变化会让 drawer === drawerExit 失败、退场中断。
			if (isDrawerExitProtected(current)) return current;
			if (graphReaderStaleAfterRefresh(current, graphData, effectiveState)) clearStaleGraphReaderFocus();
			return drawerAfterGraphDataRefresh(current, graphData, {
				pins: graphPins,
				visibility: graphVisibilityState,
				temporaryObject: nextTemporaryObject,
			});
		});
	}, [clearStaleGraphReaderFocus, graphData, graphPins, graphVisibilityState, isDrawerExitProtected, setDrawer]);

	const handleGraphSummaryNodeSelect = useCallback((nodeId: string) => {
		setDrawer((current) => drawerForGraphSummaryNode(graphData, nodeId, current, { pins: graphPins }));
	}, [graphData, graphPins, setDrawer]);

	const handleGraphSummaryReturnCommunity = useCallback((communityId: string) => {
		setSelectionCommand({
			id: communityId,
			type: "select-community-summary",
		});
	}, []);

	const handleGraphSummaryNodePreview = useCallback((nodeId: string | null) => {
		setSelectionCommand({
			id: `${nodeId ?? "clear"}-${Math.random().toString(36).slice(2, 10)}`,
			nodeId,
			type: "preview-node",
		});
	}, []);

	const handleWikiLinkSeen = useCallback((pagePath: string) => {
		setGraphFocusPath(pagePath);
	}, []);

	const refreshArtifacts = async (conversationId: string, focusId?: string) => {
		const items = await listArtifacts(conversationId);
		setArtifacts(items);
		setDrawer(artifactDrawer(items, focusId ?? items.at(-1)?.id ?? null));
	};

	const handleOpenArtifacts = () => {
		if (artifacts.length === 0) return;
		const current = drawer.mode === "artifacts" ? drawer.activeArtifactId : null;
		setDrawer(artifactDrawer(
			artifacts,
			current && artifacts.some((item) => item.id === current) ? current : artifacts.at(-1)?.id ?? null,
		));
	};

	const handleArtifactCreated = async (id: string) => {
		if (!active) return;
		try {
			await refreshArtifacts(active.conversation.id, id);
		} catch (err) {
			setSidebarError(err instanceof Error ? err.message : String(err));
		}
	};

	const handleStartBatchDigest = (input: {
		kbPath: string;
		filePaths: string[];
		sourceScanId?: string;
		digestModel?: ModelRef | null;
		concurrency: 1 | 3 | 5;
	}) => {
		const jobId = Math.random().toString(36).slice(2, 10);
		setBatchJob({
			id: jobId,
			kbPath: input.kbPath,
			status: "running",
			total: input.filePaths.length,
			completed: 0,
			failed: 0,
			files: input.filePaths.map((filePath, index) => ({
				index,
				filePath,
				status: "queued",
			})),
			events: [],
		});
		void (async () => {
			try {
				const stream = await streamBatchDigest(input);
				for await (const message of stream) {
					if (message.event === "error") {
						const payload = JSON.parse(message.data) as { message: string };
						throw new Error(payload.message);
					}
					const event = JSON.parse(message.data);
					setBatchJob((current) => {
						if (!current || current.id !== jobId) return current;
						if (event.type === "start") {
							return {
								...current,
								total: event.total,
								outputDir: event.outputDir,
								events: [...current.events, event],
							};
						}
						if (event.type === "file_start") {
							return {
								...current,
								current: event.filePath,
								files: updateBatchFile(current.files, event.index, {
									status: "running",
								}),
								events: [...current.events, event],
							};
						}
						if (event.type === "file_progress") {
							return {
								...current,
								files: updateBatchFile(current.files, event.index, {
									status: "running",
									chars: event.chars,
								}),
								events: [...current.events, event],
							};
						}
						if (event.type === "file_complete") {
							return {
								...current,
								completed: current.completed + 1,
								current: event.filePath,
								files: updateBatchFile(current.files, event.index, {
									status: "done",
									outputPath: event.outputPath,
								}),
								events: [...current.events, event],
							};
						}
						if (event.type === "file_error") {
							return {
								...current,
								failed: current.failed + 1,
								current: event.filePath,
								files: updateBatchFile(current.files, event.index, {
									status: "error",
									error: event.error,
								}),
								events: [...current.events, event],
							};
						}
						if (event.type === "done") {
							return {
								...current,
								status: "done",
								completed: event.completed,
								failed: event.failed,
								outputDir: event.outputDir,
								events: [...current.events, event],
							};
						}
						return current;
					});
				}
			} catch (err) {
				setBatchJob((current) =>
					current && current.id === jobId
						? {
								...current,
								status: "error",
								error: err instanceof Error ? err.message : String(err),
							}
						: current,
				);
			}
		})();
	};

	const handleOpenBatchOutput = async (outputPath: string) => {
		if (!batchJob) return;
		const rel = toRelativePagePath(outputPath, batchJob.kbPath);
		if (!rel) return;
		setDrawer(wikiDrawer(rel, { loading: true }));
		try {
			const content = await readPage(batchJob.kbPath, rel);
			setDrawer(wikiDrawer(rel, { content }));
		} catch (err) {
			setDrawer(wikiDrawer(rel, { error: err instanceof Error ? err.message : String(err) }));
		}
	};

	const handleConfigChanged = async () => {
		try {
			const currentActive = await getActiveContext();
			setActive(currentActive);
			if (currentActive) {
				setInitialMessages(currentActive.conversation.messages);
			}
		} catch (err) {
			setSidebarError(err instanceof Error ? err.message : String(err));
		}
	};

	const activeKnowledgeBase: KnowledgeBaseInfo | null = active?.kb
		? kbs.find((kb) => kb.path === active.kb.path) ?? {
				path: active.kb.path,
				name: active.kb.name,
				origin: "default",
				valid: true,
			}
		: null;

	useEffect(() => {
		if (!active?.kb.path) {
			setSearchRefs([]);
			setSearchRefsError(null);
			setSearchRefsLoading(false);
			return;
		}
		let cancelled = false;
		setSearchRefsLoading(true);
		setSearchRefsError(null);
		listRefs(active.kb.path, "", SEARCH_REF_LIMIT)
			.then((items) => {
				if (!cancelled) setSearchRefs(items);
			})
			.catch((err) => {
				if (!cancelled) {
					setSearchRefs([]);
					setSearchRefsError(err instanceof Error ? err.message : String(err));
				}
			})
			.finally(() => {
				if (!cancelled) setSearchRefsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [active?.kb.path]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
			if (event.defaultPrevented) return;
			event.preventDefault();
			if (activeKnowledgeBase?.valid) setSearchOpen(true);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [activeKnowledgeBase?.valid]);

	const drawerOpen = drawer.mode !== "closed";
	const graphDrawerOverlay = mainView === "graph" && isGraphInteractionDrawer(drawer) && !drawerFullscreen;
	const appBodyStyle = { "--drawer-width": `${drawerWidth}px` } as CSSProperties;

	return (
		<TooltipProvider delayDuration={200}>
			<div className="app-shell">
				<TopBar
					knowledgeBase={activeKnowledgeBase}
					model={active?.model ?? null}
					theme={theme}
					chatStatus={chatStatus}
					graphStatus={graphStatus}
					appearanceOpen={appearanceOpen}
					searchDisabled={!activeKnowledgeBase?.valid}
					modelDisabled={loading}
					newConversationDisabled={loading}
					onSearch={() => setSearchOpen(true)}
					onConfigChanged={handleConfigChanged}
					onNewConversation={handleNewConversation}
					onToggleTheme={toggleTheme}
					onOpenAppearance={() => setAppearanceOpen((value) => !value)}
				/>
				<div
					className="app-body"
					data-drawer-open={drawerOpen ? "true" : "false"}
					data-graph-drawer-overlay={graphDrawerOverlay ? "true" : "false"}
					style={appBodyStyle}
				>
					<Sidebar
						knowledgeBases={kbs}
						currentKbPath={active?.kb.path ?? null}
						conversations={conversations}
						currentConversationId={active?.conversation.id ?? null}
						error={sidebarError}
						collapsed={sidebarCollapsed}
						activeView={mainView}
						onSelectKb={handleSelectKb}
						onSelectConversation={handleSelectConversation}
						onSelectView={setMainView}
						onNewConversation={handleNewConversation}
						onOpenSettings={() => setSettingsOpen(true)}
						onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
						graphHasPendingUpdate={graphHasPendingUpdate}
						onAddExternal={handleAddExternal}
						onStartBatchDigest={handleStartBatchDigest}
					/>
					<main className="shell-main">
						<MainViewTabs
							activeView={mainView}
							graphHasPendingUpdate={graphHasPendingUpdate}
							onSelectView={setMainView}
						/>
						<div className="main-view-content">
							<div className={mainView === "graph" ? "chat-host chat-host-hidden" : "chat-host"}>
								<ChatPanel
									key={chatKey}
									hidden={mainView === "graph"}
									currentKnowledgeBaseName={active?.kb.name ?? null}
									initialMessages={initialMessages}
									onMessageSent={handleMessageSent}
									onStatusChange={setChatStatus}
									currentKnowledgeBasePath={active?.kb.path ?? null}
									onOpenPage={handleOpenPage}
									onWikiLinkSeen={handleWikiLinkSeen}
									onArtifactCreated={handleArtifactCreated}
									artifactCount={artifacts.length}
									onOpenArtifacts={handleOpenArtifacts}
									onStartBatchDigest={handleStartBatchDigest}
									pendingPrompt={pendingGraphPrompt}
									onPendingPromptConsumed={() => setPendingGraphPrompt(null)}
									pendingInsertRef={pendingInsertRef}
									onPendingInsertRefConsumed={() => setPendingInsertRef(null)}
								/>
							</div>
							{mainView === "graph" && (
								<GraphPanel
									currentKnowledgeBaseName={active?.kb.name ?? null}
									currentKnowledgeBasePath={active?.kb.path ?? null}
									theme={theme}
									graphBuildError={graphBuildError}
									onOpenPage={handleOpenGraphPage}
									onGraphDataChange={handleGraphDataChange}
									onGraphPinsChange={setGraphPins}
									onGraphVisibilityChange={handleGraphVisibilityChange}
									onSelectionChange={handleGraphSelectionChange}
									onStatusChange={setGraphStatus}
									onViewReset={handleGraphViewReset}
									selectionCommand={selectionCommand}
									focusPath={graphFocusPath}
									pendingDiff={pendingGraphDiff}
									refreshToken={graphRefreshToken}
									onDiffConsumed={() => setPendingGraphDiff(null)}
									drawerFullscreen={drawerFullscreen}
								/>
							)}
						</div>
					</main>
					<RightDrawer
						drawer={drawer}
						fullscreen={drawerFullscreen}
						width={drawerWidth}
						defaultWidth={DEFAULT_DRAWER_WIDTH}
						onSelectArtifact={(id) => setDrawer(artifactDrawer(artifacts, id))}
						onOpenPage={handleOpenPage}
						onWikiLinkSeen={handleWikiLinkSeen}
						onGraphReaderAction={handleGraphReaderAction}
						onGraphSummaryCommand={handleGraphSummaryCommand}
						onGraphSummaryNodeSelect={handleGraphSummaryNodeSelect}
						onGraphSummaryNodePreview={handleGraphSummaryNodePreview}
						onGraphSummaryReturnCommunity={handleGraphSummaryReturnCommunity}
						onGraphSelectionTextChange={handleGraphSelectionTextChange}
						onGraphSelectionAsk={handleGraphSelectionAsk}
						onGraphCommunityTextChange={handleGraphCommunityTextChange}
						onGraphCommunityAsk={handleGraphCommunityAsk}
						onResize={setDrawerWidth}
						onToggleFullscreen={() => setDrawerFullscreen((value) => !value)}
						exiting={drawerExitIsExiting}
						onExitComplete={handleDrawerExitComplete}
						exitDurationMs={COMMUNITY_ENTER_EXIT_DURATION_MS}
						onClose={handleCloseDrawer}
					/>
				</div>
				<SettingsPanel
					open={settingsOpen}
					onOpenChange={setSettingsOpen}
					onConfigChanged={handleConfigChanged}
				/>
				<BatchDigestPanel
					job={batchJob}
					onClose={() => setBatchJob(null)}
					onOpenOutput={handleOpenBatchOutput}
				/>
				<AppearancePanel
					open={appearanceOpen}
					value={appearance}
					onChange={updateAppearance}
					onClose={() => setAppearanceOpen(false)}
				/>
				<SearchPanel
					open={searchOpen}
					refs={searchRefs}
					loading={searchRefsLoading}
					error={searchRefsError}
					knowledgeBaseName={active?.kb.name ?? null}
					onClose={() => setSearchOpen(false)}
					onOpenPage={handleOpenPage}
					onInsertRef={(path) => {
						setMainView("chat");
						setPendingInsertRef({ id: Math.random().toString(36).slice(2, 10), path });
					}}
				/>
			</div>
		</TooltipProvider>
	);
}

function updateBatchFile<T extends { index: number }>(
	files: T[],
	index: number,
	patch: Partial<T>,
): T[] {
	return files.map((file) => (file.index === index ? { ...file, ...patch } : file));
}

function toRelativePagePath(outputPath: string, kbPath: string): string | null {
	const normalizedKb = kbPath.endsWith("/") ? kbPath : `${kbPath}/`;
	if (outputPath.startsWith(normalizedKb)) return outputPath.slice(normalizedKb.length);
	if (outputPath.startsWith("wiki/")) return outputPath;
	return null;
}

function isGraphInteractionDrawer(drawer: DrawerState): boolean {
	return drawer.mode === "graph-selection"
		|| drawer.mode === "graph-node-summary"
		|| drawer.mode === "graph-community-summary"
		|| drawer.mode === "graph-search-results"
		|| drawer.mode === "graph-excluded-object"
		|| drawer.mode === "graph-unavailable-object"
		|| drawer.mode === "graph-global-overview"
		|| drawer.mode === "graph-loading"
		|| drawer.mode === "graph-empty"
		|| drawer.mode === "graph-error";
}

function prefersReducedMotion(): boolean {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default App;
