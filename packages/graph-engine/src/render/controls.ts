import type { GraphTypeFilters } from "../types";
import { graphNodeTypeLabel } from "../graph-node";
import type { CommunityLegendRow } from "./legend";
import type { GraphToolbarPanelState } from "./toolbar";

export interface GraphToolbarDom {
  element: HTMLElement;
  panel: HTMLElement;
  filtersPanel: HTMLElement;
  buttons: {
    filters: HTMLButtonElement;
    legend: HTMLButtonElement;
  };
}

export interface CommunityLegendDom {
  element: HTMLElement;
  rows: Map<string, HTMLButtonElement>;
}

export interface SearchControlDom {
  element: HTMLElement;
  input: HTMLInputElement;
  status: HTMLElement;
  results: HTMLElement;
}

export interface GraphSearchResultControlItem {
  id: string;
  label: string;
  meta?: string;
  focused?: boolean;
}

export interface SigmaZoomControlsDom {
  element: HTMLElement;
  buttons: {
    zoomIn: HTMLButtonElement;
    zoomOut: HTMLButtonElement;
  };
}

export function createGraphToolbar(
  ownerDocument: Document,
  options: {
    panelState: GraphToolbarPanelState;
    typeFilters: GraphTypeFilters;
    onPanelToggle: (panel: Exclude<GraphToolbarPanelState, "closed">) => void;
    onTypeFilterToggle: (type: string, enabled: boolean) => void;
    onReset: () => void;
  }
): GraphToolbarDom {
  const element = ownerDocument.createElement("nav");
  element.className = "graph-toolbar";
  element.dataset.panel = options.panelState;
  element.setAttribute("aria-label", "图谱控制");
  element.addEventListener("click", (event) => event.stopPropagation());

  const actions = ownerDocument.createElement("div");
  actions.className = "graph-toolbar-actions";
  const filters = createToolbarButton(ownerDocument, "筛选", options.panelState === "filters");
  filters.addEventListener("click", () => options.onPanelToggle("filters"));
  const legend = createToolbarButton(ownerDocument, "图例", options.panelState === "legend");
  legend.addEventListener("click", () => options.onPanelToggle("legend"));
  const reset = createToolbarButton(ownerDocument, "回全图", false);
  reset.addEventListener("click", options.onReset);
  actions.append(filters, legend, reset);

  const panel = ownerDocument.createElement("section");
  panel.className = "graph-toolbar-panel";
  panel.dataset.state = options.panelState;
  const filtersPanel = ownerDocument.createElement("div");
  filtersPanel.className = "graph-toolbar-section graph-toolbar-filters";
  filtersPanel.appendChild(createTypeFilterGroup(ownerDocument, options.typeFilters, options.onTypeFilterToggle));

  const legendPanel = ownerDocument.createElement("div");
  legendPanel.className = "graph-toolbar-section graph-toolbar-legend";
  const legendTitle = ownerDocument.createElement("div");
  legendTitle.className = "graph-toolbar-section-title";
  legendTitle.textContent = "边";
  legendPanel.appendChild(legendTitle);
  legendPanel.appendChild(createEdgeLegend(ownerDocument));

  panel.append(filtersPanel, legendPanel);
  element.append(actions, panel);
  return { element, panel, filtersPanel, buttons: { filters, legend } };
}

export function createSigmaZoomControls(
  ownerDocument: Document,
  options: {
    onZoomIn: () => void;
    onZoomOut: () => void;
  }
): SigmaZoomControlsDom {
  const element = ownerDocument.createElement("nav");
  element.className = "graph-zoom-controls";
  element.dataset.control = "sigma-zoom";
  element.setAttribute("aria-label", "图谱缩放");
  element.addEventListener("click", (event) => event.stopPropagation());

  const zoomIn = createZoomControlButton(ownerDocument, "+", "放大图谱");
  zoomIn.addEventListener("click", (event) => {
    event.stopPropagation();
    options.onZoomIn();
  });

  const zoomOut = createZoomControlButton(ownerDocument, "-", "缩小图谱");
  zoomOut.addEventListener("click", (event) => {
    event.stopPropagation();
    options.onZoomOut();
  });

  element.append(zoomIn, zoomOut);
  return { element, buttons: { zoomIn, zoomOut } };
}

