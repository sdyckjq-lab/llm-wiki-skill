import React from "react";

import type { GraphOpenPagePayload } from "@llm-wiki/graph-engine";

import { MarkdownView } from "./MarkdownView";
import {
	graphReaderActions,
	graphReaderMetaItems,
	type GraphReaderActionId,
} from "../lib/graph-reader";

interface Props {
	payload: GraphOpenPagePayload;
	content: string;
	loading: boolean;
	error: string | null;
	onOpenPage: (path: string) => void;
	onWikiLinkSeen: (path: string) => void;
	onAction: (actionId: GraphReaderActionId) => void;
	onRenamePage?: (sourcePath: string) => void;
}

export function GraphReader({ payload, content, loading, error, onOpenPage, onWikiLinkSeen, onAction, onRenamePage }: Props) {
	const metaItems = graphReaderMetaItems(payload);
	const canRename = isFormalGraphPagePath(payload.node.sourcePath);
	return (
		<React.Fragment>
		<article className="graph-reader-drawer">
			<div className="graph-reader-meta-row">
				{metaItems.map((item) => (
					<span key={item}>{item}</span>
				))}
			</div>
			<div className="graph-reader-actions">
				{graphReaderActions().map((action) => (
					<button
						key={action.id}
						type="button"
						className="graph-reader-action"
						onClick={() => onAction(action.id)}
					>
						{action.label}
					</button>
				))}
				{canRename && onRenamePage && (
					<button
						type="button"
						className="graph-reader-action graph-reader-rename-action"
						onClick={() => onRenamePage(payload.node.sourcePath)}
					>
						安全改名
					</button>
				)}
			</div>
			{loading && <div className="text-muted-foreground">加载中...</div>}
			{error && <div className="whitespace-pre-wrap text-destructive">{error}</div>}
			{!loading && !error && (
				<MarkdownView content={content} onOpenPage={onOpenPage} onWikiLinkSeen={onWikiLinkSeen} autoEmitWikiLinks={false} />
			)}
		</article>
		</React.Fragment>
	);
}

function isFormalGraphPagePath(path: string): boolean {
	return /^wiki\/(entities|topics|sources|comparisons|synthesis|queries)\/.+\.md$/.test(path);
}
