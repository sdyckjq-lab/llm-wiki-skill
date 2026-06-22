import { useCallback, useEffect, useRef, useState } from "react";
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
	graphReaderDrawer,
	graphSelectionDrawer,
	shouldApplyGraphReaderResult,
	wikiDrawer,
} from "@/lib/drawer-state";
import type { GraphReaderActionId } from "@/lib/graph-reader";
import { buildSelectionPromptPayload } from "@/lib/graph-selection";
import {
	drawerForGraphSelection,
	drawerForExcludedGraphObject,
	drawerForGraphSummaryCommunity,
	drawerForGraphSummaryNode,
	drawerForUnavailableGraphObject,
	graphOpenPagePayloadForCommand,
	graphObjectVisibilityReason,
	graphSelectionCommandForOpenDetail,
	type GraphSelectionCommand,
} from "@/lib/graph-summary-actions";
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

function drawerForGraphNodeVisibility(
	data: GraphData | null,
	nodeId: string,
	current: DrawerState,
	options: {
		pins: PinMap;
		visibility: GraphVisibilityState | null;
		selection?: { kind: "node"; id: string };
	} ,
): DrawerState {
	const object = { kind: "node" as const, nodeId };
	const summaryOptions = {
		pins: options.pins,
		selection: options.selection ?? { kind: "node" as const, id: nodeId },
		searchResultIds: options.visibility?.searchResultIds ?? [],
		temporaryObject: options.visibility?.temporaryObject ?? null,
	};
	if (!data?.nodes.some((node) => node.id === nodeId)) {
		return drawerForUnavailableGraphObject(data, object, "missing-node", current, summaryOptions);
	}
	const reason = graphObjectVisibilityReason(data, options.visibility, object);
	const temporaryObject = options.visibility?.temporaryObject ?? null;
	const temporarilyShown = temporaryObject?.kind === "node" && temporaryObject.nodeId === nodeId;
	if (reason && !temporarilyShown) {
		return drawerForExcludedGraphObject(data, object, reason, current, summaryOptions);
	}
	return drawerForGraphSummaryNode(data, nodeId, current, summaryOptions);
}

function sameGraphDrawerTarget(left: DrawerState, right: DrawerState): boolean {
	if (left.mode !== right.mode) return false;
	if (left.mode === "graph-node-summary" && right.mode === "graph-node-summary") {
		return left.payload.nodeId === right.payload.nodeId
			&& graphSummaryCommandSignature(left.payload.commands) === graphSummaryCommandSignature(right.payload.commands);
	}
	if (left.mode === "graph-excluded-object" && right.mode === "graph-excluded-object") {
		return JSON.stringify(left.payload.object) === JSON.stringify(right.payload.object)
			&& left.payload.reason === right.payload.reason
			&& graphSummaryCommandSignature(left.payload.commands) === graphSummaryCommandSignature(right.payload.commands);
	}
	if (left.mode === "graph-unavailable-object" && right.mode === "graph-unavailable-object") {
		return JSON.stringify(left.payload.object) === JSON.stringify(right.payload.object) && left.payload.reason === right.payload.reason;
	}
	return false;
}

function graphSummaryCommandSignature(commands: readonly GraphSummaryCommand[]): string {
	return commands.map((command) => {
		if (command.kind === "set-fixed-position") return `${command.kind}:${command.mode}:${command.nodeId}`;
		if (command.kind === "open-detail-read") return `${command.kind}:${command.nodeId}`;
		if (command.kind === "enter-community") return `${command.kind}:${command.communityId}`;
		if (command.kind === "show-this-object") return `${command.kind}:${JSON.stringify(command.object)}`;
		return command.kind;
	}).join(",");
}

function visibilityWithTemporaryObject(
	state: GraphVisibilityState | null,
	temporaryObject: GraphSummaryObjectRef | null,
): GraphVisibilityState | null {
	if (!state && !temporaryObject) return null;
	return {
		searchQuery: state?.searchQuery ?? "",
		searchResultIds: state?.searchResultIds ?? [],
		typeFilters: state?.typeFilters ?? {},
		temporaryObject,
	};
}

