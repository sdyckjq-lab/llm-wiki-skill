import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import {
	type GraphData,
	type GraphDiff,
	type GraphOpenPagePayload,
	type GraphSummaryCommand,
	type GraphSummaryObjectRef,
	type GraphVisibilityState,
	type PinMap,
} from "@llm-wiki/graph-engine";

import { BatchDigestPanel, type BatchDigestJob } from "@/components/BatchDigestPanel";
import { AppearancePanel } from "@/components/AppearancePanel";
import { ChatPanel } from "@/components/ChatPanel";
import { GraphPanel } from "@/components/GraphPanel";
import { GraphRenameDialog } from "@/components/GraphRenameDialog";
import { GraphRenameEvidenceNotice } from "@/components/GraphRenameEvidenceNotice";
import { MainViewTabs, type MainView } from "@/components/MainViewTabs";
import { RightDrawer } from "@/components/RightDrawer";
import { SearchPanel } from "@/components/SearchPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
	type ArtifactManifest,
	type ActiveContext,
	type ConversationInfo,
	type KnowledgeBaseInfo,
	type ModelRef,
	type PageRef,
	type GraphRenameRecoveryData,
	type GraphWarningPublicCandidateSetContract,
	type GraphWarningPublicGroupContract,
	type UIMessage,
} from "@llm-wiki/workbench-contracts";
import { listArtifacts } from "@/lib/api/artifacts";
import { streamBatchDigest } from "@/lib/api/batch-digest";
import {
	createNewConversation,
	listConversations,
	selectConversation,
} from "@/lib/api/conversations";
import { subscribeGraphEvents, toEngineGraphDiff } from "@/lib/api/events";
import {
	getGraphData,
	rebuildGraph,
	type GraphAuthoritySnapshot,
	type GraphBuildError,
} from "@/lib/api/graph";
import { getGraphRenameRecovery } from "@/lib/api/graph-renames";
import {
	getActiveContext,
	listKnowledgeBases,
	createKnowledgeBase,
	registerExternalKnowledgeBase,
	selectKnowledgeBase,
} from "@/lib/api/knowledge-bases";
import { listRefs, readPage } from "@/lib/api/pages";
import {
	artifactDrawer,
	closedDrawer,
	type DrawerState,
	graphReaderDrawer,
	isGraphInteractionDrawer,
	shouldApplyGraphReaderResult,
	wikiDrawer,
} from "@/lib/drawer-state";
import type { GraphReaderActionId } from "@/lib/graph-reader";
import { graphReaderFilteredHidden } from "@/lib/graph-data-refresh";
import type { ActiveMapReadingWorkflowPlan } from "@/lib/active-map-reading-workflow";
import {
	type GraphSelectionCommand,
} from "@/lib/graph-summary-actions";
import { COMMUNITY_ENTER_EXIT_DURATION_MS } from "@/lib/graph-community-enter";
import { useActiveMapReadingWorkflow } from "@/lib/use-active-map-reading-workflow";
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
import { useGraphRenameRecovery } from "@/lib/use-graph-rename-recovery";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "llm-wiki-agent-sidebar-collapsed";
const DRAWER_WIDTH_STORAGE_KEY = "llm-wiki-agent-drawer-width";
const MAIN_VIEW_STORAGE_KEY = "llm-wiki-agent-main-view";
const SEARCH_REF_LIMIT = 5000;

