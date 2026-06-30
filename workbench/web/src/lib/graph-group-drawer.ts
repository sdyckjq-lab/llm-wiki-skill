import type {
	GraphCommunitySummaryPayload,
	Selection,
	SelectionAction,
	SelectionActionId,
} from "@llm-wiki/graph-engine";
import {
	groupDrawerActionById,
	groupDrawerActions,
	recommendedGroupActionForCommunity,
	recommendedGroupActionForSelection,
} from "@llm-wiki/graph-engine";

export { groupDrawerActionById };

export interface GraphGroupDrawerFact {
	label: string;
	value: number;
}

export interface GraphGroupDrawerAction extends SelectionAction {
	recommended: boolean;
}

export interface GraphGroupDrawerNode {
	nodeId: string;
	label: string;
	role: string;
}

export interface GraphGroupDrawerViewModel {
	kicker: string;
	title: string;
	description: string;
	canEnterCommunity: boolean;
	recommendedActionId: SelectionActionId;
	facts: GraphGroupDrawerFact[];
	tags: string[];
	actions: GraphGroupDrawerAction[];
	nodes: GraphGroupDrawerNode[];
	nodeListExpandable: boolean;
	nodeListKey: string;
	dialogueHint: string;
}

export function graphCommunityDrawerViewModel(payload: GraphCommunitySummaryPayload): GraphGroupDrawerViewModel {
	const recommendedActionId = recommendedGroupActionForCommunity(payload.structureState);
	return {
		kicker: "社区",
		title: payload.label,
		description: payload.description,
		canEnterCommunity: payload.canEnterCommunity,
		recommendedActionId,
		facts: [
			{ label: "页", value: payload.facts.pageCount },
			{ label: "链接", value: payload.facts.internalLinkCount },
			{ label: "核心", value: payload.coreNodeIds.length },
			{ label: "孤立", value: payload.facts.isolatedCount }
		],
		tags: communityTags(payload),
		actions: groupDrawerActions().map((action) => ({
			...action,
			recommended: action.id === recommendedActionId
		})),
		nodes: payload.coreNodes.map((node) => ({
			nodeId: node.nodeId,
			label: node.label,
			role: node.role
		})),
		nodeListExpandable: true,
		nodeListKey: JSON.stringify(["community", payload.communityId, payload.coreNodeIds]),
		dialogueHint: "当前社区会带入对话"
	};
}

export function graphSelectionGroupDrawerViewModel(title: string, selection: Selection): GraphGroupDrawerViewModel {
	const recommendedActionId = recommendedGroupActionForSelection(selection.facts);
	return {
		kicker: "选区",
		title,
		description: "这些页面来自当前图谱选区。你可以直接让 agent 基于这组页面继续工作。",
		canEnterCommunity: false,
		recommendedActionId,
		facts: [
			{ label: "页", value: selection.facts.pageCount },
			{ label: "链接", value: selection.facts.internalLinkCount },
			{ label: "社区", value: selection.facts.communityCount },
			{ label: "孤立", value: selection.facts.isolatedCount }
		],
		tags: ["Shift+点击增删节点"],
		actions: groupDrawerActions().map((action) => ({
			...action,
			recommended: action.id === recommendedActionId
		})),
		nodes: selection.nodeIds.slice(0, 3).map((nodeId) => ({
			nodeId,
			label: nodeId,
			role: "已选"
		})),
		nodeListExpandable: false,
		nodeListKey: JSON.stringify(["selection", selection.id]),
		dialogueHint: "当前选区会带入对话"
	};
}

export function graphGroupDrawerPromptAction(actionId: string | null, recommendedActionId: SelectionActionId, freeText: string, newConversation: boolean): SelectionAction | null {
	if (actionId) return groupDrawerActionById(actionId);
	if (newConversation && freeText.trim().length === 0) return groupDrawerActionById(recommendedActionId);
	return null;
}

function communityTags(payload: GraphCommunitySummaryPayload): string[] {
	const tags = [structureLabel(payload.structureState)];
	if (payload.pinHints.length > 0) tags.push(`${payload.pinHints.length} 固定`);
	if (payload.searchResultIds.length > 0) tags.push(`${payload.searchResultIds.length} 命中`);
	return tags;
}

function structureLabel(state: GraphCommunitySummaryPayload["structureState"]): string {
	if (state === "ungrouped") return "暂未成组";
	if (state === "loose") return "结构松散";
	return "结构清晰";
}