export function createCommunityLegend(
  ownerDocument: Document,
  options: {
    rows: CommunityLegendRow[];
    collapsed: boolean;
    onToggle: () => void;
    onHover: (id: string | null) => void;
    onSelect: (id: string) => void;
  }
): CommunityLegendDom {
  const element = ownerDocument.createElement("aside");
  element.className = "community-legend";
  element.dataset.state = options.collapsed ? "collapsed" : "open";
  const header = ownerDocument.createElement("button");
  header.type = "button";
  header.className = "community-legend-toggle";
  header.setAttribute("aria-expanded", options.collapsed ? "false" : "true");
  header.textContent = "社区";
  header.addEventListener("click", (event) => {
    event.stopPropagation();
    options.onToggle();
  });
  element.appendChild(header);

  const list = ownerDocument.createElement("div");
  list.className = "community-legend-list";
  const rowMap = new Map<string, HTMLButtonElement>();
  for (const row of options.rows) {
    const button = ownerDocument.createElement("button");
    button.type = "button";
    button.className = "community-legend-row";
    button.dataset.communityId = row.id;
    button.addEventListener("pointerenter", () => options.onHover(row.id));
    button.addEventListener("pointerleave", () => options.onHover(null));
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      options.onSelect(row.id);
    });
    const swatch = ownerDocument.createElement("span");
    swatch.className = "community-legend-swatch";
    swatch.style.background = row.color;
    const label = ownerDocument.createElement("span");
    label.className = "community-legend-label";
    label.textContent = row.label;
    const count = ownerDocument.createElement("span");
    count.className = "community-legend-count";
    count.textContent = `${row.pageCount} 页`;
    button.append(swatch, label, count);
    list.appendChild(button);
    rowMap.set(row.id, button);
  }
  element.appendChild(list);
  return { element, rows: rowMap };
}

export function createSearchControl(
  ownerDocument: Document,
  options: {
    open: boolean;
    query: string;
    onOpen: () => void;
    onQuery: (query: string) => void;
    onNext: () => void;
    onPrevious: () => void;
    onActivate: () => void;
    onActivateResult?: (id: string) => void;
    onClose: () => void;
    results?: GraphSearchResultControlItem[];
  }
): SearchControlDom {
  const element = ownerDocument.createElement("div");
  element.className = "graph-search";
  element.dataset.state = options.open ? "open" : "closed";
  const input = ownerDocument.createElement("input");
  input.type = "search";
  input.className = "graph-search-input";
  input.placeholder = "搜索图谱";
  input.setAttribute("aria-label", "搜索图谱");
  input.value = options.query;
  input.addEventListener("focus", options.onOpen);
  input.addEventListener("input", () => options.onQuery(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      options.onNext();
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      options.onPrevious();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      options.onActivate();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      options.onClose();
    }
  });
  const status = ownerDocument.createElement("span");
  status.className = "graph-search-status";
  status.textContent = options.query ? "0 个结果" : "输入关键词";
  const results = ownerDocument.createElement("div");
  results.className = "graph-search-results-list";
  results.setAttribute("role", "listbox");
  results.setAttribute("aria-label", "图谱搜索结果");
  updateSearchControlResults(results, options.results ?? [], (id) => {
    if (options.onActivateResult) {
      options.onActivateResult(id);
      return;
    }
    options.onActivate();
  });
  element.append(input, status, results);
  return { element, input, status, results };
}

export function updateSearchControlResults(
  results: HTMLElement,
  items: GraphSearchResultControlItem[],
  onActivateResult: (id: string) => void
): void {
  const ownerDocument = results.ownerDocument;
  results.dataset.state = items.length ? "visible" : "hidden";
  const buttons: HTMLElement[] = [];
  for (const item of items) {
    const button = ownerDocument.createElement("button");
    button.type = "button";
    button.className = "graph-search-result-item";
    button.dataset.nodeId = item.id;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", item.focused ? "true" : "false");
    const label = ownerDocument.createElement("span");
    label.className = "graph-search-result-label";
    label.textContent = item.label;
    button.appendChild(label);
    if (item.meta) {
      const meta = ownerDocument.createElement("span");
      meta.className = "graph-search-result-meta";
      meta.textContent = item.meta;
      button.appendChild(meta);
    }
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => onActivateResult(item.id));
    buttons.push(button);
  }
  if (typeof results.replaceChildren === "function") {
    results.replaceChildren(...buttons);
    return;
  }
  results.innerHTML = "";
  for (const button of buttons) results.appendChild(button);
}

