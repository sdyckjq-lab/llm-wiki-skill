/* ============================================================
   Knowledge Graph — Hand-drawn paper aesthetic
   ============================================================ */
(function () {
  "use strict";

  const helpers = window.WikiGraphWashHelpers;
  if (!helpers) {
    console.error("[wiki] graph-wash-helpers.js is missing or failed to load");
    return;
  }
  const { truncateLabel, cardDims, createSafeStorage, getWikiStorageNamespace, defaultQueue, normalizeQueue, toggleQueueFavorite, appendQueueNote, summarizeQueue, defaultLearning, normalizeLearning, resolveInitialMode, getCommunityNodeIds, getVisibleNodeIds, getVisibleLinks, buildSearchIndex, filterLinksByTypes, resolveVisibleSnapshot, shouldAutoOpenDrawer } = helpers;

  const NAV_BREAKPOINT = 1180;
  const NOTE_EXCERPT_LIMIT = 140;
  const QUEUE_NOTE_LIMIT = 50;

  const dataEl = document.getElementById("graph-data");
  let DATA;
  try {
    DATA = dataEl ? JSON.parse(dataEl.textContent) : window.SAMPLE_GRAPH;
  } catch (_) {
    DATA = { meta: {}, nodes: [], edges: [], insights: { surprising_connections: [], isolated_nodes: [], bridge_nodes: [], sparse_communities: [], meta: { degraded: true } } };
  }
  const svg = d3.select("#canvas");
  const svgNode = svg.node();
  const mmSvg = d3.select("#minimap-svg");
  const minimapEl = document.getElementById("minimap");
  const minimapToggle = document.getElementById("minimap-toggle");
  const drawerNeighbors = document.getElementById("dr-neighbors");
  const drawerNeighborsHeading = drawerNeighbors ? drawerNeighbors.querySelector("h4") : null;
  const insightsBody = document.getElementById("insights-body");
  const insightsMeta = document.getElementById("insights-meta");
  const secondaryPanel = document.getElementById("secondary-panel");
  const secondaryToggle = document.getElementById("secondary-toggle");
  const secondaryClose = document.getElementById("secondary-close");
  const navPanel = document.getElementById("nav-panel");
  const navCommunities = document.getElementById("nav-communities");
  const navAllCommunities = document.getElementById("nav-all-communities");
  const navAllCommunitiesToggle = document.getElementById("nav-all-communities-toggle");
  const navFocus = document.getElementById("nav-focus");
  const navQueue = document.getElementById("nav-queue");
  const navStart = document.getElementById("nav-start");
  const navSecondaryEntry = document.getElementById("nav-secondary-entry");
  const navInlineHint = document.getElementById("nav-inline-hint");
  const navSearchHint = document.getElementById("nav-search-hint");
  const navSearchEmpty = document.getElementById("nav-search-empty");
  const navToggle = document.getElementById("nav-toggle");
  const navClose = document.getElementById("nav-close");

  // ---------- state ----------
  const state = {
    filters: { EXTRACTED: true, INFERRED: true, AMBIGUOUS: false },
    selected: null,
    hover: null,
    nodes: [],
    links: [],
    communities: {},
    insights: {
      surprising_connections: [],
      isolated_nodes: [],
      bridge_nodes: [],
      sparse_communities: [],
      meta: { degraded: false }
    },
    searchIndex: [],
    tweaks: Object.assign(
      { variant: "wash", sizeMode: "uniform", bubbleMode: "wash", nodeStyle: "card" },
      window.__TWEAKS || {}
    ),
    learning: {
      data: normalizeLearning(DATA.learning),
      activeMode: null,
      activeCommunityId: null,
      recommendedStartNodeId: null,
      pathDegraded: false,
      communityDegraded: false,
      focusMode: "all",
      searchQuery: ""
    },
    visible: {
      ready: false,
      nodeIds: new Set(),
      nodes: [],
      links: [],
      searchIndex: []
    },
    queue: defaultQueue(),
    ui: {
      bootstrappedEntry: false,
      navOpen: false,
      navCollapsed: false,
      allCommunitiesExpanded: false,
      secondaryOpen: false,
      topCommunityIds: []
    }
  };

  let rawLocalStorage = null;
  try {
    rawLocalStorage = window.localStorage;
  } catch (_) {}
  const safeLocalStorage = createSafeStorage(rawLocalStorage, console.warn);
  const storageNamespace = getWikiStorageNamespace(DATA.meta, window.location && window.location.pathname);

  function queueStorageKey(name) {
    return storageNamespace + ":" + name;
  }

  function loadQueueState() {
    const raw = safeLocalStorage.get(queueStorageKey("queue"));
    if (!raw) return defaultQueue();
    try {
      return normalizeQueue(JSON.parse(raw));
    } catch (err) {
      console.warn("[wiki] queue storage parse failed:", err);
      return defaultQueue();
    }
  }

  function persistQueueState() {
    safeLocalStorage.set(queueStorageKey("queue"), JSON.stringify(state.queue));
  }

  function isFavoriteNode(nodeId) {
    return state.queue.favorites.indexOf(String(nodeId)) !== -1;
  }

  function buildNoteText(node, selectedText) {
    const pickedText = typeof selectedText === "string" ? selectedText.trim() : "";
    if (pickedText) return pickedText;
    const raw = String((node && node.content) || "")
      .replace(/^#\s+/gm, "")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    const excerpt = raw.slice(0, NOTE_EXCERPT_LIMIT);
    return node && node.label ? `${node.label}${excerpt ? "：" + excerpt : ""}` : excerpt;
  }

  function createQueueNote(node, selectedText) {
    const createdAt = new Date().toISOString();
    return {
      id: `${node.id}:${Date.now()}`,
      node_id: node.id,
      label: node.label || node.id,
      text: buildNoteText(node, selectedText),
      created_at: createdAt
    };
  }

  state.queue = loadQueueState();

  // ---------- tokens (variants) ----------
  const VARIANTS = {
    wash: {
      // soft watercolor, muted. Primary aesthetic.
      bg1: "#f4ecdb", bg2: "#ebe0c4",
      ink: "#3a3026", inkDim: "#756454", inkFaint: "#ad9e87",
      margin: "#a24a3f",
      nodeFill: "#fbf5e6",
      edgeExtracted: "#5a6e5c", edgeInferred: "#8b7a52", edgeAmbiguous: "#a36250",
      entity: "#4a6a86", topic: "#b08440", source: "#7e5b79",
      // muted, dusty wash colors for community blobs
      commPalette: [
        "#7a96a6", // dusty blue
        "#8a9c7a", // sage
        "#c2a06a", // ochre
        "#a78099", // mauve
        "#b77a66", // clay
        "#9a9666", // olive
        "#7e8896", // slate
        "#a38d6a"  // wheat
      ]
    },
    paper: {
      bg1: "#f6efe0", bg2: "#ede2c8",
      ink: "#2b2620", inkDim: "#6b5e4f", inkFaint: "#a69b87",
      margin: "#b9423a",
      nodeFill: "#fffdf6",
      edgeExtracted: "#3d5a3d", edgeInferred: "#8a6a2a", edgeAmbiguous: "#a04a3f",
      entity: "#2b4e7a", topic: "#b7812f", source: "#7a3f6b",
      commPalette: ["#2b4e7a","#2d6b63","#b7812f","#7a3f6b","#b65239","#6a7a2f","#4a4e5a","#9c4863"]
    },
    vellum: {
      bg1: "#f3e6cc", bg2: "#e5d2a8",
      ink: "#3d2e1f", inkDim: "#7a5f3e", inkFaint: "#b0987a",
      margin: "#8a3a28",
      nodeFill: "#fbefc9",
      edgeExtracted: "#4a3a1e", edgeInferred: "#7a5c2d", edgeAmbiguous: "#8a3a28",
      entity: "#4a3a8a", topic: "#a36a1e", source: "#6a2a5a",
      commPalette: ["#4a3a8a","#3a6a4a","#a36a1e","#6a2a5a","#8a3a28","#5a6a2a","#3a3a4a","#8a3a58"]
    },
    blueprint: {
      bg1: "#1b2838", bg2: "#0f1a28",
      ink: "#d8e6f5", inkDim: "#88a4c0", inkFaint: "#5a7390",
      margin: "#e8b04a",
      nodeFill: "#17222f",
      edgeExtracted: "#6ac2a5", edgeInferred: "#e8b04a", edgeAmbiguous: "#e87a5a",
      entity: "#7ac0e0", topic: "#e8b04a", source: "#c88ad4",
      commPalette: ["#7ac0e0","#6ac2a5","#e8b04a","#c88ad4","#e87a5a","#a8c870","#8894b0","#e08ab0"]
    }
  };

  // ---------- Apply variant to CSS variables ----------
  function applyVariant(name) {
    const v = VARIANTS[name] || VARIANTS.paper;
    const r = document.documentElement.style;
    r.setProperty("--paper-cream", v.bg1);
    r.setProperty("--paper-warm", v.bg2);
    r.setProperty("--paper-ink", v.ink);
    r.setProperty("--paper-ink-dim", v.inkDim);
    r.setProperty("--paper-ink-faint", v.inkFaint);
    r.setProperty("--paper-margin", v.margin);
    r.setProperty("--edge-extracted", v.edgeExtracted);
    r.setProperty("--edge-inferred", v.edgeInferred);
    r.setProperty("--edge-ambiguous", v.edgeAmbiguous);
    r.setProperty("--node-entity", v.entity);
    r.setProperty("--node-topic", v.topic);
    r.setProperty("--node-source", v.source);
    if (name === "blueprint") {
      document.body.style.background = v.bg2;
      document.querySelector(".paper-bg").style.opacity = "0.35";
    } else {
      document.body.style.background = v.bg1;
      document.querySelector(".paper-bg").style.opacity = "1";
    }
    document.body.setAttribute("data-variant", name);
    state.variantTokens = v;
  }

  // ---------- Prepare data ----------
  function prepareData() {
    state.nodes = (DATA.nodes || []).map((n, i) => Object.assign({}, n, {
      idx: i,
      degree: 0
    }));
    state.links = (DATA.edges || []).map(e => Object.assign({}, e, {
      weight: clampWeight(e.weight),
      signals: normalizeSignals(e.signals),
      source_signal_available: e.source_signal_available === true,
      source: e.from,
      target: e.to
    }));
    state.insights = normalizeInsights(DATA.insights);

    const byId = {};
    state.nodes.forEach(n => { byId[n.id] = n; });
    state.links.forEach(l => {
      if (byId[l.source]) byId[l.source].degree++;
      if (byId[l.target]) byId[l.target].degree++;
    });

    const commMap = {};
    state.nodes.forEach(n => {
      const c = n.community == null ? "_none" : String(n.community);
      if (!commMap[c]) commMap[c] = { id: c, nodes: [] };
      commMap[c].nodes.push(n);
    });
    state.communities = commMap;
    state.byId = byId;

    const palette = state.variantTokens.commPalette;
    const commKeys = Object.keys(commMap).filter(k => k !== "_none");
    commKeys.forEach((k, i) => {
      commMap[k].color = palette[i % palette.length];
    });
    if (commMap._none) commMap._none.color = state.variantTokens.inkFaint;

    state.nodes.forEach(n => {
      const c = n.community == null ? "_none" : String(n.community);
      n.commColor = commMap[c].color;
    });

    state.searchIndex = buildSearchIndex(state.nodes);
  }

  // ---------- Node geometry ----------
  function clampWeight(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0.5;
    return Math.max(0, Math.min(1, numeric));
  }

  function normalizeSignals(signals) {
    const safe = signals && typeof signals === "object" ? signals : {};
    return {
      co_citation: Number.isFinite(Number(safe.co_citation)) ? Number(safe.co_citation) : 0,
      source_overlap: Number.isFinite(Number(safe.source_overlap)) ? Number(safe.source_overlap) : null,
      type_affinity: Number.isFinite(Number(safe.type_affinity)) ? Number(safe.type_affinity) : 0.5
    };
  }

  function normalizeInsights(insights) {
    const safe = insights && typeof insights === "object" ? insights : {};
    return {
      surprising_connections: Array.isArray(safe.surprising_connections) ? safe.surprising_connections : [],
      isolated_nodes: Array.isArray(safe.isolated_nodes) ? safe.isolated_nodes : [],
      bridge_nodes: Array.isArray(safe.bridge_nodes) ? safe.bridge_nodes : [],
      sparse_communities: Array.isArray(safe.sparse_communities) ? safe.sparse_communities : [],
      meta: safe.meta && typeof safe.meta === "object" ? safe.meta : { degraded: false }
    };
  }

  function edgeStrokeWidth(edge) {
    return 0.6 + clampWeight(edge.weight) * 2.5;
  }

  function edgeOpacity(edge) {
    return 0.2 + clampWeight(edge.weight) * 0.55;
  }

  function edgeRoughness(edge) {
    return 2.2 - clampWeight(edge.weight) * 1.2;
  }

  function edgeHaloOpacity(edge) {
    return clampWeight(edge.weight) >= 0.6 ? 0.14 + clampWeight(edge.weight) * 0.12 : 0;
  }

  function edgeStrengthSize(edge) {
    return 6 + clampWeight(edge.weight) * 8;
  }

  function shouldShowEndpointDot(edge) {
    return clampWeight(edge.weight) > 0.4;
  }

  function shouldShowBlur(edge) {
    return clampWeight(edge.weight) >= 0.6 && edge._blurRank < 14;
  }

  function nodeRadius(n) {
    const mode = state.tweaks.sizeMode;
    if (mode === "uniform") return 18;
    if (mode === "type") {
      if (n.type === "topic") return 24;
      if (n.type === "source") return 14;
      return 18;
    }
    return 12 + Math.sqrt(n.degree) * 4;
  }

  // Jittered rounded rectangle path (slight imperfection for hand feel)
  function cardPath(w, h, r, seed) {
    const hx = w / 2, hy = h / 2;
    const jit = (k) => Math.sin(seed * (k + 1) * 2.3) * 0.9;
    // start top-left corner, go clockwise
    const tl = [-hx + r + jit(1), -hy + jit(2)];
    const tr = [ hx - r + jit(3), -hy + jit(4)];
    const rt = [ hx + jit(5), -hy + r + jit(6)];
    const rb = [ hx + jit(7),  hy - r + jit(8)];
    const br = [ hx - r + jit(9),  hy + jit(10)];
    const bl = [-hx + r + jit(11), hy + jit(12)];
    const lb = [-hx + jit(13), hy - r + jit(14)];
    const lt = [-hx + jit(15), -hy + r + jit(16)];
    return `M${tl[0]},${tl[1]} L${tr[0]},${tr[1]} Q${hx + jit(17)},${-hy + jit(18)} ${rt[0]},${rt[1]} L${rb[0]},${rb[1]} Q${hx + jit(19)},${hy + jit(20)} ${br[0]},${br[1]} L${bl[0]},${bl[1]} Q${-hx + jit(21)},${hy + jit(22)} ${lb[0]},${lb[1]} L${lt[0]},${lt[1]} Q${-hx + jit(23)},${-hy + jit(24)} ${tl[0]},${tl[1]} Z`;
  }

  // Small folder-tab on top of card (colored by type)
  function tabPath(w, seed, offset) {
    // offset = x-offset of tab from card center
    const tw = 18, th = 8;
    const x0 = offset - tw / 2;
    const x1 = offset + tw / 2;
    const jit = (k) => Math.sin(seed * (k + 1) * 2.7) * 0.6;
    return `M${x0 + jit(1)},0 L${x0 + 2 + jit(2)},${-th + jit(3)} L${x1 - 2 + jit(4)},${-th + jit(5)} L${x1 + jit(6)},0 Z`;
  }

  // ---------- Rough.js helpers (hand-drawn strokes) ----------
  const rc = rough.svg(svgNode, { options: { roughness: 1.3, bowing: 1.5 } });

  function roughEdgePath(x1, y1, x2, y2, seed) {
    // produce a slightly wavy path between two points
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const nx = -dy / dist, ny = dx / dist;
    // random offset at midpoint (seeded)
    const s = Math.sin(seed * 9.1) * 0.5 + 0.5;
    const amp = Math.min(12, dist * 0.06) * (s - 0.3);
    const mx = x1 + dx * 0.5 + nx * amp;
    const my = y1 + dy * 0.5 + ny * amp;
    // slight 2nd control
    const s2 = Math.cos(seed * 5.3) * 0.5 + 0.5;
    const amp2 = Math.min(6, dist * 0.03) * (s2 - 0.5);
    const c1x = x1 + dx * 0.25 + nx * amp2;
    const c1y = y1 + dy * 0.25 + ny * amp2;
    const c2x = x1 + dx * 0.75 + nx * amp2;
    const c2y = y1 + dy * 0.75 + ny * amp2;
    return `M${x1},${y1} C${c1x},${c1y} ${mx},${my} ${c2x},${c2y} S${x2},${y2} ${x2},${y2}`;
  }

  function nodeShapePath(n) {
    const r = nodeRadius(n);
    // jittered circle/square/diamond with slight imperfection
    const seed = n.idx + 1;
    if (n.type === "topic") {
      // rounded square, slight rotation baked via coords
      const s = r * 1.7;
      const h = s / 2;
      const jit = (k) => (Math.sin(seed * (k + 1) * 3.7) * 2);
      const pts = [
        [-h + jit(1), -h + jit(2)],
        [ h + jit(3), -h + jit(4)],
        [ h + jit(5),  h + jit(6)],
        [-h + jit(7),  h + jit(8)]
      ];
      return `M${pts[0][0]},${pts[0][1]} Q${pts[1][0]},${pts[0][1]-2} ${pts[1][0]},${pts[1][1]} Q${pts[1][0]+2},${pts[2][1]} ${pts[2][0]},${pts[2][1]} Q${pts[3][0]-2},${pts[2][1]} ${pts[3][0]},${pts[3][1]} Q${pts[0][0]-2},${pts[0][1]} ${pts[0][0]},${pts[0][1]} Z`;
    }
    if (n.type === "source") {
      // diamond
      const jit = (k) => Math.sin(seed * (k + 1) * 2.9) * 1.5;
      return `M0,${-r + jit(1)} L${r + jit(2)},${jit(3)} L${jit(4)},${r + jit(5)} L${-r + jit(6)},${jit(7)} Z`;
    }
    // entity: wavy circle
    const pts = [];
    const steps = 18;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const rr = r + Math.sin(seed * (i + 1) * 1.7) * 1.2;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    let p = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i <= steps; i++) {
      const cur = pts[i % steps];
      const prev = pts[(i - 1) % steps];
      const mx = (prev[0] + cur[0]) / 2;
      const my = (prev[1] + cur[1]) / 2;
      p += ` Q${prev[0]},${prev[1]} ${mx},${my}`;
    }
    p += " Z";
    return p;
  }

  function nodeHaloPath(n) {
    const r = nodeRadius(n) + 6;
    // wavy halo
    const steps = 20;
    const seed = n.idx + 3;
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const rr = r + Math.sin(seed * (i + 1) * 2.1) * 1.6;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    let p = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i <= steps; i++) {
      const cur = pts[i % steps];
      const prev = pts[(i - 1) % steps];
      const mx = (prev[0] + cur[0]) / 2;
      const my = (prev[1] + cur[1]) / 2;
      p += ` Q${prev[0]},${prev[1]} ${mx},${my}`;
    }
    p += " Z";
    return p;
  }

  // ---------- D3 force simulation ----------
  let simulation, zoomBehavior;
  const rootG = svg.append("g").attr("class", "root");
  const blobLayer = rootG.append("g").attr("class", "blob-layer");
  const edgeLayer = rootG.append("g").attr("class", "edge-group");
  const nodeLayer = rootG.append("g").attr("class", "node-layer");
  const commLabelLayer = rootG.append("g").attr("class", "comm-label-layer");

  function initSim() {
    const w = svgNode.clientWidth || 1000;
    const h = svgNode.clientHeight || 600;

    // seed initial positions in a circle so simulation doesn't pile up at origin
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) * 0.3;
    state.nodes.forEach((n, i) => {
      const a = (i / state.nodes.length) * Math.PI * 2;
      n.x = cx + Math.cos(a) * R;
      n.y = cy + Math.sin(a) * R;
    });

    simulation = d3.forceSimulation(state.nodes)
      .force("link", d3.forceLink(state.links).id(d => d.id)
        .distance(l => {
          const sameComm = state.byId[l.source.id || l.source]?.community
                        === state.byId[l.target.id || l.target]?.community;
          const base = state.tweaks.nodeStyle === "card" ? 150 : 110;
          return sameComm ? base : base + 90;
        })
        .strength(0.5))
      .force("charge", d3.forceManyBody().strength(state.tweaks.nodeStyle === "card" ? -720 : -520).distanceMax(800))
      .force("x", d3.forceX(cx).strength(0.06))
      .force("y", d3.forceY(cy).strength(0.06))
      .force("collide", d3.forceCollide().radius(d => {
        if (state.tweaks.nodeStyle === "card") {
          const dim = cardDims(d);
          return Math.max(dim.w, dim.h) * 0.6 + 14;
        }
        return nodeRadius(d) + 18;
      }).strength(0.95))
      .force("comm", communityForce(0.05))
      .alphaDecay(0.025)
      .velocityDecay(0.5);

    simulation.on("tick", tick);
    // pre-warm ticks so first paint shows stable-ish layout
    for (let i = 0; i < 80; i++) simulation.tick();
    tick(); // force one DOM paint
    let fitted = false;
    simulation.on("tick.fit", () => {
      if (!fitted && simulation.alpha() < 0.5) {
        fitted = true;
        document.getElementById("loading").setAttribute("data-hide", "1");
        setTimeout(() => {
          fitToView();
          document.getElementById("loading").style.display = "none";
        }, 150);
      }
    });
    simulation.on("end", () => {
      document.getElementById("loading").setAttribute("data-hide", "1");
      document.getElementById("loading").style.display = "none";
      if (!fitted) { fitted = true; fitToView(); }
    });
    // safety: force hide after 3s
    setTimeout(() => {
      if (!fitted) {
        fitted = true;
        document.getElementById("loading").setAttribute("data-hide", "1");
        document.getElementById("loading").style.display = "none";
        fitToView();
      }
    }, 3000);
  }

  function communityForce(strength) {
    // gentle pull to community centroid
    let nodes = [];
    function force(alpha) {
      // compute centroids
      const cent = {};
      nodes.forEach(n => {
        const c = n.community == null ? "_none" : String(n.community);
        if (!cent[c]) cent[c] = { x: 0, y: 0, n: 0 };
        cent[c].x += n.x; cent[c].y += n.y; cent[c].n++;
      });
      Object.keys(cent).forEach(k => {
        cent[k].x /= cent[k].n; cent[k].y /= cent[k].n;
      });
      nodes.forEach(n => {
        const c = n.community == null ? "_none" : String(n.community);
        const t = cent[c];
        n.vx += (t.x - n.x) * strength * alpha * 4;
        n.vy += (t.y - n.y) * strength * alpha * 4;
      });
    }
    force.initialize = (n) => { nodes = n; };
    return force;
  }

  // ---------- Tick: redraw ----------
  function visibleLinks() {
    return state.visible.ready
      ? state.visible.links
      : filterLinksByTypes(state.links, state.filters);
  }

  function renderEdges() {
    const vis = visibleLinks()
      .slice()
      .sort((left, right) => clampWeight(right.weight) - clampWeight(left.weight));
    vis.forEach((edge, index) => { edge._blurRank = index; });
    const groups = edgeLayer.selectAll("g.edge-wrap")
      .data(vis, d => d.id);
    groups.exit().remove();

    const enter = groups.enter().append("g").attr("class", "edge-wrap");
    enter.append("path").attr("class", "edge-halo");
    enter.append("path")
      .attr("class", "edge")
      .attr("data-type", d => d.type || "EXTRACTED");

    const merged = enter.merge(groups);
    merged.select(".edge")
      .attr("data-type", d => d.type || "EXTRACTED")
      .style("stroke-width", d => edgeStrokeWidth(d))
      .style("opacity", d => edgeOpacity(d));

    merged.select(".edge-halo")
      .attr("data-type", d => d.type || "EXTRACTED")
      .style("stroke", d => edgeBaseColor(d))
      .style("stroke-width", d => edgeStrokeWidth(d) + 3.2)
      .style("opacity", d => shouldShowBlur(d) ? edgeHaloOpacity(d) : 0)
      .style("filter", d => shouldShowBlur(d) ? "blur(3px)" : "none");
  }

  function renderNodes() {
    const g = nodeLayer.selectAll("g.node-group")
      .data(state.nodes, d => d.id);
    g.exit().remove();

    const enter = g.enter().append("g")
      .attr("class", d => `node-group node-group--${d.type}`)
      .attr("data-id", d => d.id)
      .on("mouseenter", (ev, d) => { state.hover = d.id; applyHighlight(); })
      .on("mouseleave", () => { state.hover = null; applyHighlight(); })
      .on("click", (ev, d) => { ev.stopPropagation(); selectNode(d.id, true); })
      .call(d3.drag()
        .on("start", (ev, d) => { if (!ev.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag",  (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end",   (ev, d) => { if (!ev.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
      );

    // Card-style: halo + card bg + tab + label inside + corner glyph
    // Organic-style: halo + shape + external label + optional glyph
    enter.each(function (d) {
      const gg = d3.select(this);
      const style = state.tweaks.nodeStyle;
      if (style === "card") {
        gg.append("path").attr("class", "node-halo");
        gg.append("path").attr("class", "node-shape node-card")
          .style("stroke", d => nodeStrokeColor(d));
        gg.append("path").attr("class", "node-tab")
          .style("fill", nodeStrokeColor(d))
          .style("stroke", nodeStrokeColor(d));
        // label inside card
        const label = d.label || d.id;
        const { text: displayLabel, truncated } = truncateLabel(label, 180);
        gg.append("text").attr("class", "node-label node-label--in")
          .attr("text-anchor", "middle")
          .attr("dy", "0.35em")
          .text(displayLabel);
        if (truncated) {
          gg.append("title").text(label);
        }
        // small type glyph top-right
        gg.append("text").attr("class", "node-glyph")
          .attr("text-anchor", "end")
          .text(d.type === "topic" ? "✦" : d.type === "source" ? "§" : "◇")
          .style("fill", nodeStrokeColor(d));
      } else {
        gg.append("path").attr("class", "node-halo");
        gg.append("path").attr("class", "node-shape")
          .style("stroke", d => nodeStrokeColor(d));
        gg.append("text").attr("class", "node-label")
          .attr("text-anchor", "middle")
          .attr("dy", nodeRadius(d) + 14)
          .text(d.label || d.id);
        if (d.type === "topic") {
          gg.append("text").attr("class", "node-icon")
            .attr("text-anchor", "middle").attr("dy", "5")
            .style("font-family", "var(--font-hand)")
            .style("font-size", "13px")
            .style("font-weight", "700")
            .text("✦");
        } else if (d.type === "source") {
          gg.append("text").attr("class", "node-icon")
            .attr("text-anchor", "middle").attr("dy", "5")
            .style("font-family", "var(--font-hand)")
            .style("font-size", "12px")
            .text("§");
        }
      }
    });

    // update stroke colors on all (enter + update)
    g.merge(enter).selectAll(".node-shape")
      .style("stroke", d => nodeStrokeColor(d));
    g.merge(enter).selectAll(".node-tab")
      .style("fill", d => nodeStrokeColor(d))
      .style("stroke", d => nodeStrokeColor(d));
    g.merge(enter).selectAll(".node-glyph")
      .style("fill", d => nodeStrokeColor(d));
  }

  function edgeBaseColor(edge) {
    if ((edge.type || "EXTRACTED") === "INFERRED") return state.variantTokens.edgeInferred;
    if ((edge.type || "EXTRACTED") === "AMBIGUOUS") return state.variantTokens.edgeAmbiguous;
    return state.variantTokens.edgeExtracted;
  }

  function nodeStrokeColor(n) {
    if (state.tweaks.sizeMode === "type" || state.tweaks.bubbleMode === "color") {
      return n.commColor;
    }
    if (n.type === "topic") return state.variantTokens.topic;
    if (n.type === "source") return state.variantTokens.source;
    return n.commColor;
  }

  function tick() {
    edgeLayer.selectAll("g.edge-wrap")
      .each(function (d) {
        const s = d.source;
        const t = d.target;
        if (s.x == null || t.x == null) return;

        const wrap = d3.select(this);
        const path = roughEdgePath(s.x, s.y, t.x, t.y, (d.id ? d.id.charCodeAt(d.id.length - 1) : 0) + edgeRoughness(d));
        wrap.select(".edge").attr("d", path);
        wrap.select(".edge-halo").attr("d", path);
      });

    nodeLayer.selectAll("g.node-group")
      .attr("transform", d => `translate(${d.x},${d.y})`)
      .each(function (d) {
        const g = d3.select(this);
        if (!g.attr("data-shaped")) {
          if (state.tweaks.nodeStyle === "card") {
            const dim = cardDims(d);
            const seed = d.idx + 1;
            g.select(".node-shape").attr("d", cardPath(dim.w, dim.h, 5, seed));
            // tab offset: slight variation
            const tabOff = Math.sin(seed * 1.3) * (dim.w * 0.25);
            g.select(".node-tab").attr("d", tabPath(dim.w, seed + 11, tabOff).replace(/,0 Z/g, ',' + (-dim.h/2) + ' Z'))
              .attr("transform", `translate(0,${-dim.h/2})`);
            // re-build tab with proper baseline
            const tw = 18, th = 8;
            const x0 = tabOff - tw/2, x1 = tabOff + tw/2;
            const y0 = -dim.h/2;
            const jit = (k) => Math.sin((seed + 11) * (k+1) * 2.7) * 0.6;
            const tabD = `M${x0 + jit(1)},${y0} L${x0 + 2 + jit(2)},${y0 - th + jit(3)} L${x1 - 2 + jit(4)},${y0 - th + jit(5)} L${x1 + jit(6)},${y0} Z`;
            g.select(".node-tab").attr("d", tabD).attr("transform", null);
            // glyph in top-right corner
            g.select(".node-glyph")
              .attr("x", dim.w/2 - 6)
              .attr("y", -dim.h/2 + 13);
          } else {
            g.select(".node-shape").attr("d", nodeShapePath(d));
            g.select(".node-halo").attr("d", nodeHaloPath(d));
          }
          g.attr("data-shaped", "1");
        }
      });

    if (simulation.alpha() < 0.15) renderBlobs();
    renderMinimap();
  }

  // ---------- Community blobs ----------
  function renderBlobs() {
    blobLayer.selectAll("*").remove();
    commLabelLayer.selectAll("*").remove();
    const mode = state.tweaks.bubbleMode;
    if (mode === "off" || mode === "color") return;

    Object.values(state.communities).forEach(c => {
      if (c.id === "_none" || c.nodes.length < 2) return;

      // collect padded points around each node
      function hullPoints(padding) {
        const pts = c.nodes.filter(n => n.x != null).map(n => {
          const dim = state.tweaks.nodeStyle === "card" ? cardDims(n) : null;
          const r = (state.tweaks.nodeStyle === "card"
            ? Math.max(dim.w, dim.h) * 0.6
            : nodeRadius(n)) + padding;
          const out = [];
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            out.push([n.x + Math.cos(a) * r, n.y + Math.sin(a) * r]);
          }
          return out;
        }).flat();
        if (pts.length < 3) return null;
        return d3.polygonHull(pts);
      }

      const color = c.color;

      if (mode === "wash") {
        // Multiple soft layers: outer (lightest), mid, inner. Each slightly jittered.
        const layers = [
          { pad: 46, alpha: 0.12, alphaJit: 0.04, blur: 8,  jitter: 6 },
          { pad: 30, alpha: 0.10, alphaJit: 0.03, blur: 4,  jitter: 4 },
          { pad: 18, alpha: 0.14, alphaJit: 0.02, blur: 2,  jitter: 2 }
        ];
        const line = d3.line().curve(d3.curveCatmullRomClosed.alpha(1.0));
        const seed = hashStr(c.id);
        layers.forEach((L, li) => {
          const hull = hullPoints(L.pad);
          if (!hull) return;
          // jitter each point to give watery edge
          const jittered = hull.map((p, i) => {
            const a = (seed * (i + 1) * (li + 1) * 0.37) % 6.283;
            return [p[0] + Math.cos(a) * L.jitter, p[1] + Math.sin(a) * L.jitter];
          });
          blobLayer.append("path")
            .attr("class", "community-wash")
            .attr("d", line(jittered))
            .style("fill", hexToRgba(color, L.alpha))
            .style("stroke", "none")
            .style("filter", `blur(${L.blur}px)`);
        });
        // tiny ink-edge hint (very subtle)
        const hullEdge = hullPoints(26);
        if (hullEdge) {
          blobLayer.append("path")
            .attr("class", "community-wash-edge")
            .attr("d", line(hullEdge))
            .style("fill", "none")
            .style("stroke", hexToRgba(color, 0.22))
            .style("stroke-width", 0.8)
            .style("stroke-dasharray", "2 6")
            .style("filter", "blur(0.4px)");
        }

        // label (muted, hand-written)
        const hullL = hullPoints(26);
        if (hullL) {
          const centroid = d3.polygonCentroid(hullL);
          const topMost = hullL.reduce((a, b) => a[1] < b[1] ? a : b);
          commLabelLayer.append("text")
            .attr("class", "community-label community-label--wash")
            .attr("x", centroid[0])
            .attr("y", topMost[1] - 10)
            .attr("text-anchor", "middle")
            .style("fill", hexToRgba(color, 0.75))
            .text(communityLabel(c.id));
        }
        return;
      }

      // classic "hull" mode
      const hull = hullPoints(18);
      if (!hull) return;
      const line = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.9));
      const pathD = line(hull);

      blobLayer.append("path")
        .attr("class", "community-blob")
        .attr("d", pathD)
        .style("--blob-fill", hexToRgba(color, 0.08))
        .style("--blob-stroke", hexToRgba(color, 0.4));

      const centroid = d3.polygonCentroid(hull);
      const topMost = hull.reduce((a, b) => a[1] < b[1] ? a : b);
      commLabelLayer.append("text")
        .attr("class", "community-label")
        .attr("x", centroid[0])
        .attr("y", topMost[1] - 8)
        .attr("text-anchor", "middle")
        .style("fill", hexToRgba(color, 0.8))
        .text(communityLabel(c.id));
    });
  }

  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function communityLabel(id) {
    // pretty labels
    const n = state.communities[id].nodes[0];
    const topic = state.nodes.find(x => x.type === "topic" && String(x.community) === id);
    if (topic) return "— " + topic.label + " —";
    return "— " + id + " —";
  }

  function hexToRgba(hex, a) {
    const h = hex.replace("#","");
    const r = parseInt(h.substring(0,2),16);
    const g = parseInt(h.substring(2,4),16);
    const b = parseInt(h.substring(4,6),16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // ---------- Minimap ----------
  function renderMinimap() {
    if (!minimapEl || !state.nodes.length || minimapEl.getAttribute("data-collapsed") === "1") return;
    const w = 180, h = 130;
    // bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.nodes.forEach(n => {
      if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y;
    });
    const pad = 30;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const sx = w / (maxX - minX);
    const sy = h / (maxY - minY);
    const s = Math.min(sx, sy);
    const ox = (w - (maxX - minX) * s) / 2;
    const oy = (h - (maxY - minY) * s) / 2;
    mmSvg.attr("viewBox", `0 0 ${w} ${h}`);

    let mmNodes = mmSvg.selectAll("circle.mm-node").data(state.nodes, d => d.id);
    mmNodes.exit().remove();
    mmNodes = mmNodes.enter().append("circle").attr("class", "mm-node").merge(mmNodes);
    const hasSubgraph = state.visible.nodeIds.size > 0 && state.visible.nodeIds.size < state.nodes.length;
    mmNodes
      .attr("cx", d => (d.x - minX) * s + ox)
      .attr("cy", d => (d.y - minY) * s + oy)
      .attr("r", 1.8)
      .attr("fill", d => d.commColor)
      .attr("opacity", d => hasSubgraph && !state.visible.nodeIds.has(d.id) ? 0.15 : 0.7);

    // viewport rect
    const viewBox = svgNode.getBoundingClientRect();
    const t = d3.zoomTransform(svgNode);
    const vx1 = (-t.x) / t.k;
    const vy1 = (-t.y) / t.k;
    const vx2 = vx1 + viewBox.width / t.k;
    const vy2 = vy1 + viewBox.height / t.k;

    let rect = mmSvg.selectAll("rect.minimap__viewport").data([0]);
    rect = rect.enter().append("rect").attr("class", "minimap__viewport").merge(rect);
    rect
      .attr("x", (vx1 - minX) * s + ox)
      .attr("y", (vy1 - minY) * s + oy)
      .attr("width", Math.max(0, (vx2 - vx1) * s))
      .attr("height", Math.max(0, (vy2 - vy1) * s));
  }

  // ---------- Zoom / pan ----------
  function setupZoom() {
    zoomBehavior = d3.zoom()
      .scaleExtent([0.25, 3])
      .on("zoom", (ev) => {
        rootG.attr("transform", ev.transform);
        renderMinimap();
      });
    svg.call(zoomBehavior);
  }

  function fitToView() {
    if (!state.nodes.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.nodes.forEach(n => {
      const r = nodeRadius(n) + 30; // padding for labels
      if (n.x - r < minX) minX = n.x - r;
      if (n.y - r < minY) minY = n.y - r;
      if (n.x + r > maxX) maxX = n.x + r;
      if (n.y + r > maxY) maxY = n.y + r;
    });
    const pad = 60;
    const bw = maxX - minX + pad * 2;
    const bh = maxY - minY + pad * 2;
    const rect = svgNode.getBoundingClientRect();
    const k = Math.min(rect.width / bw, rect.height / bh, 1.3);
    const tx = rect.width / 2 - ((minX + maxX) / 2) * k;
    const ty = rect.height / 2 - ((minY + maxY) / 2) * k;
    svg.transition().duration(600).call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(tx, ty).scale(k)
    );
  }

  // ---------- Highlight on hover/select ----------
  function applyHighlight() {
    const focus = state.selected || state.hover;
    const cls = "graph-dim";
    if (!focus) {
      rootG.classed(cls, false);
      nodeLayer.selectAll("g.node-group").classed("focus", false).classed("neighbor", false);
      edgeLayer.selectAll("path.edge").classed("edge--hi", false);
      return;
    }
    const neighbors = new Set([focus]);
    state.links.forEach(l => {
      const s = l.source.id || l.source;
      const t = l.target.id || l.target;
      if (s === focus) neighbors.add(t);
      if (t === focus) neighbors.add(s);
    });

    rootG.classed(cls, true);
    nodeLayer.selectAll("g.node-group")
      .classed("focus", d => d.id === focus)
      .classed("neighbor", d => neighbors.has(d.id) && d.id !== focus);
    edgeLayer.selectAll("path.edge")
      .classed("edge--hi", d => {
        const s = d.source.id || d.source;
        const t = d.target.id || d.target;
        return s === focus || t === focus;
      })
      .classed("hi-path", d => {
        const s = d.source.id || d.source;
        const t = d.target.id || d.target;
        return s === focus || t === focus;
      });

    nodeLayer.selectAll("g.node-group")
      .attr("data-selected", d => d.id === state.selected ? "1" : "0")
      .attr("data-hover", d => d.id === state.hover ? "1" : "0");
  }

  // ---------- Selection + drawer ----------
  function selectNode(id, openDrawer) {
    state.selected = id;
    const node = state.byId[id];
    if (state.learning.activeMode !== "global" && node && node.community != null) {
      const nodeCommunityId = String(node.community);
      if (state.ui.topCommunityIds.indexOf(nodeCommunityId) !== -1) {
        state.learning.activeCommunityId = nodeCommunityId;
      }
    }
    if (state.learning.focusMode === "one_hop") {
      updateVisibleSnapshot();
      renderEdges();
      applySubgraph();
      updateFooter();
      renderMinimap();
    }
    applyHighlight();
    pulseNode(id);
    renderNavPanel();
    if (openDrawer) openDetailDrawer(id);
  }

  function pulseNode(id) {
    const g = nodeLayer.select(`g.node-group[data-id="${cssEscape(id)}"]`);
    g.classed("pulse", false);
    // trigger reflow
    void g.node()?.getBBox();
    g.classed("pulse", true);
    setTimeout(() => g.classed("pulse", false), 1300);
  }

  function cssEscape(s) { return String(s).replace(/"/g, '\\"'); }

  function updateQueueUI() {
    persistQueueState();
    renderNavPanel();
  }

  function handleFavoriteToggle(node) {
    if (!node) return;
    state.queue = toggleQueueFavorite(state.queue, node.id);
    const active = isFavoriteNode(node.id);
    toast(active ? "已加入收藏" : "已取消收藏");
    updateQueueUI();
    if (state.selected === node.id) openDetailDrawer(node.id);
  }

  function handleAddNote(node) {
    if (!node) return;
    const body = document.getElementById("dr-body");
    const selection = typeof window.getSelection === "function" ? window.getSelection() : null;
    const selectedText = selection ? String(selection).trim() : "";
    const scopedSelectedText = body && selection && selection.rangeCount && body.contains(selection.anchorNode)
      ? selectedText
      : "";
    const note = createQueueNote(node, scopedSelectedText);
    state.queue = appendQueueNote(state.queue, note, QUEUE_NOTE_LIMIT);
    toast(scopedSelectedText ? "已收进学习笔记" : "已记下当前节点");
    updateQueueUI();
    if (state.selected === node.id) openDetailDrawer(node.id);
  }

  function openDetailDrawer(id) {
    const n = state.byId[id];
    if (!n) return;
    document.getElementById("app").classList.add("drawer-open");
    document.getElementById("drawer").setAttribute("aria-hidden", "false");

    document.getElementById("dr-kicker").textContent = ({
      entity: "Entity · 实体",
      topic: "Topic · 主题",
      source: "Source · 来源"
    })[n.type] || n.type;

    document.getElementById("dr-title").textContent = n.label || n.id;

    const commEl = document.getElementById("dr-community");
    if (n.community != null) {
      commEl.textContent = "社区 · " + n.community;
      commEl.hidden = false;
    } else {
      commEl.hidden = true;
    }
    document.getElementById("dr-degree").textContent = `${n.degree} 条关联`;

    const favoriteButton = document.getElementById("dr-favorite");
    if (favoriteButton) {
      const favorited = isFavoriteNode(n.id);
      favoriteButton.setAttribute("data-on", favorited ? "1" : "0");
      favoriteButton.textContent = favorited ? "★ 已收藏" : "☆ 收藏";
      favoriteButton.onclick = () => handleFavoriteToggle(n);
    }
    const noteButton = document.getElementById("dr-note");
    if (noteButton) {
      noteButton.setAttribute("data-on", "0");
      noteButton.onclick = () => handleAddNote(n);
    }

    // body
    const body = document.getElementById("dr-body");
    const raw = (n.content || "").replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
      const parts = inner.split("|");
      const target = parts[0].trim();
      const label = (parts[1] || parts[0]).trim();
      const exists = state.nodes.some(x => x.id === target || x.label === target);
      const cls = exists ? "wikilink" : "wikilink wikilink--dead";
      return `<a class="${cls}" data-target="${escapeHtml(target)}">${escapeHtml(label)}</a>`;
    });
    const html = marked.parse(raw, { breaks: false, gfm: true });
    const safe = typeof DOMPurify === "undefined"
      ? html
      : DOMPurify.sanitize(html, { ADD_ATTR: ["target", "data-target", "tabindex"] });
    body.innerHTML = safe;
    body.scrollTop = 0;

    // wikilink clicks
    body.querySelectorAll("a.wikilink").forEach(a => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        if (a.classList.contains("wikilink--dead")) return;
        const t = a.getAttribute("data-target");
        const hit = state.nodes.find(x => x.id === t || x.label === t);
        if (hit) {
          selectNode(hit.id, true);
          svg.transition().duration(450).call(
            zoomBehavior.translateTo, hit.x, hit.y
          );
        }
      });
    });

    // neighbors
    const neighbors = [];
    state.links.forEach(l => {
      const s = l.source.id || l.source;
      const t = l.target.id || l.target;
      if (s === id) neighbors.push({ other: state.byId[t], direction: "→", type: l.type, weight: l.weight });
      else if (t === id) neighbors.push({ other: state.byId[s], direction: "←", type: l.type, weight: l.weight });
    });
    const nb = document.getElementById("nb-list");
    nb.innerHTML = "";
    if (!neighbors.length) {
      nb.innerHTML = `<div style="color:var(--paper-ink-faint); font-family: var(--font-hand); padding: 10px;">（孤立节点）</div>`;
    }
    neighbors.forEach(o => {
      if (!o.other) return;
      const weight = clampWeight(o.weight);
      const el = document.createElement("div");
      el.className = "nb-item";
      el.innerHTML = `
        <span class="nb-item__arrow">${o.direction}</span>
        <span class="nb-item__type" style="background:${o.other.commColor || '#999'}"></span>
        <span class="nb-item__name">${escapeHtml(o.other.label || o.other.id)}</span>
        <span class="nb-item__strength" style="width:${edgeStrengthSize(o)}px;height:${edgeStrengthSize(o)}px;background:${edgeBaseColor(o)}"></span>
        <span class="nb-item__rel" data-rel="${o.type || 'EXTRACTED'}">${weight.toFixed(2)}</span>
      `;
      el.addEventListener("click", () => {
        selectNode(o.other.id, true);
        svg.transition().duration(450).call(zoomBehavior.translateTo, o.other.x, o.other.y);
      });
      nb.appendChild(el);
    });

  }

  function closeDrawer() {
    document.getElementById("app").classList.remove("drawer-open");
    document.getElementById("drawer").setAttribute("aria-hidden", "true");
    state.selected = null;
    applyHighlight();
    renderNavPanel();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.setAttribute("data-show", "1");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.setAttribute("data-show", "0"), 1800);
  }

  function focusNode(nodeId, openDrawer) {
    const hit = state.byId[nodeId];
    if (!hit) return;
    selectNode(hit.id, openDrawer !== false);
    svg.transition().duration(450).call(zoomBehavior.translateTo, hit.x, hit.y);
  }

  function getSortedCommunities() {
    return (state.learning.data.communities || []).slice().sort((a, b) => {
      if (!!b.is_primary !== !!a.is_primary) return b.is_primary ? 1 : -1;
      if ((b.node_count || 0) !== (a.node_count || 0)) return (b.node_count || 0) - (a.node_count || 0);
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  }

  function getPrimaryCommunity() {
    return getSortedCommunities().find((community) => community.is_primary) || getSortedCommunities()[0] || null;
  }

  function getActiveCommunity() {
    const communities = state.learning.data.communities || [];
    return communities.find((community) => community.id === state.learning.activeCommunityId) || getPrimaryCommunity();
  }

  function getRecommendedStartNodeId(community) {
    if (community && community.recommended_start_node_id) return community.recommended_start_node_id;
    return state.learning.data.entry && state.learning.data.entry.recommended_start_node_id;
  }

  function getContextRecommendedStartNodeId(community) {
    if (state.learning.activeMode === "global") {
      return state.learning.data.entry && state.learning.data.entry.recommended_start_node_id;
    }
    return getRecommendedStartNodeId(community);
  }

  function getPathNodeIdsForCommunity(community) {
    if (!community) return [];
    const startNodeId = getRecommendedStartNodeId(community);
    if (!startNodeId) return [];

    const communityNodeIds = new Set(getCommunityNodeIds(state.nodes, community.id));
    if (!communityNodeIds.size) return [];

    const nodeIds = [startNodeId];
    state.links.forEach((link) => {
      const sourceId = link.source && link.source.id ? link.source.id : link.source;
      const targetId = link.target && link.target.id ? link.target.id : link.target;
      if (sourceId === startNodeId && communityNodeIds.has(targetId)) nodeIds.push(targetId);
      if (targetId === startNodeId && communityNodeIds.has(sourceId)) nodeIds.push(sourceId);
    });

    return [...new Set(nodeIds)].filter((id) => communityNodeIds.has(id));
  }

  function isLearningModeEnabled(mode) {
    if (mode === "global") return true;
    if (state.learning.data.views[mode] && state.learning.data.views[mode].enabled) return true;

    const activeCommunity = getActiveCommunity();
    if (!activeCommunity) return false;
    if (mode === "community") return getCommunityNodeIds(state.nodes, activeCommunity.id).length > 0;
    if (mode === "path") return getPathNodeIdsForCommunity(activeCommunity).length > 0;
    return false;
  }

  function updateInsightsTitle() {
    const panelTitle = document.getElementById("panel-title");
    if (!panelTitle) return;
    panelTitle.textContent = state.learning.activeMode === "global" ? "Insights" : "洞察";
  }

  function setNavOpen(open) {
    state.ui.navOpen = open;
    const app = document.getElementById("app");
    if (app) app.classList.toggle("nav-open", !!open);
    if (navToggle) navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function setNavCollapsed(collapsed) {
    state.ui.navCollapsed = collapsed;
    const app = document.getElementById("app");
    if (app) app.classList.toggle("nav-collapsed", !!collapsed && window.innerWidth >= NAV_BREAKPOINT);
    if (navClose) navClose.setAttribute("aria-label", collapsed ? "展开学习导航" : "收起学习导航");
  }

  function setSecondaryOpen(open) {
    state.ui.secondaryOpen = open;
    if (secondaryPanel) secondaryPanel.hidden = !open;
    if (secondaryToggle) secondaryToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function renderCommunityButton(community, activeCommunity, selectedCommunityId) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-community";
    button.style.borderLeftColor = state.communities[String(community.id)] ? state.communities[String(community.id)].color : "var(--paper-rule)";
    const isActive = state.learning.activeMode !== "global" && activeCommunity && community.id === activeCommunity.id;
    button.setAttribute("data-on", isActive ? "1" : "0");
    button.innerHTML = `
      <span class="nav-community__row">
        <span class="nav-community__title">${escapeHtml(community.label || community.id)}</span>
        ${community.is_primary ? '<span class="nav-community__badge">TOP</span>' : ""}
        ${selectedCommunityId === String(community.id) && !isActive ? '<span class="nav-community__badge">当前</span>' : ""}
      </span>
      <span class="nav-community__meta">${community.node_count || 0} 个节点 · ${community.source_count || 0} 个来源</span>
    `;
    button.addEventListener("click", () => {
      setActiveCommunity(community.id);
      if (window.innerWidth < NAV_BREAKPOINT) setNavOpen(false);
    });
    return button;
  }

  function renderFocusOptions(activeCommunity) {
    if (!navFocus) return;
    navFocus.innerHTML = "";

    const options = [
      { id: "all", title: "显示当前全部", meta: activeCommunity ? `完整显示「${activeCommunity.label || activeCommunity.id}」当前范围` : "完整显示当前全局范围" },
      { id: "core", title: "只看核心节点", meta: activeCommunity ? `围绕「${activeCommunity.label || activeCommunity.id}」保留关键节点` : "在全局里优先保留连接最强的节点" },
      { id: "one_hop", title: "只看一级关联", meta: state.selected ? "围绕当前选中节点显示一跳邻居" : "围绕推荐起点显示一跳邻居" },
      { id: "high_confidence", title: "只看高置信度", meta: "仅保留高权重连接及相关节点" }
    ];

    options.forEach((option) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "nav-panel__secondary";
      item.setAttribute("data-on", state.learning.focusMode === option.id ? "1" : "0");
      item.innerHTML = `
        <span class="nav-panel__secondary-row">
          <span class="nav-panel__secondary-title">${option.title}</span>
          <span class="nav-panel__secondary-badge">${state.learning.focusMode === option.id ? "当前" : "聚焦"}</span>
        </span>
        <span class="nav-panel__secondary-meta">${option.meta}</span>
      `;
      item.addEventListener("click", () => {
        state.learning.focusMode = option.id;
        updateVisibleSnapshot();
        renderEdges();
        applySubgraph();
        syncDrawerWithVisibleSnapshot();
        updateFooter();
        renderNavPanel();
        renderMinimap();
        simulation.alpha(0.2).restart();
      });
      navFocus.appendChild(item);
    });
  }

  function renderQueueSummary() {
    if (!navQueue) return;
    navQueue.innerHTML = "";

    const summary = summarizeQueue(state.queue, state.byId, 4);
    const card = document.createElement("div");
    card.className = "nav-panel__queue-card";
    card.innerHTML = `
      <span class="nav-panel__queue-title">先把学过的东西收进去</span>
      <span class="nav-panel__queue-meta">收藏留住重点节点，学习笔记收最近摘录。</span>
      <div class="nav-panel__queue-grid">
        <div class="nav-panel__queue-metric">
          <span class="nav-panel__queue-label">收藏</span>
          <span class="nav-panel__queue-value">${summary.favorite_count}</span>
        </div>
        <div class="nav-panel__queue-metric">
          <span class="nav-panel__queue-label">笔记</span>
          <span class="nav-panel__queue-value">${summary.note_count}</span>
        </div>
      </div>
      <div class="nav-panel__queue-list"></div>
    `;
    const list = card.querySelector(".nav-panel__queue-list");
    if (summary.recent_items.length) {
      summary.recent_items.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "nav-panel__queue-pill";
        button.textContent = item.kind === "note" ? `笔记 · ${item.label}` : `收藏 · ${item.label}`;
        button.title = item.text || item.label;
        button.addEventListener("click", () => {
          focusNode(item.node_id);
          if (window.innerWidth < NAV_BREAKPOINT) setNavOpen(false);
        });
        list.appendChild(button);
      });
    } else {
      const empty = document.createElement("span");
      empty.className = "nav-panel__queue-pill";
      empty.textContent = "最近条目会显示在这里";
      list.appendChild(empty);
    }
    navQueue.appendChild(card);
  }

  function renderSearchScope(activeCommunity) {
    if (!navSearchHint) return;
    const modeLabel = ({ path: "路径视图", community: "社区视图", global: "全局视图" })[state.learning.activeMode] || "全局视图";
    const communityLabel = activeCommunity && state.learning.activeMode !== "global" ? ` · ${activeCommunity.label || activeCommunity.id}` : "";
    const focusLabel = ({ all: "完整范围", core: "核心节点", one_hop: "一级关联", high_confidence: "高置信度" })[state.learning.focusMode] || "完整范围";
    navSearchHint.textContent = `当前搜索范围：${modeLabel}${communityLabel} · ${focusLabel}`;
    if (navSearchEmpty) navSearchEmpty.hidden = !!state.learning.searchQuery;
  }

  function renderSecondaryEntry() {
    if (!navSecondaryEntry) return;
    navSecondaryEntry.innerHTML = "";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-panel__secondary";
    button.setAttribute("data-on", state.ui.secondaryOpen ? "1" : "0");
    button.innerHTML = `
      <span class="nav-panel__secondary-row">
        <span class="nav-panel__secondary-title">洞察 / 图例 / 小地图</span>
        <span class="nav-panel__secondary-badge">二级入口</span>
      </span>
      <span class="nav-panel__secondary-meta">统一收在一个面板里，默认不再常驻抢屏。</span>
    `;
    button.addEventListener("click", () => setSecondaryOpen(!state.ui.secondaryOpen));
    navSecondaryEntry.appendChild(button);
  }

  function renderNavPanel() {
    if (!navCommunities || !navStart) return;

    const sortedCommunities = getSortedCommunities();
    const visibleCommunities = sortedCommunities.slice(0, 3);
    const restCommunities = sortedCommunities.slice(3);
    const activeCommunity = getActiveCommunity();
    const selectedNode = state.selected ? state.byId[state.selected] : null;
    const selectedCommunityId = selectedNode && selectedNode.community != null ? String(selectedNode.community) : null;
    const topCommunityIds = visibleCommunities.map((community) => String(community.id));
    state.ui.topCommunityIds = topCommunityIds;

    navCommunities.innerHTML = "";
    if (navAllCommunities) navAllCommunities.innerHTML = "";
    navStart.innerHTML = "";

    if (navInlineHint) {
      if (selectedCommunityId && topCommunityIds.indexOf(selectedCommunityId) === -1) {
        navInlineHint.hidden = false;
        navInlineHint.textContent = "当前节点属于未展示社区，左侧仍保持当前社区上下文。";
      } else {
        navInlineHint.hidden = true;
        navInlineHint.textContent = "";
      }
    }

    if (navAllCommunitiesToggle) {
      const hasRest = restCommunities.length > 0;
      navAllCommunitiesToggle.hidden = !hasRest;
      navAllCommunitiesToggle.setAttribute("aria-expanded", state.ui.allCommunitiesExpanded ? "true" : "false");
      navAllCommunitiesToggle.textContent = state.ui.allCommunitiesExpanded ? "⌃" : "⌄";
    }
    if (navAllCommunities) navAllCommunities.hidden = !state.ui.allCommunitiesExpanded;

    if (!visibleCommunities.length) {
      const empty = document.createElement("div");
      empty.className = "nav-panel__empty";
      empty.textContent = "暂无社区信息。";
      navCommunities.appendChild(empty);
    }

    visibleCommunities.forEach((community) => {
      navCommunities.appendChild(renderCommunityButton(community, activeCommunity, selectedCommunityId));
    });

    if (navAllCommunities && state.ui.allCommunitiesExpanded) {
      restCommunities.forEach((community) => {
        navAllCommunities.appendChild(renderCommunityButton(community, activeCommunity, selectedCommunityId));
      });
    }

    renderFocusOptions(activeCommunity);
    renderQueueSummary();
    renderSearchScope(activeCommunity);
    renderSecondaryEntry();

    if (!activeCommunity) {
      const empty = document.createElement("div");
      empty.className = "nav-panel__empty";
      empty.textContent = "暂无推荐起点。";
      navStart.appendChild(empty);
      return;
    }

    const startNodeId = getContextRecommendedStartNodeId(activeCommunity);
    const startNode = startNodeId ? state.byId[startNodeId] : null;
    if (!startNode) {
      const empty = document.createElement("div");
      empty.className = "nav-panel__empty";
      empty.textContent = "当前社区暂无推荐起点。";
      navStart.appendChild(empty);
      return;
    }

    const reasonLabel = state.learning.activeMode === "global"
      ? "全局辅助起点"
      : `${activeCommunity.label || activeCommunity.id} · 辅助起点`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-start-item";
    button.setAttribute("data-on", state.selected === startNode.id ? "1" : "0");
    button.innerHTML = `
      <span class="nav-start-item__eyebrow">从这里开始</span>
      <span class="nav-start-item__title">${escapeHtml(startNode.label || startNode.id)}</span>
      <span class="nav-start-item__meta">${escapeHtml(reasonLabel)}</span>
    `;
    button.addEventListener("click", () => {
      if (state.learning.activeMode === "global") {
        focusNode(startNode.id);
      } else {
        if (state.learning.activeCommunityId !== activeCommunity.id) state.learning.activeCommunityId = activeCommunity.id;
        setLearningMode("path");
        focusNode(startNode.id);
      }
      if (window.innerWidth < NAV_BREAKPOINT) setNavOpen(false);
    });
    navStart.appendChild(button);
  }

  // ---------- Learning mode ----------
  function updateVisibleSnapshot() {
    const mode = state.learning.activeMode;
    const activeCommunity = getActiveCommunity();
    let baseNodeIds = [];

    if (mode === "community") {
      baseNodeIds = activeCommunity ? getCommunityNodeIds(state.nodes, activeCommunity.id) : [];
    } else if (mode === "path") {
      baseNodeIds = activeCommunity ? getPathNodeIdsForCommunity(activeCommunity) : getVisibleNodeIds(state.learning.data, mode);
    } else {
      baseNodeIds = getVisibleNodeIds(state.learning.data, mode);
    }

    if (!baseNodeIds.length) {
      baseNodeIds = state.nodes.map((node) => node.id);
    }

    const focusAnchorNodeId = state.selected
      || (activeCommunity && getRecommendedStartNodeId(activeCommunity))
      || state.learning.recommendedStartNodeId
      || null;
    const snapshot = resolveVisibleSnapshot({
      nodes: state.nodes,
      links: state.links,
      baseNodeIds,
      filters: state.filters,
      focusMode: state.learning.focusMode,
      searchQuery: state.learning.searchQuery,
      anchorNodeId: focusAnchorNodeId,
      highConfidenceThreshold: 0.8
    });

    state.visible.ready = true;
    state.visible.nodeIds = new Set(snapshot.node_ids);
    state.visible.nodes = snapshot.nodes;
    state.visible.links = snapshot.links;
    state.visible.searchIndex = snapshot.searchIndex;
  }

  function applySubgraph() {
    const idSet = state.visible.nodeIds;
    if (!state.visible.ready) {
      nodeLayer.selectAll("g.node-group").style("display", null);
      edgeLayer.selectAll("g.edge-wrap").style("display", null);
      return;
    }
    if (!idSet.size) {
      nodeLayer.selectAll("g.node-group").style("display", "none");
      edgeLayer.selectAll("g.edge-wrap").style("display", "none");
      return;
    }
    if (idSet.size === state.nodes.length) {
      nodeLayer.selectAll("g.node-group").style("display", null);
      edgeLayer.selectAll("g.edge-wrap").style("display", null);
      return;
    }
    nodeLayer.selectAll("g.node-group").each(function (d) {
      d3.select(this).style("display", idSet.has(d.id) ? null : "none");
    });
    edgeLayer.selectAll("g.edge-wrap").each(function (d) {
      const s = d.source.id || d.source;
      const t = d.target.id || d.target;
      d3.select(this).style("display", (idSet.has(s) && idSet.has(t)) ? null : "none");
    });
  }

  function syncDrawerWithVisibleSnapshot() {
    if (!state.selected || !state.visible.ready) return;
    if (!state.visible.nodeIds.has(state.selected)) {
      closeDrawer();
    }
  }

  function setLearningMode(mode) {
    if (!isLearningModeEnabled(mode)) return;
    state.learning.activeMode = mode;
    if (!state.learning.activeCommunityId) {
      const primary = getPrimaryCommunity();
      state.learning.activeCommunityId = primary ? primary.id : null;
    }

    updateVisibleSnapshot();
    renderEdges();
    applySubgraph();
    syncDrawerWithVisibleSnapshot();

    document.querySelectorAll("#mode-switch .mode-btn").forEach(btn => {
      btn.setAttribute("data-on", btn.dataset.mode === mode ? "1" : "0");
    });

    updateInsightsTitle();
    renderNavPanel();
    fitVisibleToView();
  }

  function setActiveCommunity(communityId) {
    if (!communityId) return;
    const drawerEl = document.getElementById("drawer");
    const shouldKeepDrawerOpen = drawerEl && drawerEl.getAttribute("aria-hidden") === "false";

    state.learning.activeCommunityId = communityId;
    setLearningMode("community");

    const activeCommunity = getActiveCommunity();
    const startNodeId = getRecommendedStartNodeId(activeCommunity);
    if (startNodeId && state.byId[startNodeId]) {
      focusNode(startNodeId, shouldKeepDrawerOpen);
    }
  }

  function fitVisibleToView() {
    const visibleNodes = state.visible.ready
      ? state.nodes.filter(n => state.visible.nodeIds.has(n.id))
      : state.nodes;
    if (!visibleNodes.length) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    visibleNodes.forEach(n => {
      const r = nodeRadius(n) + 30;
      if (n.x - r < minX) minX = n.x - r;
      if (n.y - r < minY) minY = n.y - r;
      if (n.x + r > maxX) maxX = n.x + r;
      if (n.y + r > maxY) maxY = n.y + r;
    });
    const pad = 60;
    const bw = maxX - minX + pad * 2;
    const bh = maxY - minY + pad * 2;
    const rect = svgNode.getBoundingClientRect();
    const k = Math.min(rect.width / bw, rect.height / bh, 1.3);
    const tx = rect.width / 2 - ((minX + maxX) / 2) * k;
    const ty = rect.height / 2 - ((minY + maxY) / 2) * k;
    svg.transition().duration(600).call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(tx, ty).scale(k)
    );
  }

  function bootstrapLearningEntry() {
    if (state.ui.bootstrappedEntry) return;
    state.ui.bootstrappedEntry = true;

    const data = state.learning.data;
    const primaryCommunity = getPrimaryCommunity();
    const mode = resolveInitialMode(data);
    state.learning.activeMode = mode;
    state.learning.activeCommunityId = primaryCommunity ? primaryCommunity.id : null;
    state.learning.recommendedStartNodeId = data.entry.recommended_start_node_id;
    state.learning.pathDegraded = data.views.path.degraded;
    state.learning.communityDegraded = data.views.community.degraded;
    state.learning.focusMode = "all";
    state.learning.searchQuery = "";
    const searchEl = document.getElementById("search");
    if (searchEl) searchEl.value = "";

    updateVisibleSnapshot();

    document.querySelectorAll("#mode-switch .mode-btn").forEach(btn => {
      btn.setAttribute("data-on", btn.dataset.mode === mode ? "1" : "0");
    });

    applySubgraph();
    updateInsightsTitle();
    renderNavPanel();

    const startId = data.entry.recommended_start_node_id;
    if (startId && state.byId[startId] && mode !== "global") {
      selectNode(startId, shouldAutoOpenDrawer(mode));
      setTimeout(() => fitVisibleToView(), 200);
    }

    if (mode !== "global" && state.visible.nodeIds.size < state.nodes.length) {
      setTimeout(() => fitVisibleToView(), 100);
    }
  }

  function roundNumber(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "0";
    return Math.round(numeric * 1000) / 1000;
  }

  function renderInsights() {
    if (!insightsBody || !insightsMeta) return;

    const sections = [
      {
        title: "惊人连接",
        items: state.insights.surprising_connections,
        render(item) {
          return {
            title: `${item.from} ↔ ${item.to}`,
            meta: `跨社区强边 · 权重 ${clampWeight(item.weight).toFixed(2)}`,
            onClick() { focusNode(item.from); }
          };
        }
      },
      {
        title: "知识缺口",
        items: state.insights.isolated_nodes,
        render(item) {
          return {
            title: item.label || item.id,
            meta: `孤立节点 · 度数 ${item.degree}`,
            onClick() { focusNode(item.id); }
          };
        }
      },
      {
        title: "桥节点",
        items: state.insights.bridge_nodes,
        render(item) {
          return {
            title: item.label || item.id,
            meta: `连接 ${item.community_count} 个社区`,
            onClick() { focusNode(item.id); }
          };
        }
      },
      {
        title: "稀疏社区",
        items: state.insights.sparse_communities,
        render(item) {
          return {
            title: item.label || item.id,
            meta: `密度 ${Number(item.density || 0).toFixed(2)} · ${item.node_count} 个节点`,
            onClick() { focusNode(item.id); }
          };
        }
      }
    ];

    const totalItems = sections.reduce((sum, section) => sum + section.items.length, 0);
    const degraded = state.insights.meta && state.insights.meta.degraded === true;
    insightsMeta.textContent = degraded ? `${totalItems} 项 · 已降级` : `${totalItems} 项`;
    insightsBody.innerHTML = "";

    sections.forEach(section => {
      const wrap = document.createElement("section");
      wrap.className = "insights-panel__section";
      wrap.innerHTML = `<div class="insights-panel__section-title">${escapeHtml(section.title)}</div>`;

      if (!section.items.length) {
        const empty = document.createElement("div");
        empty.className = "insights-panel__empty";
        empty.textContent = "暂无。";
        wrap.appendChild(empty);
        insightsBody.appendChild(wrap);
        return;
      }

      section.items.forEach(item => {
        const view = section.render(item);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "insight-item";
        button.innerHTML = `
          <span class="insight-item__title">${escapeHtml(view.title)}</span>
          <span class="insight-item__meta">${escapeHtml(view.meta)}</span>
        `;
        button.addEventListener("click", view.onClick);
        wrap.appendChild(button);
      });

      insightsBody.appendChild(wrap);
    });
  }

  // ---------- Search ----------
  function setupSearch() {
    const input = document.getElementById("search");
    const dd = document.getElementById("search-dropdown");
    let activeIdx = -1;
    let results = [];

    function render() {
      if (!results.length) {
        dd.innerHTML = `<div style="padding:10px; color: var(--paper-ink-faint); font-family: var(--font-hand);">无匹配</div>`;
        dd.setAttribute("data-open", state.learning.searchQuery ? "1" : "0");
        return;
      }
      dd.innerHTML = "";
      results.slice(0, 10).forEach((n, i) => {
        const el = document.createElement("div");
        el.className = "search__item";
        if (i === activeIdx) el.setAttribute("data-active", "1");
        el.innerHTML = `
          <span class="type-dot" style="background:${nodeStrokeColor(n)}"></span>
          <span class="name">${escapeHtml(n.label || n.id)}</span>
          <span class="meta">${n.type} · ${n.degree}</span>
        `;
        el.addEventListener("click", () => {
          input.value = n.label || n.id;
          dd.setAttribute("data-open", "0");
          if (navSearchEmpty) navSearchEmpty.hidden = true;
          selectNode(n.id, true);
          svg.transition().duration(450).call(zoomBehavior.translateTo, n.x, n.y);
        });
        dd.appendChild(el);
      });
      dd.setAttribute("data-open", "1");
    }

    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      state.learning.searchQuery = q;
      updateVisibleSnapshot();
      renderEdges();
      applySubgraph();
      syncDrawerWithVisibleSnapshot();
      updateFooter();
      renderNavPanel();
      renderMinimap();
      simulation.alpha(0.18).restart();

      const idx = state.visible.searchIndex.length ? state.visible.searchIndex : state.searchIndex;
      results = q
        ? idx.filter(entry => entry.haystack.includes(q)).map(entry => entry.node)
        : [];
      activeIdx = results.length ? 0 : -1;
      if (!q) {
        dd.setAttribute("data-open", "0");
        return;
      }
      render();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(results.length - 1, activeIdx + 1); render(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(0, activeIdx - 1); render(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        if (results[activeIdx]) {
          const n = results[activeIdx];
          input.value = n.label || n.id;
          dd.setAttribute("data-open", "0");
          selectNode(n.id, true);
          svg.transition().duration(450).call(zoomBehavior.translateTo, n.x, n.y);
        }
      } else if (e.key === "Escape") {
        input.value = "";
        state.learning.searchQuery = "";
        updateVisibleSnapshot();
        renderEdges();
        applySubgraph();
        syncDrawerWithVisibleSnapshot();
        updateFooter();
        renderNavPanel();
        renderMinimap();
        dd.setAttribute("data-open", "0");
      }
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search")) dd.setAttribute("data-open", "0");
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== input) {
        const tag = document.activeElement.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          input.focus();
          input.select();
        }
      } else if (e.key === "Escape") {
        if (document.getElementById("app").classList.contains("drawer-open")) closeDrawer();
      }
    });
  }

  // ---------- Filters ----------
  function setupFilters() {
    document.querySelectorAll("#filters .chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const t = chip.dataset.type;
        const on = chip.getAttribute("data-on") !== "1";
        chip.setAttribute("data-on", on ? "1" : "0");
        state.filters[t] = on;
        updateVisibleSnapshot();
        renderEdges();
        applySubgraph();
        syncDrawerWithVisibleSnapshot();
        renderNavPanel();
        simulation.alpha(0.2).restart();
        updateFooter();
        renderMinimap();
      });
    });
  }

  // ---------- Canvas click (close drawer) ----------
  svg.on("click", () => {
    if (state.selected) closeDrawer();
  });

  // ---------- Zoom buttons ----------
  document.getElementById("zoom-in").addEventListener("click", () => {
    svg.transition().duration(200).call(zoomBehavior.scaleBy, 1.3);
  });
  document.getElementById("zoom-out").addEventListener("click", () => {
    svg.transition().duration(200).call(zoomBehavior.scaleBy, 1/1.3);
  });
  document.getElementById("btn-fit").addEventListener("click", fitToView);
  document.getElementById("btn-refit").addEventListener("click", () => {
    simulation.alpha(0.9).restart();
    toast("重新布置中...");
  });

  document.getElementById("dr-close").addEventListener("click", closeDrawer);

  function applyMinimapCollapsed(collapsed) {
    if (!minimapEl || !minimapToggle) return;
    minimapEl.setAttribute("data-collapsed", collapsed ? "1" : "0");
    minimapToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    minimapToggle.setAttribute("aria-label", collapsed ? "展开小地图" : "折叠小地图");
  }

  function applyNeighborsCollapsed(collapsed) {
    if (!drawerNeighbors || !drawerNeighborsHeading) return;
    drawerNeighbors.setAttribute("data-collapsed", collapsed ? "1" : "0");
    drawerNeighborsHeading.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  applyMinimapCollapsed(safeLocalStorage.get(queueStorageKey("minimap-collapsed")) === "1");
  applyNeighborsCollapsed(safeLocalStorage.get(queueStorageKey("neighbors-collapsed")) === "1");

  if (minimapEl && minimapToggle) {
    minimapToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = minimapEl.getAttribute("data-collapsed") !== "1";
      applyMinimapCollapsed(next);
      safeLocalStorage.set(queueStorageKey("minimap-collapsed"), next ? "1" : "0");
      if (!next) renderMinimap();
    });
  }

  function toggleNeighbors() {
    if (!drawerNeighbors) return;
    const next = drawerNeighbors.getAttribute("data-collapsed") !== "1";
    applyNeighborsCollapsed(next);
    safeLocalStorage.set(queueStorageKey("neighbors-collapsed"), next ? "1" : "0");
  }

  if (drawerNeighborsHeading) {
    drawerNeighborsHeading.addEventListener("click", toggleNeighbors);
    drawerNeighborsHeading.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleNeighbors();
      }
    });
  }

  // ---------- Minimap navigation ----------
  mmSvg.on("click", function (ev) {
    // re-use bounds logic (quick version)
    if (!state.nodes.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.nodes.forEach(n => {
      if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y;
    });
    const pad = 30;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const w = 180, h = 130;
    const s = Math.min(w / (maxX - minX), h / (maxY - minY));
    const ox = (w - (maxX - minX) * s) / 2;
    const oy = (h - (maxY - minY) * s) / 2;

    const pt = d3.pointer(ev);
    const tx = minX + (pt[0] - ox) / s;
    const ty = minY + (pt[1] - oy) / s;
    svg.transition().duration(320).call(zoomBehavior.translateTo, tx, ty);
  });

  if (navToggle) {
    navToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      setNavOpen(!state.ui.navOpen);
    });
  }
  if (navClose) {
    navClose.addEventListener("click", (e) => {
      e.stopPropagation();
      if (window.innerWidth < NAV_BREAKPOINT) {
        setNavOpen(false);
      } else {
        setNavCollapsed(!state.ui.navCollapsed);
      }
    });
  }
  if (navAllCommunitiesToggle) {
    navAllCommunitiesToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      state.ui.allCommunitiesExpanded = !state.ui.allCommunitiesExpanded;
      renderNavPanel();
    });
  }
  if (secondaryToggle) {
    secondaryToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      setSecondaryOpen(!state.ui.secondaryOpen);
      renderNavPanel();
    });
  }
  if (secondaryClose) {
    secondaryClose.addEventListener("click", (e) => {
      e.stopPropagation();
      setSecondaryOpen(false);
      renderNavPanel();
    });
  }

  // ---------- Footer ----------
  function updateFooter() {
    document.getElementById("n-nodes").textContent = state.nodes.length;
    document.getElementById("n-edges").textContent = state.links.length;
    document.getElementById("n-date").textContent = DATA.meta.build_date;
    const shown = state.visible.ready ? state.visible.nodeIds.size : state.nodes.length;
    document.getElementById("foot-shown").textContent = shown;
    document.getElementById("foot-total").textContent = state.nodes.length;
    const comms = Object.keys(state.communities).filter(k => k !== "_none").length;
    document.getElementById("foot-communities").textContent = comms;
    const on = Object.keys(state.filters).filter(k => state.filters[k]);
    document.getElementById("foot-filter").textContent = on.join("+") || "none";
  }

  // ---------- Tweaks panel ----------
  function setupTweaks() {
    const btn = document.getElementById("btn-tweaks");
    const panel = document.getElementById("tweaks");
    btn.addEventListener("click", () => {
      const open = panel.getAttribute("data-open") === "1";
      panel.setAttribute("data-open", open ? "0" : "1");
      btn.setAttribute("data-on", open ? "0" : "1");
    });

    function hookSeg(id, key, onChange) {
      const el = document.getElementById(id);
      // initialize
      el.querySelectorAll("button").forEach(b => {
        b.setAttribute("data-on", b.dataset.val === state.tweaks[key] ? "1" : "0");
        b.addEventListener("click", () => {
          el.querySelectorAll("button").forEach(x => x.setAttribute("data-on", "0"));
          b.setAttribute("data-on", "1");
          state.tweaks[key] = b.dataset.val;
          persistTweaks();
          onChange(b.dataset.val);
        });
      });
    }

    hookSeg("seg-variant", "variant", (v) => {
      applyVariant(v);
      // update node colors
      prepareCommunityColors();
      nodeLayer.selectAll(".node-shape").style("stroke", d => nodeStrokeColor(d));
      renderBlobs();
    });
    hookSeg("seg-size", "sizeMode", () => {
      // reset rendered flag so shapes re-generate
      nodeLayer.selectAll("g.node-group").attr("data-shaped", null);
      if (state.tweaks.nodeStyle === "organic") {
        nodeLayer.selectAll("g.node-group").each(function(d) {
          const g = d3.select(this);
          g.select(".node-shape").attr("d", nodeShapePath(d));
          g.select(".node-halo").attr("d", nodeHaloPath(d));
          g.select(".node-label").attr("dy", nodeRadius(d) + 14);
        });
      }
      simulation.force("collide", d3.forceCollide().radius(d => {
        if (state.tweaks.nodeStyle === "card") {
          const dim = cardDims(d);
          return Math.max(dim.w, dim.h) * 0.6 + 14;
        }
        return nodeRadius(d) + 18;
      }).strength(0.9));
      simulation.alpha(0.5).restart();
    });
    hookSeg("seg-bubble", "bubbleMode", () => {
      nodeLayer.selectAll(".node-shape").style("stroke", d => nodeStrokeColor(d));
      renderBlobs();
    });
    hookSeg("seg-nodestyle", "nodeStyle", () => {
      // structural change — rebuild all node groups
      nodeLayer.selectAll("g.node-group").remove();
      renderNodes();
      // re-run collide with new radius
      simulation.force("collide", d3.forceCollide().radius(d => {
        if (state.tweaks.nodeStyle === "card") {
          const dim = cardDims(d);
          return Math.max(dim.w, dim.h) * 0.6 + 14;
        }
        return nodeRadius(d) + 18;
      }).strength(0.95));
      simulation.alpha(0.5).restart();
    });
  }

  function prepareCommunityColors() {
    const palette = state.variantTokens.commPalette;
    const keys = Object.keys(state.communities).filter(k => k !== "_none");
    keys.forEach((k, i) => { state.communities[k].color = palette[i % palette.length]; });
    state.nodes.forEach(n => {
      const c = n.community == null ? "_none" : String(n.community);
      n.commColor = state.communities[c].color;
    });
  }

  function persistTweaks() {
    try {
      window.parent.postMessage({
        type: "__edit_mode_set_keys",
        edits: state.tweaks
      }, "*");
    } catch (e) {}
  }

  // ---------- Edit-mode protocol ----------
  function setupEditMode() {
    window.addEventListener("message", (e) => {
      if (!e.data || !e.data.type) return;
      if (e.data.type === "__activate_edit_mode") {
        document.getElementById("tweaks").setAttribute("data-open", "1");
        document.getElementById("btn-tweaks").setAttribute("data-on", "1");
        // re-fit after panel opens
        setTimeout(() => { try { fitToView(); } catch(_){} }, 100);
      } else if (e.data.type === "__deactivate_edit_mode") {
        document.getElementById("tweaks").setAttribute("data-open", "0");
        document.getElementById("btn-tweaks").setAttribute("data-on", "0");
      }
    });
    try {
      window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    } catch (e) {}
  }

  function syncResponsiveUI() {
    if (window.innerWidth < NAV_BREAKPOINT) {
      const app = document.getElementById("app");
      if (app) app.classList.remove("nav-collapsed");
    } else {
      setNavOpen(false);
      setNavCollapsed(state.ui.navCollapsed);
    }
    if (window.innerWidth < NAV_BREAKPOINT) {
      setSecondaryOpen(false);
    }
  }

  // ---------- Resize ----------
  window.addEventListener("resize", () => {
    syncResponsiveUI();
    if (simulation) {
      simulation.force("center", d3.forceCenter(svgNode.clientWidth / 2, svgNode.clientHeight / 2).strength(0.05));
      simulation.alpha(0.2).restart();
    }
    renderMinimap();
  });

  // ---------- Boot ----------
  applyVariant(state.tweaks.variant);
  prepareData();
  syncResponsiveUI();
  document.getElementById("wiki-title").textContent = DATA.meta.wiki_title;
  setupZoom();
  renderEdges();
  renderNodes();
  initSim();
  setupFilters();
  setupSearch();
  setupTweaks();
  setupEditMode();
  renderInsights();
  setSecondaryOpen(false);
  updateFooter();

  // Mode switch buttons
  document.querySelectorAll("#mode-switch .mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      setLearningMode(btn.dataset.mode);
    });
  });

  // Bootstrap learning entry after simulation stabilizes
  setTimeout(() => { bootstrapLearningEntry(); }, 600);
})();
