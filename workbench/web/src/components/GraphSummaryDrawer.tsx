import React from "react";

import type {
	GraphCommunitySummaryPayload,
	GraphExcludedObjectPayload,
	GraphGlobalOverviewPayload,
	GraphNodeSummaryPayload,
	GraphSearchResultsPayload,
	GraphSummaryCommand,
	GraphUnavailableObjectPayload,
	SelectionAction,
} from "@llm-wiki/graph-engine";

import { GraphGroupDrawer } from "./GraphGroupDrawer";
import { graphCommunityDrawerViewModel } from "../lib/graph-group-drawer";

interface NodeSummaryProps {
	payload: GraphNodeSummaryPayload;
	onCommand: (command: GraphSummaryCommand) => void;
}

interface CommunitySummaryProps {
	payload: GraphCommunitySummaryPayload;
	freeText: string;
	onFreeTextChange: (value: string) => void;
	onAsk: (action: SelectionAction | null) => void;
	onAskInNewConversation: (action: SelectionAction | null) => void;
	onCommand: (command: GraphSummaryCommand) => void;
	onShowNodeSummary: (nodeId: string) => void;
	onPreviewNode: (nodeId: string | null) => void;
}

interface SimpleStateProps {
	title: string;
	message: string;
}

export function GraphNodeSummary({ payload, onCommand }: NodeSummaryProps) {
	return (
		<React.Fragment>
		<article className="graph-summary-drawer" data-testid="graph-node-summary">
			<div className="graph-summary-kicker">节点</div>
			<h2 className="graph-summary-title">{payload.label}</h2>
			<div className="graph-summary-facts">
				<SummaryFact label="连接" value={payload.connectionCount} />
				<SummaryFact label="强关系" value={payload.strongestRelations.length} />
				<SummaryFact label="桥接" value={payload.bridgeRelations.length} />
			</div>
			<div className="graph-summary-meta">
				<span>{payload.type}</span>
				<span className="graph-summary-community-chip">{payload.communityId ?? "未分组"}</span>
				<span>{payload.pinHint.pinned ? "已固定" : "未固定"}</span>
				{payload.searchHit && <span>搜索命中</span>}
			</div>
			{payload.summary && <p className="graph-summary-excerpt">{payload.summary}</p>}
			<RelationList title="最强关系" relations={payload.strongestRelations} emptyText="暂无强关系" />
			<RelationList title="桥接关系" relations={payload.bridgeRelations} emptyText="暂无桥接关系" />
			<CommandRow commands={payload.commands} onCommand={onCommand} />
		</article>
		</React.Fragment>
	);
}

export function GraphCommunitySummary({
	payload,
	freeText,
	onFreeTextChange,
	onAsk,
	onAskInNewConversation,
	onCommand,
	onShowNodeSummary,
	onPreviewNode,
}: CommunitySummaryProps) {
	const view = graphCommunityDrawerViewModel(payload);
	const enterCommand = payload.commands.find((c) => c.kind === "enter-community") ?? null;
	return (
		<GraphGroupDrawer
			key={view.nodeListKey}
			testId="graph-community-summary"
			view={view}
			freeText={freeText}
			enterCommand={enterCommand}
			nodeSectionTitle="核心节点"
			onFreeTextChange={onFreeTextChange}
			onAsk={onAsk}
			onAskInNewConversation={onAskInNewConversation}
			onCommand={onCommand}
			onShowNodeSummary={onShowNodeSummary}
			onPreviewNode={onPreviewNode}
		/>
	);
}

export function GraphSearchResultsSummary({ payload, onCommand }: { payload: GraphSearchResultsPayload; onCommand: (command: GraphSummaryCommand) => void }) {
	return (
		<article className="graph-summary-drawer" data-testid="graph-search-results">
			<div className="graph-summary-kicker">搜索</div>
			<h2 className="graph-summary-title">{payload.query || "搜索结果"}</h2>
			<div className="graph-summary-facts">
				<SummaryFact label="结果" value={payload.searchResultIds.length} />
				<SummaryFact label="可见" value={payload.visibleResultIds.length} />
				<SummaryFact label="不可用" value={payload.unavailableResultIds.length} />
			</div>
			<IdList title="可见结果" ids={payload.visibleResultIds} emptyText="没有可见结果" />
			<CommandRow commands={payload.commands} onCommand={onCommand} />
		</article>
	);
}

export function GraphGlobalOverviewSummary({ payload }: { payload: GraphGlobalOverviewPayload }) {
	return (
		<article className="graph-summary-drawer" data-testid="graph-global-overview">
			<div className="graph-summary-kicker">全局</div>
			<h2 className="graph-summary-title">全局概览</h2>
			<div className="graph-summary-facts">
				<SummaryFact label="节点" value={payload.nodeCount} />
				<SummaryFact label="边" value={payload.edgeCount} />
				<SummaryFact label="社区" value={payload.communityCount} />
			</div>
			<IdList title="核心节点" ids={payload.coreNodeIds} emptyText="暂无核心节点" />
			<IdList title="搜索命中" ids={payload.searchResultIds} emptyText="暂无搜索命中" />
		</article>
	);
}