function drawerAfterGraphDataRefresh(
	current: DrawerState,
	data: GraphData | null,
	options: {
		pins: PinMap;
		visibility: GraphVisibilityState | null;
		temporaryObject: GraphSummaryObjectRef | null;
	},
): DrawerState {
	const visibility = visibilityWithTemporaryObject(options.visibility, options.temporaryObject);
	if (current.mode === "graph-node-summary") {
		return drawerForGraphNodeVisibility(data, current.payload.nodeId, current, {
			pins: options.pins,
			visibility,
		});
	}
	if (current.mode === "graph-community-summary") {
		return drawerForGraphSummaryCommunity(data, current.payload.communityId, current, {
			pins: options.pins,
			selection: { kind: "community", id: current.payload.communityId },
			searchResultIds: visibility?.searchResultIds ?? [],
			temporaryObject: visibility?.temporaryObject ?? null,
		});
	}
	if (current.mode === "graph-excluded-object" && current.payload.object.kind === "node") {
		return drawerForGraphNodeVisibility(data, current.payload.object.nodeId, current, {
			pins: options.pins,
			visibility,
		});
	}
	if (current.mode === "graph-unavailable-object" && current.payload.object.kind === "node") {
		return drawerForGraphNodeVisibility(data, current.payload.object.nodeId, current, {
			pins: options.pins,
			visibility,
		});
	}
	if (current.mode === "graph-unavailable-object" && current.payload.object.kind === "community") {
		return drawerForGraphSummaryCommunity(data, current.payload.object.communityId, current, {
			pins: options.pins,
			selection: { kind: "community", id: current.payload.object.communityId },
			searchResultIds: visibility?.searchResultIds ?? [],
			temporaryObject: visibility?.temporaryObject ?? null,
		});
	}
	return current;
}

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
	const [drawer, setDrawer] = useState<DrawerState>(() => closedDrawer());
	const [artifacts, setArtifacts] = useState<ArtifactManifest[]>([]);
	const [drawerFullscreen, setDrawerFullscreen] = useState(false);
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
	}, [refreshConversations]);

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
	}, [activeConversationId]);

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
			setDrawer((current) => isGraphInteractionDrawer(current) ? closedDrawer() : current);
			return;
		}
		if (drawer.mode === "graph-reader" && selection.nodeIds.length === 1 && drawer.payload.node.id === selection.nodeIds[0]) {
			return;
		}
		setDrawer((current) => drawerForGraphSelection(graphData, selection, current, {
			pins: graphPins,
			searchResultIds: graphVisibilityState?.searchResultIds ?? [],
		}));
	}, [graphData, graphPins, graphVisibilityState, drawer]);

	const handleGraphVisibilityChange = useCallback((state: GraphVisibilityState | null) => {
		setGraphVisibilityState(state);
		const effectiveState = visibilityWithTemporaryObject(state, graphTemporaryObjectRef.current ?? state?.temporaryObject ?? null);
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
			return current;
		});
	}, [graphData, graphPins]);

	const handleGraphDataChange = useCallback((nextData: GraphData | null) => {
		setGraphData(nextData);
		setDrawer((current) => {
			const next = drawerAfterGraphDataRefresh(current, nextData, {
				pins: graphPins,
				visibility: graphVisibilityState,
				temporaryObject: graphTemporaryObjectRef.current,
			});
			return sameGraphDrawerTarget(current, next) ? current : next;
		});
	}, [graphPins, graphVisibilityState]);

	const handleGraphViewReset = useCallback(() => {
		setGraphFocusPath(null);
		setDrawer((current) => (
			current.mode === "graph-reader"
				? drawerForGraphSummaryNode(graphData, current.payload.node.id, current, { pins: graphPins })
				: current
		));
	}, [graphData, graphPins]);

	const handleGraphSelectionTextChange = useCallback((value: string) => {
		setDrawer((current) => (
			current.mode === "graph-selection"
				? graphSelectionDrawer(current.selection, current.title, value)
				: current
		));
	}, []);

	const handleGraphSelectionNeighbors = useCallback(() => {
		if (drawer.mode !== "graph-selection" || drawer.selection.nodeIds.length !== 1) return;
		setSelectionCommand({
			id: drawer.selection.nodeIds[0],
			type: "neighbors",
		});
	}, [drawer]);

	const handleGraphSelectionAsk = (actionId: string | null, newConversation: boolean) => {
		if (!graphData || drawer.mode !== "graph-selection") return;
		const action = actionId
			? drawer.selection.actions?.find((item) => item.id === actionId) ?? null
			: null;
		const payload = buildSelectionPromptPayload(graphData, drawer.selection, action, drawer.freeText);
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
			if (current.mode === "graph-reader" || current.mode === "graph-selection") {
				setSelectionCommand({
					id: Math.random().toString(36).slice(2, 10),
					type: reason === "button" ? "clear-selection" : "clear",
				});
				setGraphFocusPath(null);
			}
			return closedDrawer();
		});
	}, []);

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
		setDrawer(graphReaderDrawer(normalizedPayload, { loading: true }));
		try {
			const content = await readPage(active.kb.path, normalizedPagePath);
			setDrawer((current) => (
				shouldApplyGraphReaderResult(current, normalizedPayload)
					? graphReaderDrawer(normalizedPayload, { content })
					: current
			));
		} catch (err) {
			setDrawer((current) => (
				shouldApplyGraphReaderResult(current, normalizedPayload)
					? graphReaderDrawer(normalizedPayload, { error: err instanceof Error ? err.message : String(err) })
				: current
			));
		}
	}, [active]);

	const handleGraphSummaryCommand = useCallback((command: GraphSummaryCommand) => {
		if (command.kind === "open-detail-read") {
			const payload = graphOpenPagePayloadForCommand(graphData, command);
			const focusCommand = graphSelectionCommandForOpenDetail(graphData, command);
			if (focusCommand) {
				setSelectionCommand({
					commandId: `open-detail-${command.nodeId}-${Math.random().toString(36).slice(2, 10)}`,
					id: focusCommand.id,
					nodeId: focusCommand.nodeId,
					type: "enter-community-node",
				});
			}
			if (payload) void handleOpenGraphPage(payload, { syncGraphFocus: !focusCommand });
			return;
		}
		if (command.kind === "enter-community") {
			setSelectionCommand({ id: command.communityId, type: "enter-community" });
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
	}, [graphData, graphPins, graphVisibilityState, handleOpenGraphPage]);

	useEffect(() => {
		if (!isGraphInteractionDrawer(drawer)) return;
		setDrawer((current) => (
			isGraphInteractionDrawer(current)
				? drawerAfterGraphDataRefresh(current, graphData, {
					pins: graphPins,
					visibility: graphVisibilityState,
					temporaryObject: graphTemporaryObjectRef.current,
				})
				: current
		));
	}, [drawer.mode, graphData, graphPins, graphVisibilityState]);

	const handleGraphSummaryNodeSelect = useCallback((nodeId: string) => {
		setDrawer((current) => drawerForGraphSummaryNode(graphData, nodeId, current, { pins: graphPins }));
	}, [graphData, graphPins]);

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
				<div className="app-body" data-drawer-open={drawerOpen ? "true" : "false"}>
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
							{mainView === "graph" ? (
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
								/>
							) : (
								<ChatPanel
									key={chatKey}
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
						onGraphSelectionTextChange={handleGraphSelectionTextChange}
						onGraphSelectionNeighbors={handleGraphSelectionNeighbors}
						onGraphSelectionAsk={handleGraphSelectionAsk}
						onResize={setDrawerWidth}
						onToggleFullscreen={() => setDrawerFullscreen((value) => !value)}
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

export default App;
