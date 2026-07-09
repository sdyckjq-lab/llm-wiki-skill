import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type {
	GraphData,
	GraphSummaryObjectRef,
	GraphVisibilityState,
	PinMap,
} from "@llm-wiki/graph-engine";

import {
	planActiveMapReadingWorkflow,
	type ActiveMapReadingWorkflowEvent,
	type ActiveMapReadingWorkflowPlan,
} from "./active-map-reading-workflow";
import type { DrawerState } from "./drawer-state";
import type { GraphSelectionCommand } from "./graph-summary-actions";
import { useDrawerExitRail } from "./use-drawer-exit-rail";

type SetDrawer = Dispatch<SetStateAction<DrawerState>>;

export interface ActiveMapReadingWorkflowOptions {
	data: GraphData | null;
	pins: PinMap;
	visibility: GraphVisibilityState | null;
	temporaryObject?: GraphSummaryObjectRef | null;
	setTemporaryObject?: (temporaryObject: GraphSummaryObjectRef | null) => void;
	setSelectionCommand?: (command: GraphSelectionCommand) => void;
	setGraphFocusPath?: (path: string | null) => void;
	createCommandId?: (prefix: string) => string;
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
	updateDrawer: (updater: (current: DrawerState) => DrawerState) => void;
	executePlan: (plan: ActiveMapReadingWorkflowPlan) => void;
	runEvent: (event: ActiveMapReadingWorkflowEvent, options?: ActiveMapReadingWorkflowRunOptions) => ActiveMapReadingWorkflowPlan;
	handleDrawerExitComplete: () => void;
	isDrawerExitProtected: (current: DrawerState) => boolean;
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
	const setTemporaryObjectRef = useRef(options.setTemporaryObject);
	const setSelectionCommandRef = useRef(options.setSelectionCommand);
	const setGraphFocusPathRef = useRef(options.setGraphFocusPath);
	const createCommandIdRef = useRef(options.createCommandId);
	const onPageReadRequestRef = useRef(options.onPageReadRequest);
	const onConversationHandoffRef = useRef(options.onConversationHandoff);

	useEffect(() => {
		drawerRef.current = drawer;
	}, [drawer]);

	useEffect(() => {
		dataRef.current = options.data;
		pinsRef.current = options.pins;
		visibilityRef.current = options.visibility;
		temporaryObjectRef.current = options.temporaryObject ?? null;
		setTemporaryObjectRef.current = options.setTemporaryObject;
		setSelectionCommandRef.current = options.setSelectionCommand;
		setGraphFocusPathRef.current = options.setGraphFocusPath;
		createCommandIdRef.current = options.createCommandId;
		onPageReadRequestRef.current = options.onPageReadRequest;
		onConversationHandoffRef.current = options.onConversationHandoff;
	}, [
		options.createCommandId,
		options.data,
		options.onConversationHandoff,
		options.onPageReadRequest,
		options.pins,
		options.setGraphFocusPath,
		options.setSelectionCommand,
		options.setTemporaryObject,
		options.temporaryObject,
		options.visibility,
	]);

	const setDrawer = useCallback<SetDrawer>((next) => {
		setDrawerOnRail((current) => {
			const nextDrawer = typeof next === "function" ? next(current) : next;
			drawerRef.current = nextDrawer;
			return nextDrawer;
		});
	}, [setDrawerOnRail]);

	const updateDrawer = useCallback((updater: (current: DrawerState) => DrawerState): void => {
		setDrawer(updater);
	}, [setDrawer]);

	const executePlan = useCallback((plan: ActiveMapReadingWorkflowPlan): void => {
		if ("temporaryObject" in plan) {
			const nextTemporaryObject = plan.temporaryObject ?? null;
			temporaryObjectRef.current = nextTemporaryObject;
			setTemporaryObjectRef.current?.(nextTemporaryObject);
		}
		if (plan.clearGraphFocusPath) setGraphFocusPathRef.current?.(null);
		if (plan.selectionCommand) setSelectionCommandRef.current?.(plan.selectionCommand);
		if ("drawerExit" in plan) stage(plan.drawerExit ? plan.drawerExit.drawer : null);
		setDrawer(plan.drawer);
		if (plan.pageReadRequest) onPageReadRequestRef.current?.(plan.pageReadRequest);
		if (plan.conversationHandoff) onConversationHandoffRef.current?.(plan.conversationHandoff);
	}, [setDrawer, stage]);

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

	return {
		drawer,
		drawerExitIsExiting: isExiting,
		setDrawer,
		updateDrawer,
		executePlan,
		runEvent,
		handleDrawerExitComplete: complete,
		isDrawerExitProtected: isProtected,
	};
}
