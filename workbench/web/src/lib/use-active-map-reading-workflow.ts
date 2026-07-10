import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type {
	GraphData,
	GraphSummaryCommand,
	GraphSummaryObjectRef,
	GraphVisibilityState,
	PinMap,
	Selection,
} from "@llm-wiki/graph-engine";

import {
	planActiveMapReadingWorkflow,
	type ActiveMapReadingWorkflowEvent,
	type ActiveMapReadingWorkflowPlan,
} from "./active-map-reading-workflow";
import { closedDrawer, graphCommunitySummaryDrawer, graphSelectionDrawer, isGraphInteractionDrawer, type DrawerState } from "./drawer-state";
import type { GraphReaderActionId } from "./graph-reader";
import type { GraphSelectionCommand } from "./graph-summary-actions";
import { useDrawerExitRail } from "./use-drawer-exit-rail";

type SetDrawer = Dispatch<SetStateAction<DrawerState>>;

export interface ActiveMapReadingWorkflowOptions {
	data: GraphData | null;
	pins: PinMap;
	visibility: GraphVisibilityState | null;
	temporaryObject?: GraphSummaryObjectRef | null;
	setData?: (data: GraphData | null) => void;
	setPins?: (pins: PinMap) => void;
	setVisibility?: (visibility: GraphVisibilityState | null) => void;
	setTemporaryObject?: (temporaryObject: GraphSummaryObjectRef | null) => void;
	setSelectionCommand?: (command: GraphSelectionCommand) => void;
	setGraphFocusPath?: (path: string | null) => void;
	createCommandId?: (prefix: string) => string;
	onDrawerChange?: (drawer: DrawerState) => void;
	onPageReadRequest?: (request: NonNullable<ActiveMapReadingWorkflowPlan["pageReadRequest"]>) => void;
	onConversationHandoff?: (handoff: NonNullable<ActiveMapReadingWorkflowPlan["conversationHandoff"]>) => void;
}

export interface ActiveMapReadingWorkflowRunOptions {
	data?: GraphData | null;
	pins?: PinMap;
	visibility?: GraphVisibilityState | null;
	temporaryObject?: GraphSummaryObjectRef | null;
	drawer?: DrawerState;
}

export interface ActiveMapReadingWorkflowController {
	readonly drawer: DrawerState;
	readonly drawerExitIsExiting: boolean;
	setDrawer: SetDrawer;
	executePlan: (plan: ActiveMapReadingWorkflowPlan) => void;
	runEvent: (event: ActiveMapReadingWorkflowEvent, options?: ActiveMapReadingWorkflowRunOptions) => ActiveMapReadingWorkflowPlan;
	handleGraphSelectionChange: (selection: Selection | null) => ActiveMapReadingWorkflowPlan;
	handleGraphVisibilityChange: (visibility: GraphVisibilityState | null) => ActiveMapReadingWorkflowPlan;
	handleGraphDataChange: (data: GraphData | null) => ActiveMapReadingWorkflowPlan;
	handleGraphPinsChange: (pins: PinMap) => void;
	handleGraphViewReset: () => ActiveMapReadingWorkflowPlan;
	handleGraphSummaryCommand: (
		command: GraphSummaryCommand,
		options?: { reducedMotion?: boolean },
	) => ActiveMapReadingWorkflowPlan;
	handleGraphSummaryNodeSelect: (nodeId: string) => ActiveMapReadingWorkflowPlan;
	handleGraphSummaryNodePreview: (nodeId: string | null) => ActiveMapReadingWorkflowPlan;
	handleGraphSummaryReturnCommunity: (communityId: string) => ActiveMapReadingWorkflowPlan;
	handleGraphReaderAction: (actionId: GraphReaderActionId) => ActiveMapReadingWorkflowPlan;
	handleGraphPageReadRequest: (
		payload: NonNullable<ActiveMapReadingWorkflowPlan["pageReadRequest"]>["payload"],
		options?: { syncGraphFocus?: boolean },
	) => ActiveMapReadingWorkflowPlan;
	handleGraphSelectionTextChange: (value: string) => void;
	handleGraphCommunityTextChange: (value: string) => void;
	handleGraphSelectionAsk: (actionId: string | null, newConversation: boolean) => ActiveMapReadingWorkflowPlan;
	handleGraphCommunityAsk: (actionId: string | null, newConversation: boolean) => ActiveMapReadingWorkflowPlan;
	handleDrawerClose: (reason: "button" | "escape") => ActiveMapReadingWorkflowPlan;
	syncGraphDataAndVisibility: () => ActiveMapReadingWorkflowPlan;
	handleDrawerExitComplete: () => void;
	isDrawerExitProtected: (current: DrawerState) => boolean;
	reset: () => void;
}