export function GraphExcludedObjectSummary({ payload, onCommand }: { payload: GraphExcludedObjectPayload; onCommand: (command: GraphSummaryCommand) => void }) {
	return (
		<article className="graph-summary-drawer" data-testid="graph-excluded-object">
			<div className="graph-summary-kicker">暂不可见</div>
			<h2 className="graph-summary-title">{objectLabel(payload.object)}</h2>
			<p className="graph-summary-excerpt">{excludedReasonLabel(payload.reason)}</p>
			<IdList title="相关搜索命中" ids={payload.searchResultIds} emptyText="没有相关搜索命中" />
			<CommandRow commands={payload.commands} onCommand={onCommand} />
		</article>
	);
}

export function GraphUnavailableObjectSummary({ payload }: { payload: GraphUnavailableObjectPayload }) {
	return (
		<article className="graph-summary-drawer" data-testid="graph-unavailable-object">
			<div className="graph-summary-kicker">不可用</div>
			<h2 className="graph-summary-title">{objectLabel(payload.object)}</h2>
			<p className="graph-summary-excerpt">{unavailableReasonLabel(payload.reason)}</p>
		</article>
	);
}

export function GraphSimpleState({ title, message }: SimpleStateProps) {
	return (
		<article className="graph-summary-drawer" data-testid="graph-simple-state">
			<div className="graph-summary-kicker">图谱</div>
			<h2 className="graph-summary-title">{title}</h2>
			<p className="graph-summary-excerpt">{message}</p>
		</article>
	);
}

function SummaryFact({ label, value }: { label: string; value: number }) {
	return (
		<div className="graph-summary-fact">
			<strong>{value}</strong>
			<span>{label}</span>
		</div>
	);
}

function RelationList({
	title,
	relations,
	emptyText,
}: {
	title: string;
	relations: GraphNodeSummaryPayload["strongestRelations"];
	emptyText: string;
}) {
	return (
		<section className="graph-summary-section">
			<h3>{title}</h3>
			{relations.length === 0 ? (
				<div className="graph-summary-muted">{emptyText}</div>
			) : (
				<ul className="graph-summary-list">
					{relations.map((relation) => (
						<li key={relation.edgeId}>
							<span>{relation.fromNodeId} - {relation.toNodeId}</span>
							<small className="graph-summary-relation-pill">{relation.relationType ?? relation.confidence ?? "关系"}</small>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

function IdList({ title, ids, emptyText }: { title: string; ids: string[]; emptyText: string }) {
	return (
		<section className="graph-summary-section">
			<h3>{title}</h3>
			{ids.length === 0 ? (
				<div className="graph-summary-muted">{emptyText}</div>
			) : (
				<ul className="graph-summary-list">
					{ids.slice(0, 8).map((id) => <li key={id}>{id}</li>)}
				</ul>
			)}
		</section>
	);
}

function CommandRow({ commands, onCommand }: { commands: GraphSummaryCommand[]; onCommand: (command: GraphSummaryCommand) => void }) {
	if (commands.length === 0) return null;
	return (
		<div className="graph-summary-actions">
			{commands.map((command) => (
				<button key={commandKey(command)} type="button" className="graph-summary-action" onClick={() => onCommand(command)}>
					{command.label}
				</button>
			))}
		</div>
	);
}

function commandKey(command: GraphSummaryCommand): string {
	if (command.kind === "enter-community") return `${command.kind}:${command.communityId}`;
	if (command.kind === "open-detail-read") return `${command.kind}:${command.nodeId}`;
	if (command.kind === "set-fixed-position") return `${command.kind}:${command.mode}:${command.nodeId}`;
	if (command.kind === "show-this-object") return `${command.kind}:${objectLabel(command.object)}`;
	return command.kind;
}

function objectLabel(object: GraphExcludedObjectPayload["object"]): string {
	if (object.kind === "node") return object.nodeId;
	if (object.kind === "community") return object.communityId;
	return object.aggregationId;
}

function excludedReasonLabel(reason: GraphExcludedObjectPayload["reason"]): string {
	if (reason === "filter") return "当前筛选暂时隐藏了这个对象。";
	if (reason === "aggregation") return "这个对象收在聚合容器里。";
	if (reason === "search") return "当前搜索范围暂时隐藏了这个对象。";
	return "当前社区视角暂时隐藏了这个对象。";
}

function unavailableReasonLabel(reason: GraphUnavailableObjectPayload["reason"]): string {
	if (reason === "missing-community") return "这个社区当前不可用。";
	if (reason === "missing-aggregation") return "这个聚合对象当前不可用。";
	return "这个节点当前不可用。";
}
