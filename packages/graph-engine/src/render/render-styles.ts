export function ensureGraphRendererStyles(doc: Document): void {
  if (doc.getElementById("llm-wiki-graph-engine-static-styles")) return;
  const style = doc.createElement("style");
  style.id = "llm-wiki-graph-engine-static-styles";
  style.textContent = STATIC_RENDERER_CSS;
  doc.head.appendChild(style);
}

const STATIC_RENDERER_CSS = `
.llm-wiki-graph-engine {
  position: relative;
  width: 100%;
  min-height: 520px;
  height: 100%;
  overflow: hidden;
  overscroll-behavior: contain;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  color: var(--ink);
  font-family: var(--font-ui);
  background:
    radial-gradient(ellipse at 28% 55%, color-mix(in srgb, var(--surface) 56%, transparent), transparent 56%),
    radial-gradient(ellipse at 70% 48%, color-mix(in srgb, var(--mist) 60%, transparent), transparent 58%),
    var(--bg);
}
.llm-wiki-graph-engine[data-theme="mo-ye"] {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-2) 38%, transparent), transparent 34%),
    radial-gradient(ellipse at 28% 56%, color-mix(in srgb, var(--night) 13%, transparent), transparent 58%),
    radial-gradient(ellipse at 76% 38%, color-mix(in srgb, var(--cinnabar) 9%, transparent), transparent 54%),
    var(--bg);
}
[data-llm-wiki-graph-route-transition] > .sigma-global-route,
[data-llm-wiki-graph-route-transition] > [data-llm-wiki-graph-root="true"],
[data-llm-wiki-graph-route-transition] > .graph-over-limit-notice-view {
  animation: graph-route-continuity .16s ease-out both;
}
@media (prefers-reduced-motion: reduce) {
  [data-llm-wiki-graph-route-transition] > .sigma-global-route,
  [data-llm-wiki-graph-route-transition] > [data-llm-wiki-graph-root="true"],
  [data-llm-wiki-graph-route-transition] > .graph-over-limit-notice-view {
    animation: none;
  }
}
@keyframes graph-route-continuity {
  from {
    opacity: .82;
    transform: scale(.996);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
.sigma-global-route,
.sigma-global-renderer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.sigma-global-renderer canvas {
  position: absolute;
  inset: 0;
}
.sigma-global-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}
.sigma-global-node-hit-target,
.sigma-global-community-region,
.sigma-global-community-label {
  position: absolute;
  pointer-events: none;
}
.sigma-global-node-hit-target {
  border: 1px solid currentColor;
  cursor: pointer;
  pointer-events: auto;
  border-radius: 999px;
  opacity: 0;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
}
.sigma-global-node-hit-target:focus-visible {
  outline: 2px solid var(--cinnabar);
  outline-offset: 2px;
  opacity: .2;
}
.sigma-global-community-region {
  border-radius: 999px;
  border: 0;
  opacity: .055;
}
.sigma-global-community-label {
  max-width: 160px;
  overflow: hidden;
  transform: translate(-50%, -50%);
  border-radius: 4px;
  background: color-mix(in srgb, var(--surface) 58%, transparent);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 10%, transparent);
  padding: 1px 5px;
  color: var(--muted);
  font: 11px/1.35 var(--font-ui);
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sigma-global-community-label[data-selected="true"] {
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  color: var(--ink);
  font-weight: 600;
}
.graph-content-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  transform-origin: 0 0;
  will-change: transform;
}
.graph-search {
  position: absolute;
  top: 64px;
  left: 14px;
  z-index: 7;
  display: grid;
  grid-template-columns: minmax(180px, 260px) auto;
  align-items: center;
  gap: 8px;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-6px);
  transition: opacity .16s ease, transform .16s ease;
}
.graph-search[data-state="open"],
.graph-search:focus-within {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
.graph-search-input {
  touch-action: auto;
  user-select: text;
  -webkit-user-select: text;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--rule) 78%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  padding: 8px 10px;
  color: var(--ink);
  font: 13px/1.3 var(--font-ui);
  outline: none;
  box-shadow: 0 12px 24px rgba(36, 24, 12, .08);
}
.llm-wiki-graph-engine[data-theme="mo-ye"] .graph-search-input {
  background: color-mix(in srgb, var(--surface) 88%, transparent);
}
.graph-search-input:focus {
  border-color: color-mix(in srgb, var(--cinnabar) 70%, transparent);
}
.graph-search-status {
  border: 1px solid color-mix(in srgb, var(--rule) 68%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 84%, transparent);
  padding: 5px 8px;
  color: var(--muted);
  font-size: 11px;
  white-space: nowrap;
}
.graph-toolbar {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 14px;
  z-index: 8;
  display: grid;
  justify-items: start;
  pointer-events: none;
}
.graph-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  border: 1px solid color-mix(in srgb, var(--rule) 62%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 64%, transparent);
  box-shadow: 0 14px 30px rgba(36, 24, 12, .08);
  backdrop-filter: blur(14px);
  padding: 4px;
  pointer-events: auto;
}
.llm-wiki-graph-engine[data-theme="mo-ye"] .graph-toolbar-actions {
  background: color-mix(in srgb, var(--surface) 58%, transparent);
}
.graph-toolbar-button {
  user-select: none;
  -webkit-user-select: none;
  min-height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font: 12px/1.2 var(--font-ui);
  padding: 0 10px;
  cursor: pointer;
  white-space: nowrap;
}
.graph-toolbar-button:hover,
.graph-toolbar-button[data-active="true"] {
  background: color-mix(in srgb, var(--cinnabar) 10%, transparent);
  color: var(--ink);
}
.graph-toolbar-panel {
  width: min(320px, calc(100vw - 28px));
  max-height: min(58vh, 420px);
  margin-top: 8px;
  border: 1px solid color-mix(in srgb, var(--rule) 62%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  box-shadow: 0 20px 42px rgba(36, 24, 12, .12);
  backdrop-filter: blur(16px);
  overflow: auto;
  pointer-events: auto;
}
.llm-wiki-graph-engine[data-theme="mo-ye"] .graph-toolbar-panel {
  background: color-mix(in srgb, var(--surface) 62%, transparent);
}
.graph-toolbar-panel[data-state="closed"] {
  display: none;
}
.graph-toolbar-section {
  display: none;
}
.graph-toolbar-panel[data-state="filters"] .graph-toolbar-filters,
.graph-toolbar-panel[data-state="legend"] .graph-toolbar-legend {
  display: block;
}
.graph-toolbar-section-title {
  padding: 10px 12px;
  color: var(--muted);
  font: 12px/1.3 var(--font-ui);
}
.graph-type-filter {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--rule) 52%, transparent);
  padding: 0 10px 10px;
}
.graph-type-filter .graph-toolbar-section-title {
  grid-column: 1 / -1;
  padding: 10px 2px 2px;
}
.graph-type-filter-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 28px;
  border: 1px solid color-mix(in srgb, var(--rule) 52%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface) 48%, transparent);
  padding: 0 8px;
  color: var(--ink);
  font: 12px/1.2 var(--font-ui);
  cursor: pointer;
}
.graph-type-filter-option input {
  margin: 0;
  accent-color: var(--cinnabar);
}
.graph-type-filter-option span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.graph-edge-legend {
  display: grid;
  gap: 12px;
  padding: 0 12px 12px;
}
.graph-edge-legend-group {
  display: grid;
  gap: 7px;
}
.graph-edge-legend-heading {
  color: var(--muted);
  font: 11px/1.2 var(--font-ui);
}
.graph-edge-legend-row {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 24px;
  color: var(--ink);
  font: 12px/1.2 var(--font-ui);
}
.graph-edge-legend-swatch,
.graph-edge-legend-line {
  display: block;
  width: 34px;
  height: 0;
  border-top: 2px solid color-mix(in srgb, var(--night) 66%, transparent);
}
.graph-edge-legend-relation.relation-contrast .graph-edge-legend-swatch {
  border-top-color: color-mix(in srgb, var(--amber) 82%, transparent);
}
.graph-edge-legend-relation.relation-conflict .graph-edge-legend-swatch {
  border-top-color: color-mix(in srgb, #d94693 78%, transparent);
}
.graph-edge-legend-confidence.confidence-inferred .graph-edge-legend-line {
  border-top-style: dashed;
}
.graph-edge-legend-confidence.confidence-ambiguous .graph-edge-legend-line {
  border-top-style: dotted;
}
.llm-wiki-graph-engine[data-theme="mo-ye"] .graph-edge-legend-swatch,
.llm-wiki-graph-engine[data-theme="mo-ye"] .graph-edge-legend-line {
  border-top-color: color-mix(in srgb, var(--line) 70%, transparent);
}
.llm-wiki-graph-engine[data-theme="mo-ye"] .graph-edge-legend-relation.relation-contrast .graph-edge-legend-swatch {
  border-top-color: color-mix(in srgb, var(--amber) 76%, transparent);
}
.llm-wiki-graph-engine[data-theme="mo-ye"] .graph-edge-legend-relation.relation-conflict .graph-edge-legend-swatch {
  border-top-color: color-mix(in srgb, #f472b6 78%, transparent);
}
.community-legend {
  width: 100%;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: hidden;
}
.llm-wiki-graph-engine[data-theme="mo-ye"] .community-legend {
  background: transparent;
}
.community-legend-toggle {
  width: 100%;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--rule) 64%, transparent);
  background: transparent;
  padding: 8px 10px;
  color: var(--ink);
  font: 12px/1.3 var(--font-ui);
  text-align: left;
  cursor: pointer;
}
.community-legend[data-state="collapsed"] .community-legend-toggle {
  border-bottom: 0;
}
.community-legend-list {
  display: grid;
}
.community-legend[data-state="collapsed"] .community-legend-list {
  display: none;
}
.community-legend-row {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--rule) 48%, transparent);
  background: transparent;
  padding: 8px 10px;
  color: var(--ink);
  font: 12px/1.3 var(--font-ui);
  cursor: pointer;
  text-align: left;
}
.community-legend-row:first-child {
  border-top: 0;
}
.community-legend-row:hover,
.community-legend-row[data-community-state="active"] {
  background: color-mix(in srgb, var(--cinnabar) 8%, transparent);
}
.community-legend-row[data-community-state="faded"] {
  opacity: .42;
}
.community-legend-swatch {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .12);
}
.community-legend-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.community-legend-count {
  color: var(--muted);
  font-size: 11px;
  white-space: nowrap;
}
.graph-selection-panel {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 7;
  display: grid;
  gap: 12px;
  width: min(360px, calc(100% - 32px));
  max-height: min(520px, calc(100% - 32px));
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--rule) 72%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  box-shadow: 0 18px 36px rgba(36, 24, 12, .14);
  padding: 14px;
  opacity: 0;
  pointer-events: none;
  touch-action: auto;
  user-select: text;
  -webkit-user-select: text;
  transform: translateY(8px);
  transition: opacity .16s ease, transform .16s ease;
}
.graph-selection-panel[data-state="open"] {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
.llm-wiki-graph-engine[data-theme="mo-ye"] .graph-selection-panel {
  background: color-mix(in srgb, var(--surface) 88%, transparent);
}
.graph-selection-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: center;
  gap: 8px;
}
.graph-selection-title {
  overflow: hidden;
  color: var(--ink);
  font: 600 14px/1.35 var(--font-ui);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.graph-selection-close {
  width: 28px;
  height: 28px;
  border: 1px solid color-mix(in srgb, var(--rule) 72%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--ink);
  cursor: pointer;
  font-size: 17px;
  line-height: 1;
}
.graph-selection-hint,
.graph-selection-empty {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}
.graph-selection-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}
.graph-selection-fact {
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--rule) 58%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--mist) 52%, transparent);
  padding: 8px 6px;
}
.graph-selection-fact strong,
.graph-selection-fact span {
  display: block;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.graph-selection-fact strong {
  color: var(--ink);
  font-size: 15px;
}
.graph-selection-fact span {
  margin-top: 2px;
  color: var(--muted);
  font-size: 11px;
}
.graph-selection-pages {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.graph-selection-page {
  min-width: 0;
  border-top: 1px solid color-mix(in srgb, var(--rule) 46%, transparent);
  padding-top: 7px;
}
.graph-selection-page:first-child {
  border-top: 0;
  padding-top: 0;
}
.graph-selection-page-title,
.graph-selection-page-path {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.graph-selection-page-title {
  color: var(--ink);
  font-size: 13px;
}
.graph-selection-page-path {
  margin-top: 2px;
  color: var(--muted);
  font-size: 11px;
}
.graph-content-layer.is-viewport-animating {
  transition: transform .2s ease-out;
}
.llm-wiki-graph-engine[data-interaction-mode="active"] .node {
  box-shadow: 0 8px 16px rgba(36, 31, 26, .06);
}
.llm-wiki-graph-engine[data-interaction-mode="active"] .node:not([data-traceable="true"]) {
  border-color: color-mix(in srgb, var(--rule) 88%, transparent);
  box-shadow: 0 8px 14px rgba(36, 31, 26, .04);
}
.llm-wiki-graph-engine[data-interaction-mode="active"] .node:not([data-traceable="true"])::before {
  opacity: .12;
}
.llm-wiki-graph-engine[data-interaction-mode="active"] .node:not([data-traceable="true"]) .node-name,
.llm-wiki-graph-engine[data-interaction-mode="active"] .node:not([data-traceable="true"]) .node-meta {
  display: none;
}
.llm-wiki-graph-engine[data-interaction-mode="active"] .node:not([data-traceable="true"]).is-point,
.llm-wiki-graph-engine[data-interaction-mode="active"] .node:not([data-traceable="true"]).is-overview,
.llm-wiki-graph-engine[data-interaction-mode="active"] .node:not([data-traceable="true"])[data-visual-role="map-pin"] {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--night) 8%, transparent);
}
.llm-wiki-graph-engine[data-interaction-mode="active"] .edge:not([data-traceable="true"]) {
  opacity: .08 !important;
}
.llm-wiki-graph-engine[data-interaction-mode="active"] .edge[data-traceable="true"] {
  opacity: .46;
}
.llm-wiki-graph-engine[data-interaction-mode="active"] .community-wash {
  opacity: .08;
}
.llm-wiki-graph-engine[data-interaction-mode="active"] .node[data-traceable="true"] .node-name,
.llm-wiki-graph-engine[data-interaction-mode="active"] .node[aria-pressed="true"] .node-name {
  display: block;
}
.llm-wiki-graph-engine[data-interaction-mode="active"] .node[data-traceable="true"] .node-meta {
  display: flex;
}
.llm-wiki-graph-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.edge {
  fill: none;
  stroke-linecap: round;
  opacity: .74;
  pointer-events: stroke;
}
.edge[data-filter-state="hidden"],
.community-wash[data-filter-state="hidden"] {
  opacity: .04 !important;
  pointer-events: none;
}
.edge.is-diff-added {
  stroke-dasharray: var(--diff-edge-length, 180);
  stroke-dashoffset: var(--diff-edge-length, 180);
  animation: llm-wiki-edge-draw 1.15s ease forwards;
}
.edge.is-diff-removed {
  animation: llm-wiki-fade-out .72s ease forwards;
}
.edge.relation-implementation,
.edge.relation-dependency,
.edge.relation-derivation {
  stroke: color-mix(in srgb, var(--night) 66%, transparent);
}
.edge.relation-contrast {
  stroke: color-mix(in srgb, var(--amber) 82%, transparent);
}
.edge.relation-conflict {
  stroke: color-mix(in srgb, #d94693 78%, transparent);
}
.edge.confidence-inferred { stroke-dasharray: 6 8; }
.edge.confidence-ambiguous { stroke-dasharray: 2 7; }
.edge.confidence-unverified { stroke-dasharray: 1 8; }
.llm-wiki-graph-engine[data-theme="mo-ye"] .edge {
  opacity: .82;
}
.llm-wiki-graph-engine[data-theme="mo-ye"] .edge.relation-implementation,
.llm-wiki-graph-engine[data-theme="mo-ye"] .edge.relation-dependency,
.llm-wiki-graph-engine[data-theme="mo-ye"] .edge.relation-derivation {
  stroke: color-mix(in srgb, var(--line) 70%, transparent);
}
.llm-wiki-graph-engine[data-theme="mo-ye"] .edge.relation-contrast {
  stroke: color-mix(in srgb, var(--amber) 76%, transparent);
}
.llm-wiki-graph-engine[data-theme="mo-ye"] .edge.relation-conflict {
  stroke: color-mix(in srgb, #f472b6 78%, transparent);
}
.community-wash {
  transition: opacity .16s ease, cx .24s ease, cy .24s ease, rx .24s ease, ry .24s ease;
}
.llm-wiki-graph-engine[data-community-boundary-certainty="reduced"] .community-wash {
  stroke-dasharray: 12 8;
  stroke-width: .95;
}
.llm-wiki-graph-engine[data-community-boundary-certainty="low"] .community-wash {
  stroke-dasharray: 7 10;
  stroke-width: .75;
  filter: grayscale(.18);
}
.llm-wiki-graph-engine[data-theme="mo-ye"] .community-wash {
  mix-blend-mode: screen;
  filter: saturate(.9);
}
.community-wash.is-diff-new-community {
  animation: llm-wiki-community-emerge .85s ease both;
}
.llm-wiki-graph-engine[data-dragging] .community-wash {
  opacity: .035;
}
.graph-quality-notice {
  position: absolute;
  left: 14px;
  bottom: 14px;
  z-index: 7;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(420px, calc(100% - 28px));
  border: 1px solid color-mix(in srgb, var(--rule) 58%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 76%, transparent);
  box-shadow: 0 14px 28px rgba(36, 24, 12, .08);
  backdrop-filter: blur(14px);
  padding: 7px 8px 7px 10px;
  color: var(--muted);
  font: 12px/1.25 var(--font-ui);
  pointer-events: auto;
}
.graph-quality-notice[data-quality-level="poor"] {
  border-color: color-mix(in srgb, var(--cinnabar) 42%, transparent);
  color: var(--ink);
}
.graph-quality-notice-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.graph-quality-notice-action {
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--rule) 58%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface) 62%, transparent);
  padding: 5px 8px;
  color: var(--ink);
  font: 12px/1.2 var(--font-ui);
  cursor: pointer;
}
.graph-quality-notice-action:hover {
  border-color: color-mix(in srgb, var(--cinnabar) 54%, transparent);
}
.node-layer {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}
.aggregation-container {
  position: absolute;
  z-index: 2;
  display: grid;
  place-items: center;
  gap: 2px;
  width: calc(var(--aggregation-radius, 48px) * 2);
  height: calc(var(--aggregation-radius, 48px) * 2);
  border: 1px solid color-mix(in srgb, var(--aggregation-color, var(--cinnabar)) 58%, transparent);
  border-radius: 999px;
  background:
    radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--aggregation-color, var(--cinnabar)) 18%, transparent), transparent 62%),
    color-mix(in srgb, var(--surface) 58%, transparent);
  box-shadow: inset 0 0 0 10px color-mix(in srgb, var(--aggregation-color, var(--cinnabar)) 7%, transparent), 0 18px 34px rgba(36, 31, 26, .08);
  color: var(--ink);
  cursor: pointer;
  pointer-events: auto;
  text-align: center;
  translate: -50% -50%;
}
.aggregation-container:hover,
.aggregation-container:focus-visible,
.aggregation-container[aria-pressed="true"] {
  border-color: color-mix(in srgb, var(--aggregation-color, var(--cinnabar)) 84%, transparent);
  box-shadow: inset 0 0 0 10px color-mix(in srgb, var(--aggregation-color, var(--cinnabar)) 12%, transparent), 0 18px 34px rgba(36, 31, 26, .14);
}
.aggregation-container[data-selected="true"] {
  outline: 2px solid color-mix(in srgb, var(--cinnabar) 72%, transparent);
  outline-offset: 3px;
}
.aggregation-container[data-community-state="faded"] {
  opacity: .34;
}
.aggregation-container[data-community-state="active"] {
  opacity: 1;
}
.aggregation-container-count {
  font: 700 18px/1 var(--font-ui);
}
.aggregation-container-label {
  max-width: 78%;
  overflow: hidden;
  color: var(--muted);
  font: 11px/1.2 var(--font-ui);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aggregation-container-markers {
  display: flex;
  justify-content: center;
  gap: 3px;
  max-width: 92%;
  min-height: 14px;
  overflow: hidden;
}
.aggregation-container-marker {
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 76%, transparent);
  padding: 1px 4px;
  color: var(--muted);
  font: 9px/1.2 var(--font-ui);
  white-space: nowrap;
}
.graph-hover-preview {
  position: absolute;
  z-index: 9;
  width: min(300px, calc(100% - 32px));
  pointer-events: none;
  opacity: 0;
  transition: opacity .14s ease;
}
.graph-hover-preview[data-state="open"] {
  opacity: 1;
}
.graph-hover-preview-card {
  border: 1px solid color-mix(in srgb, var(--rule) 74%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  box-shadow: 0 18px 34px rgba(36, 31, 26, .16);
  padding: 11px 12px;
}
.llm-wiki-graph-engine[data-theme="mo-ye"] .graph-hover-preview-card {
  border-color: color-mix(in srgb, var(--line) 38%, transparent);
  background: color-mix(in srgb, var(--surface) 90%, transparent);
  box-shadow: 0 18px 36px rgba(0, 0, 0, .38);
}
.graph-hover-preview-type {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.2;
}
.graph-hover-preview-title {
  margin-top: 3px;
  overflow: hidden;
  color: var(--ink);
  font-family: var(--font-serif);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.graph-hover-preview-summary {
  display: -webkit-box;
  margin: 7px 0 0;
  overflow: hidden;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.node {
  position: absolute;
  z-index: 3;
  pointer-events: auto;
  min-height: 46px;
  max-width: 178px;
  padding: 8px 11px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--rule) 98%, transparent);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  box-shadow: 0 12px 22px rgba(36, 31, 26, .09), inset 0 0 0 1px rgba(255, 255, 255, .32);
  translate: -50% -50%;
  text-align: left;
  color: var(--ink);
  transition:
    opacity .16s ease,
    width .16s ease,
    height .16s ease,
    min-width .16s ease,
    min-height .16s ease,
    max-width .16s ease,
    padding .16s ease,
    border-radius .16s ease,
    border-color .16s ease,
    background-color .16s ease,
    box-shadow .16s ease;
}
.llm-wiki-graph-engine[data-theme="mo-ye"] .node {
  border-color: color-mix(in srgb, var(--rule) 84%, transparent);
  background: color-mix(in srgb, var(--surface) 86%, transparent);
  box-shadow: 0 16px 30px rgba(0, 0, 0, .34), inset 0 0 0 1px rgba(245, 240, 230, .07);
}
.node::before {
  content: "";
  position: absolute;
  inset: -7px;
  border-radius: 17px;
  background: radial-gradient(circle, color-mix(in srgb, var(--night) 18%, transparent), transparent 66%);
  z-index: -1;
  opacity: .46;
}
.llm-wiki-graph-engine[data-theme="mo-ye"] .node::before {
  background: radial-gradient(circle, color-mix(in srgb, var(--night) 24%, transparent), transparent 68%);
  opacity: .4;
}
.node[data-type="topic"] { border-left: 5px solid var(--cinnabar); }
.node[data-type="entity"] { border-left: 5px solid var(--night); }
.node[data-type="source"] { border-left: 5px solid var(--jade); }
.node[aria-pressed="true"] {
  border-color: color-mix(in srgb, var(--cinnabar) 74%, transparent);
  box-shadow: 0 16px 28px color-mix(in srgb, var(--cinnabar) 16%, transparent), 0 0 0 4px color-mix(in srgb, var(--cinnabar) 10%, transparent);
  transform: translateY(-2px);
}
.node[data-search-state="match"] {
  border-color: color-mix(in srgb, var(--cinnabar) 78%, transparent);
  box-shadow: 0 16px 28px color-mix(in srgb, var(--cinnabar) 15%, transparent), 0 0 0 4px color-mix(in srgb, var(--cinnabar) 9%, transparent);
}
.node[data-search-focus="true"] {
  outline: 3px solid color-mix(in srgb, var(--cinnabar) 68%, transparent);
  outline-offset: 4px;
}
.node[data-search-state="faded"] {
  opacity: .28;
}
.node[data-filter-state="hidden"] {
  opacity: .08;
  pointer-events: none;
}
.node[data-community-state="faded"] {
  opacity: .24;
}
.edge[data-community-state="faded"],
.community-wash[data-community-state="faded"] {
  opacity: .12 !important;
}
.community-wash[data-community-state="active"] {
  opacity: .2;
}
.node.is-dragging {
  cursor: grabbing;
  z-index: 8;
  box-shadow: 0 18px 34px color-mix(in srgb, var(--cinnabar) 18%, transparent), 0 0 0 4px color-mix(in srgb, var(--cinnabar) 10%, transparent);
}
.node.is-pinned::after {
  content: "";
  position: absolute;
  right: -5px;
  top: -5px;
  width: 10px;
  height: 10px;
  border: 2px solid color-mix(in srgb, var(--surface) 92%, transparent);
  border-radius: 99px;
  background: var(--cinnabar);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--cinnabar) 13%, transparent);
}
.node-kind {
  display: none;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: .04em;
  text-transform: uppercase;
}
.node-name {
  display: block;
  max-width: 146px;
  margin-top: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.25;
}
.node-meta {
  display: none;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  color: var(--faint);
  font-size: 11px;
}
.node:hover .node-kind,
.node[aria-pressed="true"] .node-kind {
  display: block;
}
.node:hover .node-name,
.node[aria-pressed="true"] .node-name {
  margin-top: 3px;
}
.node:hover .node-meta,
.node[aria-pressed="true"] .node-meta {
  display: flex;
}
.spark {
  width: 5px;
  height: 5px;
  border-radius: 99px;
  background: var(--night);
  box-shadow: 0 0 10px color-mix(in srgb, var(--night) 70%, transparent);
}
.node.is-compact {
  min-height: 34px;
  max-width: 130px;
  padding: 6px 9px;
  border-radius: 10px;
}
.node.is-compact .node-kind,
.node.is-compact .node-meta { display: none; }
.node.is-compact .node-name {
  max-width: 104px;
  font-size: 12px;
}
.node.is-point,
.node.is-overview,
.node[data-visual-role="map-pin"] {
  width: 14px;
  height: 14px;
  min-width: 14px;
  min-height: 14px;
  max-width: 14px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--night);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--night) 14%, transparent);
}
.node.is-point[data-type="topic"],
.node.is-overview[data-type="topic"] { background: var(--cinnabar); }
.node.is-point[data-type="source"],
.node.is-overview[data-type="source"] { background: var(--jade); }
.node.is-point .node-kind,
.node.is-point .node-name,
.node.is-point .node-meta,
.node.is-overview .node-kind,
.node.is-overview .node-name,
.node.is-overview .node-meta { display: none; }
.node.is-label-hidden .node-name { display: none; }
.node[data-visual-role="landmark"] {
  min-height: 30px;
  max-width: 150px;
  padding: 5px 10px 5px 24px;
  border: 1px solid color-mix(in srgb, var(--rule) 78%, transparent);
  border-radius: 999px 8px 8px 999px;
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  box-shadow: 0 8px 16px rgba(36, 31, 26, .06);
}
.llm-wiki-graph-engine[data-theme="mo-ye"] .node[data-visual-role="landmark"] {
  border-color: color-mix(in srgb, var(--line) 38%, transparent);
  background: color-mix(in srgb, var(--surface) 64%, transparent);
  box-shadow: 0 10px 20px rgba(0, 0, 0, .22);
}
.node[data-visual-role="landmark"]::before {
  inset: auto auto auto 9px;
  top: 50%;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--night);
  opacity: .78;
  translate: 0 -50%;
}
.node[data-visual-role="landmark"][data-type="topic"]::before { background: var(--cinnabar); }
.node[data-visual-role="landmark"][data-type="source"]::before { background: var(--jade); }
.node[data-visual-role="landmark"] .node-kind,
.node[data-visual-role="landmark"] .node-meta { display: none; }
.node[data-visual-role="landmark"] .node-name {
  max-width: 116px;
  margin-top: 0;
  font-size: 12px;
  line-height: 1.2;
}
.node[data-visual-role="index-slip"],
.node[data-visual-role="cinnabar-note"] {
  min-height: 42px;
  max-width: 182px;
  padding: 8px 11px 8px 13px;
  border-radius: 8px 12px 12px 8px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  box-shadow: 0 13px 24px rgba(36, 31, 26, .1), inset 0 0 0 1px rgba(255, 255, 255, .32);
}
.llm-wiki-graph-engine[data-theme="mo-ye"] .node[data-visual-role="index-slip"],
.llm-wiki-graph-engine[data-theme="mo-ye"] .node[data-visual-role="cinnabar-note"] {
  background: color-mix(in srgb, var(--surface-2) 88%, transparent);
  box-shadow: 0 16px 30px rgba(0, 0, 0, .38), inset 0 0 0 1px rgba(245, 240, 230, .09);
}
.node[data-visual-role="cinnabar-note"] {
  border-color: color-mix(in srgb, var(--cinnabar) 78%, transparent);
  box-shadow: 0 17px 30px color-mix(in srgb, var(--cinnabar) 18%, transparent), 0 0 0 4px color-mix(in srgb, var(--cinnabar) 11%, transparent);
}
.node.is-disabled { opacity: .72; }
.node.is-diff-added {
  animation: llm-wiki-node-grow .96s cubic-bezier(.18,.82,.22,1) both;
  animation-delay: var(--diff-delay, 0ms);
}
.node.is-diff-removed {
  animation: llm-wiki-fade-out .72s ease forwards;
}
.node.is-diff-recolored {
  animation: llm-wiki-node-recolor .92s ease both;
}
.mini-map {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 4;
  width: 160px;
  height: 54px;
  border: 1px solid color-mix(in srgb, var(--rule) 86%, transparent);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--surface) 74%, transparent);
  box-shadow: var(--soft-shadow);
}
.llm-wiki-graph-engine[data-theme="mo-ye"] .mini-map,
.llm-wiki-graph-engine[data-theme="mo-ye"] .graph-reader {
  border-color: color-mix(in srgb, var(--line) 34%, transparent);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  box-shadow: var(--soft-shadow), inset 0 0 0 1px rgba(245, 240, 230, .05);
}
.mini-map svg {
  width: 100%;
  height: 100%;
  display: block;
}
.mini-map .is-selected {
  stroke: var(--cinnabar);
  stroke-width: 1.5;
}
.mini-map-viewport {
  fill: color-mix(in srgb, var(--cinnabar) 7%, transparent);
  stroke: color-mix(in srgb, var(--cinnabar) 78%, transparent);
  stroke-width: 1.2;
  rx: 3;
  pointer-events: none;
}
.graph-reader {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 6;
  display: flex;
  flex-direction: column;
  width: min(360px, calc(100% - 32px));
  max-height: calc(100% - 100px);
  border: 1px solid color-mix(in srgb, var(--rule) 82%, transparent);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  box-shadow: var(--soft-shadow);
  opacity: 0;
  pointer-events: none;
  touch-action: auto;
  user-select: text;
  -webkit-user-select: text;
  transform: translateY(-4px);
  transition: opacity .18s ease, transform .18s ease;
}
.graph-reader[data-state="open"] {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
.graph-reader-header {
  position: relative;
  padding: 14px 42px 10px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--rule) 72%, transparent);
}
.graph-reader-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 700;
}
.graph-reader-meta {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
}
.graph-reader-meta span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.graph-reader-close {
  position: absolute;
  top: 9px;
  right: 10px;
  width: 26px;
  height: 26px;
  border: 1px solid color-mix(in srgb, var(--rule) 78%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  color: var(--ink);
}
.graph-reader-body {
  min-height: 0;
  overflow: auto;
  touch-action: auto;
  user-select: text;
  -webkit-user-select: text;
  padding: 12px 14px 14px;
}
.graph-reader-source {
  display: inline-block;
  max-width: 100%;
  margin-bottom: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: top;
  white-space: nowrap;
  color: var(--cinnabar);
  font-size: 12px;
}
.graph-reader-body pre {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: var(--font-serif);
  font-size: 13px;
  line-height: 1.65;
}
.graph-reader-empty {
  margin: 0;
  padding: 12px 14px;
  color: var(--muted);
  font-size: 13px;
}
@keyframes llm-wiki-node-grow {
  0% {
    opacity: 0;
    translate: calc(-50% + var(--diff-anchor-dx, 0px)) calc(-50% + var(--diff-anchor-dy, 0px));
    transform: scale(.68);
  }
  100% {
    opacity: 1;
    translate: -50% -50%;
    transform: scale(1);
  }
}
@keyframes llm-wiki-edge-draw {
  to { stroke-dashoffset: 0; }
}
@keyframes llm-wiki-fade-out {
  to { opacity: 0; transform: scale(.82); }
}
@keyframes llm-wiki-node-recolor {
  0% { filter: saturate(.55) brightness(1.18); }
  100% { filter: saturate(1) brightness(1); }
}
@keyframes llm-wiki-community-emerge {
  0% { opacity: 0; transform: scale(.82); }
  100% { transform: scale(1); }
}
`;