export function useActiveMapReadingWorkflow(
	options: ActiveMapReadingWorkflowOptions,
): ActiveMapReadingWorkflowController {
	const {
		drawer,
		isExiting,
		setDrawer: setDrawerOnRail,
		stage,
		complete,
		isProtected,
	} = useDrawerExitRail();
	const drawerRef = useRef(drawer);
	const dataRef = useRef(options.data);
	const pinsRef = useRef(options.pins);
	const visibilityRef = useRef(options.visibility);
	const temporaryObjectRef = useRef(options.temporaryObject ?? null);
	const setDataRef = useRef(options.setData);
	const setPinsRef = useRef(options.setPins);
	const setVisibilityRef = useRef(options.setVisibility);
	const setTemporaryObjectRef = useRef(options.setTemporaryObject);
	const setSelectionCommandRef = useRef(options.setSelectionCommand);
	const setGraphFocusPathRef = useRef(options.setGraphFocusPath);
	const createCommandIdRef = useRef(options.createCommandId);
	const onDrawerChangeRef = useRef(options.onDrawerChange);
	const onPageReadRequestRef = useRef(options.onPageReadRequest);
	const onConversationHandoffRef = useRef(options.onConversationHandoff);
	const skipNextDataSyncRef = useRef<{
		data: GraphData | null;
		pins: PinMap;
		visibility: GraphVisibilityState | null;
	} | null>(null);

	useEffect(() => {
		drawerRef.current = drawer;
	}, [drawer]);

	useEffect(() => {
		dataRef.current = options.data;
		pinsRef.current = options.pins;
		visibilityRef.current = options.visibility;
		temporaryObjectRef.current = options.temporaryObject ?? null;
		setDataRef.current = options.setData;
		setPinsRef.current = options.setPins;
		setVisibilityRef.current = options.setVisibility;
		setTemporaryObjectRef.current = options.setTemporaryObject;
		setSelectionCommandRef.current = options.setSelectionCommand;
		setGraphFocusPathRef.current = options.setGraphFocusPath;
		createCommandIdRef.current = options.createCommandId;
		onDrawerChangeRef.current = options.onDrawerChange;
		onPageReadRequestRef.current = options.onPageReadRequest;
		onConversationHandoffRef.current = options.onConversationHandoff;
	}, [
		options.createCommandId,
		options.data,
		options.onDrawerChange,
		options.onConversationHandoff,
		options.onPageReadRequest,
		options.pins,
		options.setData,
		options.setGraphFocusPath,
		options.setPins,
		options.setSelectionCommand,
		options.setTemporaryObject,
		options.setVisibility,
		options.temporaryObject,
		options.visibility,
	]);

	const setDrawer = useCallback<SetDrawer>((next) => {
		if (typeof next !== "function") {
			drawerRef.current = next;
			onDrawerChangeRef.current?.(next);
			setDrawerOnRail(next);
			return;
		}
		setDrawerOnRail((current) => {
			const nextDrawer = next(current);
			drawerRef.current = nextDrawer;
			onDrawerChangeRef.current?.(nextDrawer);
			return nextDrawer;
		});
	}, [setDrawerOnRail]);

	const applyPlannedTemporaryObject = useCallback((plan: ActiveMapReadingWorkflowPlan): void => {
		if ("temporaryObject" in plan) {
			const nextTemporaryObject = plan.temporaryObject ?? null;
			temporaryObjectRef.current = nextTemporaryObject;
			setTemporaryObjectRef.current?.(nextTemporaryObject);
		}
	}, []);

	const executePlan = useCallback((plan: ActiveMapReadingWorkflowPlan): void => {
		applyPlannedTemporaryObject(plan);
		if (plan.clearGraphFocusPath) setGraphFocusPathRef.current?.(null);
		if (plan.selectionCommand) setSelectionCommandRef.current?.(plan.selectionCommand);
		if ("drawerExit" in plan) stage(plan.drawerExit ? plan.drawerExit.drawer : null);
		setDrawer(plan.drawer);
		if (plan.pageReadRequest) onPageReadRequestRef.current?.(plan.pageReadRequest);
		if (plan.conversationHandoff) onConversationHandoffRef.current?.(plan.conversationHandoff);
	}, [applyPlannedTemporaryObject, setDrawer, stage]);

	const runEvent = useCallback((
		event: ActiveMapReadingWorkflowEvent,
		runOptions: ActiveMapReadingWorkflowRunOptions = {},
	): ActiveMapReadingWorkflowPlan => {
		const drawer = runOptions.drawer ?? drawerRef.current;
		const plan = planActiveMapReadingWorkflow({
			event,
			data: "data" in runOptions ? runOptions.data ?? null : dataRef.current,
			drawer,
			pins: "pins" in runOptions ? runOptions.pins ?? {} : pinsRef.current,
			visibility: "visibility" in runOptions ? runOptions.visibility ?? null : visibilityRef.current,
			temporaryObject: "temporaryObject" in runOptions
				? runOptions.temporaryObject ?? null
				: temporaryObjectRef.current,
			drawerExitProtected: isProtected(drawer),
			createCommandId: createCommandIdRef.current,
		});
		executePlan(plan);
		return plan;
	}, [executePlan, isProtected]);

	const handleGraphSelectionChange = useCallback((selection: Selection | null): ActiveMapReadingWorkflowPlan => (
		runEvent({ type: "graph-selection-change", selection })
	), [runEvent]);

	const handleGraphVisibilityChange = useCallback((
		visibility: GraphVisibilityState | null,
	): ActiveMapReadingWorkflowPlan => {
		visibilityRef.current = visibility;
		setVisibilityRef.current?.(visibility);
		return runEvent({ type: "graph-visibility-change" }, { visibility });
	}, [runEvent]);

	const handleGraphDataChange = useCallback((data: GraphData | null): ActiveMapReadingWorkflowPlan => {
		dataRef.current = data;
		setDataRef.current?.(data);
		const plan = runEvent({ type: "graph-data-change" }, { data });
		skipNextDataSyncRef.current = {
			data,
			pins: pinsRef.current,
			visibility: visibilityRef.current,
		};
		return plan;
	}, [runEvent]);

	const handleGraphPinsChange = useCallback((pins: PinMap): void => {
		pinsRef.current = pins;
		setPinsRef.current?.(pins);
	}, []);

	const handleGraphViewReset = useCallback((): ActiveMapReadingWorkflowPlan => (
		runEvent({ type: "graph-view-reset" })
	), [runEvent]);

	const handleGraphSummaryCommand = useCallback((
		command: GraphSummaryCommand,
		options: { reducedMotion?: boolean } = {},
	): ActiveMapReadingWorkflowPlan => (
		runEvent({ type: "graph-summary-command", command, reducedMotion: options.reducedMotion ?? false })
	), [runEvent]);

	const handleGraphSummaryNodeSelect = useCallback((nodeId: string): ActiveMapReadingWorkflowPlan => (
		runEvent({ type: "graph-summary-node-select", nodeId })
	), [runEvent]);

	const handleGraphSummaryNodePreview = useCallback((nodeId: string | null): ActiveMapReadingWorkflowPlan => (
		runEvent({ type: "graph-summary-node-preview", nodeId })
	), [runEvent]);

	const handleGraphSummaryReturnCommunity = useCallback((communityId: string): ActiveMapReadingWorkflowPlan => (
		runEvent({ type: "graph-summary-return-community", communityId })
	), [runEvent]);

	const handleGraphReaderAction = useCallback((actionId: GraphReaderActionId): ActiveMapReadingWorkflowPlan => (
		runEvent({ type: "graph-reader-action", actionId })
	), [runEvent]);

	const handleGraphPageReadRequest = useCallback((
		payload: NonNullable<ActiveMapReadingWorkflowPlan["pageReadRequest"]>["payload"],
		options: { syncGraphFocus?: boolean } = {},
	): ActiveMapReadingWorkflowPlan => {
		const plan = {
			drawer: drawerRef.current,
			pageReadRequest: {
				payload,
				syncGraphFocus: options.syncGraphFocus ?? true,
			},
		};
		executePlan(plan);
		return plan;
	}, [executePlan]);

	const handleGraphSelectionTextChange = useCallback((value: string): void => {
		setDrawer((current) => current.mode === "graph-selection"
			? graphSelectionDrawer(current.selection, current.title, value)
			: current);
	}, [setDrawer]);

	const handleGraphCommunityTextChange = useCallback((value: string): void => {
		setDrawer((current) => current.mode === "graph-community-summary"
			? graphCommunitySummaryDrawer(current.payload, value)
			: current);
	}, [setDrawer]);

	const handleGraphSelectionAsk = useCallback((
		actionId: string | null,
		newConversation: boolean,
	): ActiveMapReadingWorkflowPlan => (
		runEvent({ type: "graph-selection-ask", actionId, newConversation })
	), [runEvent]);

	const handleGraphCommunityAsk = useCallback((
		actionId: string | null,
		newConversation: boolean,
	): ActiveMapReadingWorkflowPlan => (
		runEvent({ type: "graph-community-ask", actionId, newConversation })
	), [runEvent]);

	const handleDrawerClose = useCallback((reason: "button" | "escape"): ActiveMapReadingWorkflowPlan => (
		runEvent({ type: "graph-drawer-close", reason })
	), [runEvent]);

	const syncGraphDataAndVisibility = useCallback((): ActiveMapReadingWorkflowPlan => {
		const skipped = skipNextDataSyncRef.current;
		if (
			skipped
			&& skipped.data === dataRef.current
			&& skipped.pins === pinsRef.current
			&& skipped.visibility === visibilityRef.current
		) {
			skipNextDataSyncRef.current = null;
			return { drawer: drawerRef.current };
		}
		skipNextDataSyncRef.current = null;
		const currentDrawer = drawerRef.current;
		const plan = planActiveMapReadingWorkflow({
			event: { type: "graph-data-change" },
			data: dataRef.current,
			drawer: currentDrawer,
			pins: pinsRef.current,
			visibility: visibilityRef.current,
			temporaryObject: temporaryObjectRef.current,
			drawerExitProtected: isProtected(currentDrawer),
			createCommandId: createCommandIdRef.current,
		});
		if (isGraphInteractionDrawer(currentDrawer)) {
			executePlan(plan);
			return plan;
		}
		applyPlannedTemporaryObject(plan);
		return plan;
	}, [applyPlannedTemporaryObject, executePlan, isProtected]);

	const reset = useCallback((): void => {
		dataRef.current = null;
		pinsRef.current = {};
		visibilityRef.current = null;
		temporaryObjectRef.current = null;
		setDataRef.current?.(null);
		setPinsRef.current?.({});
		setVisibilityRef.current?.(null);
		setTemporaryObjectRef.current?.(null);
		setGraphFocusPathRef.current?.(null);
		setSelectionCommandRef.current?.({
			id: createCommandIdRef.current?.("reset-active-map-reading")
				?? `reset-active-map-reading-${Math.random().toString(36).slice(2, 10)}`,
			type: "clear",
		});
		stage(null);
		setDrawer(closedDrawer());
	}, [setDrawer, stage]);

	return {
		drawer,
		drawerExitIsExiting: isExiting,
		setDrawer,
		executePlan,
		runEvent,
		handleGraphSelectionChange,
		handleGraphVisibilityChange,
		handleGraphDataChange,
		handleGraphPinsChange,
		handleGraphViewReset,
		handleGraphSummaryCommand,
		handleGraphSummaryNodeSelect,
		handleGraphSummaryNodePreview,
		handleGraphSummaryReturnCommunity,
		handleGraphReaderAction,
		handleGraphPageReadRequest,
		handleGraphSelectionTextChange,
		handleGraphCommunityTextChange,
		handleGraphSelectionAsk,
		handleGraphCommunityAsk,
		handleDrawerClose,
		syncGraphDataAndVisibility,
		handleDrawerExitComplete: complete,
		isDrawerExitProtected: isProtected,
		reset,
	};
}