interface RenameDialogDescriptor {
	kbPath: string;
	sourcePath?: string;
	candidatePaths?: string[];
	recovery?: GraphRenameRecoveryData;
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
	const [graphBuildError, setGraphBuildError] = useState<GraphBuildError | null>(null);
	const [graphAuthoritySnapshot, setGraphAuthoritySnapshot] = useState<GraphAuthoritySnapshot | null>(null);
	const [graphData, setGraphData] = useState<GraphData | null>(null);
	const [graphPins, setGraphPins] = useState<PinMap>({});
	const [graphVisibilityState, setGraphVisibilityState] = useState<GraphVisibilityState | null>(null);
	const [graphTemporaryObject, setGraphTemporaryObject] = useState<GraphSummaryObjectRef | null>(null);
	const [selectionCommand, setSelectionCommand] = useState<GraphSelectionCommand | undefined>();
	const [renameDialog, setRenameDialog] = useState<RenameDialogDescriptor | null>(null);
	const [mainView, setMainView] = useState<MainView>(() => {
		if (typeof window === "undefined") return "chat";
		return window.localStorage.getItem(MAIN_VIEW_STORAGE_KEY) === "graph" ? "graph" : "chat";
	});
	const mainViewRef = useRef(mainView);
	const graphRenameRecovery = useGraphRenameRecovery({
		kbPath: active?.kb.path ?? null,
		getRecovery: getGraphRenameRecovery,
	});
	const renameRecoveryStatus = graphRenameRecovery.status;
	const recheckGraphRenameRecovery = graphRenameRecovery.recheck;
	const drawerRef = useRef<DrawerState>(closedDrawer());
	const activeConversationId = active?.conversation.id ?? null;
	const graphPageReadRequestRef = useRef<(request: NonNullable<ActiveMapReadingWorkflowPlan["pageReadRequest"]>) => void>(() => {});
	const graphConversationHandoffRef = useRef<(input: NonNullable<ActiveMapReadingWorkflowPlan["conversationHandoff"]>) => void>(() => {});
	const createGraphCommandId = useCallback((prefix: string) => (
		`${prefix}-${Math.random().toString(36).slice(2, 10)}`
	), []);
	const activeMapReadingWorkflow = useActiveMapReadingWorkflow({
		data: graphData,
		pins: graphPins,
		visibility: graphVisibilityState,
		temporaryObject: graphTemporaryObject,
		setData: setGraphData,
		setPins: setGraphPins,
		setVisibility: setGraphVisibilityState,
		setTemporaryObject: setGraphTemporaryObject,
		setSelectionCommand,
		setGraphFocusPath,
		createCommandId: createGraphCommandId,
		onDrawerChange: (nextDrawer) => {
			drawerRef.current = nextDrawer;
		},
		onPageReadRequest: (request) => graphPageReadRequestRef.current(request),
		onConversationHandoff: (handoff) => graphConversationHandoffRef.current(handoff),
	});
	const {
		drawer,
		setDrawer,
		handleGraphSelectionChange,
		handleGraphVisibilityChange,
		handleGraphDataChange,
		handleGraphPinsChange,
		handleGraphViewReset,
		handleGraphSummaryCommand: runGraphSummaryCommand,
		handleGraphSummaryNodeSelect,
		handleGraphSummaryNodePreview,
		handleGraphSummaryReturnCommunity,
		handleGraphReaderAction: runGraphReaderAction,
		handleGraphPageReadRequest: runGraphPageReadRequest,
		handleGraphSelectionTextChange: runGraphSelectionTextChange,
		handleGraphCommunityTextChange: runGraphCommunityTextChange,
		handleGraphSelectionAsk: runGraphSelectionAsk,
		handleGraphCommunityAsk: runGraphCommunityAsk,
		handleDrawerClose: runDrawerClose,
		syncGraphDataAndVisibility,
		drawerExitIsExiting,
		handleDrawerExitComplete,
		reset: resetActiveMapReading,
	} = activeMapReadingWorkflow;
	const setDrawerWithRef = useCallback((next: DrawerState) => {
		drawerRef.current = next;
		setDrawer(next);
	}, [setDrawer]);
	const updateDrawerWithRef = useCallback((updater: (current: DrawerState) => DrawerState) => {
		setDrawer((current) => {
			const next = updater(current);
			drawerRef.current = next;
			return next;
		});
	}, [setDrawer]);
	useEffect(() => {
		drawerRef.current = drawer;
	}, [drawer]);

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
		const kbPath = active?.kb.path;
		const recovery = renameRecoveryStatus;
		if (!kbPath) {
			setRenameDialog(null);
			return;
		}
		if (!recovery) {
			setRenameDialog((current) => current && current.kbPath !== kbPath ? null : current);
			return;
		}
		if (recovery.status === "clear") {
			return;
		}
		setRenameDialog({ kbPath, recovery });
	}, [active?.kb.path, renameRecoveryStatus]);

	useEffect(() => {
		if (!active?.kb.path) return;
		const kbPath = active.kb.path;
		let authorityReadId = 0;
		let cancelled = false;
		const close = subscribeGraphEvents({
			kbPath,
			onReady(_ready, context) {
				if (!context.reconnected) return;
				const readId = ++authorityReadId;
				setPendingGraphDiff(null);
				void getGraphData(kbPath)
					.then((result) => {
						if (cancelled || authorityReadId !== readId) return;
						setSidebarError(null);
						setGraphBuildError(null);
						setGraphAuthoritySnapshot({ kbPath, result });
					})
					.catch(() => {
						if (cancelled || authorityReadId !== readId) return;
						const message = "图谱状态校准失败，请重新连接后重试";
						setGraphAuthoritySnapshot(null);
						setPendingGraphDiff(null);
						setGraphBuildError({
							kbPath,
							message,
							rebuiltAt: _ready.connectedAt,
						});
						setSidebarError(message);
					});
			},
			onEvent(event) {
				authorityReadId += 1;
				setGraphAuthoritySnapshot(null);
				if (event.type === "graph_updated") {
					setSidebarError(null);
					setGraphBuildError(null);
					setGraphRefreshToken((token) => token + 1);
					setPendingGraphDiff(toEngineGraphDiff(event.diff));
					if (mainViewRef.current !== "graph" && event.diff) setGraphHasPendingUpdate(true);
					void recheckGraphRenameRecovery();
					return;
				}
				setSidebarError(event.message);
				setGraphBuildError({ ...event, kbPath });
				void recheckGraphRenameRecovery();
			},
			onProtocolError(error) {
				authorityReadId += 1;
				setSidebarError(error.message);
			},
		});
		return () => {
			cancelled = true;
			authorityReadId += 1;
			close();
		};
	}, [active?.kb.path, recheckGraphRenameRecovery]);

	useEffect(() => {
		if (mainView === "graph") setGraphHasPendingUpdate(false);
	}, [mainView]);

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
				resetActiveMapReading();
			}
		} catch (err) {
			setSidebarError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [refreshConversations, resetActiveMapReading]);

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
				updateDrawerWithRef((current) => {
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
	}, [activeConversationId, updateDrawerWithRef]);

	const applyActive = (ctx: ActiveContext) => {
		setActive(ctx);
		setInitialMessages(ctx.conversation.messages);
		setChatKey((k) => k + 1);
		setChatStatus(DEFAULT_CHAT_STATUS);
		setGraphStatus(DEFAULT_GRAPH_STATUS);
		setDrawerFullscreen(false);
		resetActiveMapReading();
		setArtifacts([]);
		setPendingGraphDiff(null);
		setGraphBuildError(null);
		setGraphAuthoritySnapshot(null);
		setGraphHasPendingUpdate(false);
	};

	const selectKnowledgeBaseAndRefresh = async (item: KnowledgeBaseInfo) => {
		if (!item.valid) throw new Error("知识库暂时不可用");
		if (item.path === active?.kb.path) return;

		setSidebarError(null);
		const ctx = await selectKnowledgeBase(item.path);
		applyActive(ctx);
		await refreshConversations(item.path);
	};

	const handleSelectKb = async (item: KnowledgeBaseInfo) => {
		try {
			await selectKnowledgeBaseAndRefresh(item);
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

	const handleGraphConversationHandoff = async (
		input: NonNullable<ActiveMapReadingWorkflowPlan["conversationHandoff"]> | undefined,
	) => {
		if (!input) return;
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

	const handleGraphSelectionTextChange = useCallback((value: string) => {
		runGraphSelectionTextChange(value);
	}, [runGraphSelectionTextChange]);

	const handleGraphSelectionAsk = (actionId: string | null, newConversation: boolean) => {
		runGraphSelectionAsk(actionId, newConversation);
	};

	const handleGraphCommunityTextChange = useCallback((value: string) => {
		runGraphCommunityTextChange(value);
	}, [runGraphCommunityTextChange]);

	const handleGraphCommunityAsk = (actionId: string | null, newConversation: boolean) => {
		runGraphCommunityAsk(actionId, newConversation);
	};

	const handleGraphReaderAction = (actionId: GraphReaderActionId) => {
		runGraphReaderAction(actionId);
	};

	const handleResolveGraphWarning = useCallback((
		_group: GraphWarningPublicGroupContract,
		candidateSet: GraphWarningPublicCandidateSetContract,
	) => {
		const kbPath = active?.kb.path;
		if (!kbPath || graphRenameRecovery.renameBlocked || renameDialog) return;
		setRenameDialog({ kbPath, candidatePaths: candidateSet.candidates });
	}, [active?.kb.path, graphRenameRecovery.renameBlocked, renameDialog]);

	const handleRenameGraphPage = useCallback((sourcePath: string) => {
		const kbPath = active?.kb.path;
		if (!kbPath || graphRenameRecovery.renameBlocked || renameDialog) return;
		setRenameDialog({ kbPath, sourcePath });
	}, [active?.kb.path, graphRenameRecovery.renameBlocked, renameDialog]);

	const handleCloseDrawer = useCallback((reason: "button" | "escape") => {
		runDrawerClose(reason);
	}, [runDrawerClose]);

	const handleAddExternal = async (path: string) => {
		const { info } = await registerExternalKnowledgeBase(path);
		await refreshAll();
		if (info.valid) await handleSelectKb(info);
	};

	const handleCreateWiki = async (name: string, purpose: string) => {
		const info = await createKnowledgeBase(name, purpose);
		await refreshAll();
		if (!info.valid) throw new Error("新建知识库暂时不可用");
		await selectKnowledgeBaseAndRefresh(info);
		setMainView("chat");
	};

	const handleMessageSent = async () => {
		// 用户发了一次消息后，刷新对话列表，把 "(新对话)" stub 替换为带 firstMessage 的真实条目
		if (active) await refreshConversations(active.kb.path);
	};

	const handleOpenPage = async (pagePath: string) => {
		if (!active) return;
		const normalizedPagePath = toRelativePagePath(pagePath, active.kb.path) ?? pagePath;
		if (normalizedPagePath.startsWith("wiki/")) setGraphFocusPath(normalizedPagePath);
		setDrawerWithRef(wikiDrawer(normalizedPagePath, { loading: true }));
		try {
			const content = await readPage(active.kb.path, normalizedPagePath);
			setDrawerWithRef(wikiDrawer(normalizedPagePath, { content }));
		} catch (err) {
			setDrawerWithRef(wikiDrawer(normalizedPagePath, { error: err instanceof Error ? err.message : String(err) }));
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
		const requestKey = `${active.kb.path}:${normalizedPagePath}:${normalizedPayload.node.id}:${Math.random().toString(36).slice(2, 10)}`;
		if (syncGraphFocus && normalizedPagePath.startsWith("wiki/")) setGraphFocusPath(normalizedPagePath);
		setDrawerWithRef(graphReaderDrawer(normalizedPayload, { loading: true }, {
			filteredHidden: graphReaderFilteredHidden(normalizedPayload.node.id, graphVisibilityState),
			requestKey,
		}));
		try {
			const content = await readPage(active.kb.path, normalizedPagePath);
			updateDrawerWithRef((current) => (
				shouldApplyGraphReaderResult(current, normalizedPayload, { requestKey })
					? graphReaderDrawer(normalizedPayload, { content }, { filteredHidden: current.filteredHidden, requestKey })
					: current
			));
		} catch (err) {
			updateDrawerWithRef((current) => (
				shouldApplyGraphReaderResult(current, normalizedPayload, { requestKey })
					? graphReaderDrawer(normalizedPayload, { error: err instanceof Error ? err.message : String(err) }, { filteredHidden: current.filteredHidden, requestKey })
				: current
			));
		}
	}, [active, graphVisibilityState, setDrawerWithRef, updateDrawerWithRef]);

	const handleGraphSummaryCommand = useCallback((command: GraphSummaryCommand) => {
		runGraphSummaryCommand(command, { reducedMotion: prefersReducedMotion() });
	}, [runGraphSummaryCommand]);

	graphPageReadRequestRef.current = (request) => {
		void handleOpenGraphPage(request.payload, { syncGraphFocus: request.syncGraphFocus });
	};
	graphConversationHandoffRef.current = (handoff) => {
		void handleGraphConversationHandoff(handoff);
	};

	useEffect(() => {
		syncGraphDataAndVisibility();
	}, [graphData, graphPins, graphVisibilityState, syncGraphDataAndVisibility]);

	const handleWikiLinkSeen = useCallback((pagePath: string) => {
		setGraphFocusPath(pagePath);
	}, []);

	const refreshArtifacts = async (conversationId: string, focusId?: string) => {
		const items = await listArtifacts(conversationId);
		setArtifacts(items);
		setDrawerWithRef(artifactDrawer(items, focusId ?? items.at(-1)?.id ?? null));
	};

	const handleOpenArtifacts = () => {
		if (artifacts.length === 0) return;
		const current = drawer.mode === "artifacts" ? drawer.activeArtifactId : null;
		setDrawerWithRef(artifactDrawer(
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
				for await (const event of stream) {
					setBatchJob((current) => {
						if (!current || current.id !== jobId) return current;
						if (event.type === "batch_started") {
							return {
								...current,
								total: event.total,
								outputDir: event.outputDir,
								events: [...current.events, event],
							};
						}
						if (event.type === "batch_file_started") {
							return {
								...current,
								current: event.filePath,
								files: updateBatchFile(current.files, event.index, {
									status: "running",
								}),
								events: [...current.events, event],
							};
						}
						if (event.type === "batch_file_progress") {
							return {
								...current,
								files: updateBatchFile(current.files, event.index, {
									status: "running",
									chars: event.chars,
								}),
								events: [...current.events, event],
							};
						}
						if (event.type === "batch_file_completed") {
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
						if (event.type === "batch_file_failed") {
							return {
								...current,
								failed: current.failed + 1,
								current: event.filePath,
								files: updateBatchFile(current.files, event.index, {
									status: "error",
									error: event.message,
								}),
								events: [...current.events, event],
							};
						}
						if (event.type === "batch_completed") {
							return {
								...current,
								status: "done",
								completed: event.completed,
								failed: event.failed,
								outputDir: event.outputDir,
								events: [...current.events, event],
							};
						}
						if (event.type === "batch_cancelled") {
							return {
								...current,
								status: "error",
								error: event.reason,
								events: [...current.events, event],
							};
						}
						if (event.type === "batch_failed") {
							return {
								...current,
								status: "error",
								error: event.message,
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
		setDrawerWithRef(wikiDrawer(rel, { loading: true }));
		try {
			const content = await readPage(batchJob.kbPath, rel);
			setDrawerWithRef(wikiDrawer(rel, { content }));
		} catch (err) {
			setDrawerWithRef(wikiDrawer(rel, { error: err instanceof Error ? err.message : String(err) }));
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
	const renameEntriesEnabled = Boolean(active?.kb.path)
		&& !graphRenameRecovery.renameBlocked
		&& renameDialog === null;

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
						onCreateWiki={handleCreateWiki}
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
									onOpenPage={(payload) => runGraphPageReadRequest(payload)}
									onGraphDataChange={handleGraphDataChange}
									onGraphPinsChange={handleGraphPinsChange}
									onGraphVisibilityChange={handleGraphVisibilityChange}
									onSelectionChange={handleGraphSelectionChange}
									onStatusChange={setGraphStatus}
									onViewReset={handleGraphViewReset}
									selectionCommand={selectionCommand}
									focusPath={graphFocusPath}
									pendingDiff={pendingGraphDiff}
									refreshToken={graphRefreshToken}
									authoritativeSnapshot={graphAuthoritySnapshot}
									onDiffConsumed={() => setPendingGraphDiff(null)}
									onResolveWarning={renameEntriesEnabled ? handleResolveGraphWarning : undefined}
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
						onSelectArtifact={(id) => setDrawerWithRef(artifactDrawer(artifacts, id))}
						onOpenPage={handleOpenPage}
						onWikiLinkSeen={handleWikiLinkSeen}
						onGraphReaderAction={handleGraphReaderAction}
						onRenameGraphPage={renameEntriesEnabled ? handleRenameGraphPage : undefined}
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
				<GraphRenameEvidenceNotice
					receipts={graphRenameRecovery.visibleReceipts}
					onDismiss={graphRenameRecovery.dismissReceipt}
				/>
				{renameDialog && (
					<GraphRenameDialog
						open
						kbPath={renameDialog.kbPath}
						sourcePath={renameDialog.sourcePath}
						candidatePaths={renameDialog.candidatePaths}
						recovery={renameRecoveryStatus ?? renameDialog.recovery}
						onOpenChange={(nextOpen) => {
							if (!nextOpen) setRenameDialog(null);
						}}
						onRecoveryChange={graphRenameRecovery.refreshAfterMutation}
						onOperationTerminal={() => {
							setRenameDialog(null);
							void graphRenameRecovery.recheck();
						}}
						onRetryGraph={async () => {
							await rebuildGraph(renameDialog.kbPath);
							await graphRenameRecovery.recheck();
						}}
					/>
				)}
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

function prefersReducedMotion(): boolean {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default App;
