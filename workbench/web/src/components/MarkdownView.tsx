import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { emitWikiLinkSeen, extractWikiPageRefs, normalizeWikiLinks } from "../lib/wiki-links";

interface Props {
	content: string;
	onOpenPage?: (path: string) => void;
	onWikiLinkSeen?: (path: string) => void;
	autoEmitWikiLinks?: boolean;
}

export function MarkdownView({ content, onOpenPage, onWikiLinkSeen, autoEmitWikiLinks = true }: Props) {
	useEffect(() => {
		if (!autoEmitWikiLinks || !onWikiLinkSeen) return;
		for (const path of extractWikiPageRefs(content)) {
			onWikiLinkSeen(path);
			emitWikiLinkSeen(path);
		}
	}, [autoEmitWikiLinks, content, onWikiLinkSeen]);

	return (
		<div className="prose prose-invert max-w-none prose-pre:bg-background prose-pre:text-foreground prose-code:text-foreground">
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkPaperHighlight]}
				components={{
					a: ({ href, children }) => {
						if (href?.startsWith("wiki/")) {
							return (
								<a
									href={href}
									onClick={(e) => {
										e.preventDefault();
										onWikiLinkSeen?.(href);
										emitWikiLinkSeen(href);
										onOpenPage?.(href);
									}}
									className="at"
								>
									{children}
								</a>
							);
						}
						return (
							<a href={href} target="_blank" rel="noopener noreferrer">
								{children}
							</a>
						);
					},
				}}
			>
				{normalizeWikiLinks(content)}
			</ReactMarkdown>
		</div>
	);
}

type MarkdownNode = {
	type?: string;
	value?: string;
	children?: MarkdownNode[];
	data?: Record<string, unknown>;
};

function remarkPaperHighlight() {
	return (tree: MarkdownNode) => {
		visitTextParents(tree);
	};
}

function visitTextParents(node: MarkdownNode): void {
	if (!node.children) return;
	const nextChildren: MarkdownNode[] = [];
	let changed = false;
	for (const child of node.children) {
		if (child.type === "text" && typeof child.value === "string") {
			const split = splitHighlightText(child.value);
			if (split.length > 1 || split[0] !== child) changed = true;
			nextChildren.push(...split);
			continue;
		}
		visitTextParents(child);
		nextChildren.push(child);
	}
	if (changed) node.children = nextChildren;
}

function splitHighlightText(value: string): MarkdownNode[] {
	const nodes: MarkdownNode[] = [];
	const pattern = /==([^=\n][^\n]*?[^=\n])==/g;
	let lastIndex = 0;
	for (const match of value.matchAll(pattern)) {
		const index = match.index ?? 0;
		if (index > lastIndex) nodes.push({ type: "text", value: value.slice(lastIndex, index) });
		nodes.push({
			type: "emphasis",
			data: { hName: "mark", hProperties: { className: "hl" } },
			children: [{ type: "text", value: match[1] }],
		});
		lastIndex = index + match[0].length;
	}
	if (lastIndex === 0) return [{ type: "text", value }];
	if (lastIndex < value.length) nodes.push({ type: "text", value: value.slice(lastIndex) });
	return nodes;
}
