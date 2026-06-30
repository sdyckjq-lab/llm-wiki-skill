import React from "react";
import type { Selection, SelectionAction } from "@llm-wiki/graph-engine";

import { GraphGroupDrawer } from "./GraphGroupDrawer";
import { graphSelectionGroupDrawerViewModel } from "../lib/graph-group-drawer";

interface Props {
	title: string;
	selection: Selection;
	freeText: string;
	onFreeTextChange: (value: string) => void;
	onAsk: (action: SelectionAction | null) => void;
	onAskInNewConversation: (action: SelectionAction | null) => void;
}

export function GraphSelection({
	title,
	selection,
	freeText,
	onFreeTextChange,
	onAsk,
	onAskInNewConversation,
}: Props) {
	const view = graphSelectionGroupDrawerViewModel(title, selection);
	return (
		<React.Fragment>
			<GraphGroupDrawer
				key={view.nodeListKey}
				testId="graph-selection-drawer"
				view={view}
				freeText={freeText}
				nodeSectionTitle="选中页面"
				onFreeTextChange={onFreeTextChange}
				onAsk={onAsk}
				onAskInNewConversation={onAskInNewConversation}
			/>
		</React.Fragment>
	);
}