function createEdgeLegend(ownerDocument: Document): HTMLElement {
  const legend = ownerDocument.createElement("div");
  legend.className = "graph-edge-legend";
  const relations = ownerDocument.createElement("div");
  relations.className = "graph-edge-legend-group";
  relations.appendChild(createEdgeLegendHeading(ownerDocument, "关系类型"));
  for (const item of [
    { label: "实现 / 依赖 / 衍生", className: "relation-dependency" },
    { label: "对比", className: "relation-contrast" },
    { label: "矛盾", className: "relation-conflict" }
  ]) {
    relations.appendChild(createEdgeLegendRelation(ownerDocument, item.label, item.className));
  }

  const confidences = ownerDocument.createElement("div");
  confidences.className = "graph-edge-legend-group";
  confidences.appendChild(createEdgeLegendHeading(ownerDocument, "置信度"));
  for (const item of [
    { label: "原文", className: "confidence-extracted" },
    { label: "推断", className: "confidence-inferred" },
    { label: "待确认", className: "confidence-ambiguous" }
  ]) {
    confidences.appendChild(createEdgeLegendConfidence(ownerDocument, item.label, item.className));
  }

  legend.append(relations, confidences);
  return legend;
}

function createEdgeLegendHeading(ownerDocument: Document, text: string): HTMLElement {
  const heading = ownerDocument.createElement("div");
  heading.className = "graph-edge-legend-heading";
  heading.textContent = text;
  return heading;
}

function createEdgeLegendRelation(ownerDocument: Document, label: string, className: string): HTMLElement {
  const row = ownerDocument.createElement("div");
  row.className = `graph-edge-legend-row graph-edge-legend-relation ${className}`;
  const swatch = ownerDocument.createElement("span");
  swatch.className = "graph-edge-legend-swatch";
  const text = ownerDocument.createElement("span");
  text.textContent = label;
  row.append(swatch, text);
  return row;
}

function createEdgeLegendConfidence(ownerDocument: Document, label: string, className: string): HTMLElement {
  const row = ownerDocument.createElement("div");
  row.className = `graph-edge-legend-row graph-edge-legend-confidence ${className}`;
  const line = ownerDocument.createElement("span");
  line.className = "graph-edge-legend-line";
  const text = ownerDocument.createElement("span");
  text.textContent = label;
  row.append(line, text);
  return row;
}

function createTypeFilterGroup(
  ownerDocument: Document,
  typeFilters: GraphTypeFilters,
  onToggle: (type: string, enabled: boolean) => void
): HTMLElement {
  const group = ownerDocument.createElement("fieldset");
  group.className = "graph-type-filter";
  const title = ownerDocument.createElement("legend");
  title.className = "graph-toolbar-section-title";
  title.textContent = "类型筛选";
  group.appendChild(title);

  for (const type of orderedGraphNodeTypes(typeFilters)) {
    const label = ownerDocument.createElement("label");
    label.className = "graph-type-filter-option";
    const input = ownerDocument.createElement("input");
    input.type = "checkbox";
    input.checked = typeFilters[type] !== false;
    input.dataset.type = type;
    input.addEventListener("change", () => onToggle(type, input.checked));
    const text = ownerDocument.createElement("span");
    text.textContent = graphNodeTypeLabel(type);
    label.append(input, text);
    group.appendChild(label);
  }

  return group;
}

function orderedGraphNodeTypes(typeFilters: GraphTypeFilters): string[] {
  const preferred = ["entity", "topic", "source"];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const type of preferred) {
    if (Object.hasOwn(typeFilters, type)) {
      ordered.push(type);
      seen.add(type);
    }
  }
  for (const type of Object.keys(typeFilters).sort()) {
    if (!seen.has(type)) ordered.push(type);
  }
  return ordered;
}

function createToolbarButton(ownerDocument: Document, label: string, active: boolean): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = "graph-toolbar-button";
  button.dataset.active = active ? "true" : "false";
  button.textContent = label;
  return button;
}

function createZoomControlButton(ownerDocument: Document, label: string, ariaLabel: string): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = "graph-zoom-button";
  button.textContent = label;
  button.setAttribute("aria-label", ariaLabel);
  return button;
}
