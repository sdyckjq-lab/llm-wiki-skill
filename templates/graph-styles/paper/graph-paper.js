/* ============================================================
   Knowledge Graph — Hand-drawn paper aesthetic
   ============================================================ */
(function () {
  "use strict";

  const dataEl = document.getElementById("graph-data");
  const DATA = dataEl ? JSON.parse(dataEl.textContent) : window.SAMPLE_GRAPH;
  const svg = d3.select("#canvas");
  const svgNode = svg.node();
  const mmSvg = d3.select("#minimap-svg");

  // ---------- state ----------
  const state = {
    filters: { EXTRACTED: true, INFERRED: true, AMBIGUOUS: false },
    selected: null,
    hover: null,
    nodes: [],
    links: [],
    visibleLinks: [],
    communities: {},
    tweaks: Object.assign(
      { variant: "paper", sizeMode: "degree", bubbleMode: "hull" },
      window.__TWEAKS || {}
    )
  };

  // ---------- tokens (variants) ----------
  const VARIANTS = {
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
    state.variantTokens = v;
  }

  // ---------- Prepare data ----------
  function prepareData() {
    state.nodes = DATA.nodes.map((n, i) => Object.assign({}, n, {
      idx: i,
      degree: 0
    }));
    state.links = DATA.edges.map(e => Object.assign({}, e, {
      source: e.from, target: e.to
    }));
    // compute degree
    const byId = {};
    state.nodes.forEach(n => { byId[n.id] = n; });
    state.links.forEach(l => {
      if (byId[l.source]) byId[l.source].degree++;
      if (byId[l.target]) byId[l.target].degree++;
    });
    // communities
    const commMap = {};
    state.nodes.forEach(n => {
      const c = n.community == null ? "_none" : String(n.community);
      if (!commMap[c]) commMap[c] = { id: c, nodes: [] };
      commMap[c].nodes.push(n);
    });
    state.communities = commMap;
    state.byId = byId;

    // community colors
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
  }

  // ---------- Node geometry ----------
  function nodeRadius(n) {
    const mode = state.tweaks.sizeMode;
    if (mode === "uniform") return 18;
    if (mode === "type") {
      if (n.type === "topic") return 24;
      if (n.type === "source") return 14;
      return 18;
    }
    // degree
    return 12 + Math.sqrt(n.degree) * 4;
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
          return sameComm ? 110 : 200;
        })
        .strength(0.5))
      .force("charge", d3.forceManyBody().strength(-520).distanceMax(600))
      .force("x", d3.forceX(cx).strength(0.06))
      .force("y", d3.forceY(cy).strength(0.06))
      .force("collide", d3.forceCollide().radius(d => nodeRadius(d) + 18).strength(0.95))
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
    return state.links.filter(l => state.filters[l.type || "EXTRACTED"]);
  }

  function renderEdges() {
    const vis = visibleLinks();
    state.visibleLinks = vis;
    const sel = edgeLayer.selectAll("path.edge")
      .data(vis, d => d.id);
    sel.exit().remove();
    sel.enter().append("path")
      .attr("class", "edge")
      .attr("data-type", d => d.type || "EXTRACTED")
      .merge(sel);
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

    enter.append("path").attr("class", "node-halo");
    enter.append("path").attr("class", "node-shape")
      .style("stroke", d => nodeStrokeColor(d));
    enter.append("text").attr("class", "node-label")
      .attr("text-anchor", "middle")
      .attr("dy", d => nodeRadius(d) + 14)
      .text(d => d.label || d.id);

    // type icon (small glyph inside the node)
    enter.each(function (d) {
      const g = d3.select(this);
      if (d.type === "topic") {
        g.append("text").attr("class", "node-icon")
          .attr("text-anchor", "middle").attr("dy", "5")
          .style("font-family", "var(--font-hand)")
          .style("font-size", "13px")
          .style("font-weight", "700")
          .text("✦");
      } else if (d.type === "source") {
        g.append("text").attr("class", "node-icon")
          .attr("text-anchor", "middle").attr("dy", "5")
          .style("font-family", "var(--font-hand)")
          .style("font-size", "12px")
          .text("§");
      }
    });

    // update existing
    g.merge(enter).select(".node-shape")
      .style("stroke", d => nodeStrokeColor(d));
  }

  function nodeStrokeColor(n) {
    if (state.tweaks.sizeMode === "type" || state.tweaks.bubbleMode === "color") {
      // prefer community color when bubble off
      return n.commColor;
    }
    // type-based color by default
    if (n.type === "topic") return state.variantTokens.topic;
    if (n.type === "source") return state.variantTokens.source;
    return n.commColor;
  }

  function tick() {
    // update edges (reuse existing elements)
    edgeLayer.selectAll("path.edge")
      .attr("d", d => {
        const s = d.source, t = d.target;
        if (s.x == null || t.x == null) return "";
        return roughEdgePath(s.x, s.y, t.x, t.y, d.id ? d.id.charCodeAt(d.id.length - 1) : 0);
      });

    nodeLayer.selectAll("g.node-group")
      .attr("transform", d => `translate(${d.x},${d.y})`)
      .each(function (d) {
        const g = d3.select(this);
        if (!g.attr("data-shaped")) {
          g.select(".node-shape").attr("d", nodeShapePath(d));
          g.select(".node-halo").attr("d", nodeHaloPath(d));
          g.attr("data-shaped", "1");
        }
      });

    renderBlobs();
    renderMinimap();
  }

  // ---------- Community blobs (convex hull with padding) ----------
  function renderBlobs() {
    blobLayer.selectAll("*").remove();
    commLabelLayer.selectAll("*").remove();
    if (state.tweaks.bubbleMode === "off" || state.tweaks.bubbleMode === "color") return;

    Object.values(state.communities).forEach(c => {
      if (c.id === "_none" || c.nodes.length < 2) return;
      const points = c.nodes.filter(n => n.x != null).map(n => {
        const r = nodeRadius(n) + 18;
        // add 8 sampled points around each node so the hull pads around them
        const pts = [];
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          pts.push([n.x + Math.cos(a) * r, n.y + Math.sin(a) * r]);
        }
        return pts;
      }).flat();
      if (points.length < 3) return;
      const hull = d3.polygonHull(points);
      if (!hull) return;

      // smooth the hull with a closed catmull-rom spline
      const line = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.9));
      const pathD = line(hull);

      const color = c.color;
      blobLayer.append("path")
        .attr("class", "community-blob")
        .attr("d", pathD)
        .style("--blob-fill", hexToRgba(color, 0.08))
        .style("--blob-stroke", hexToRgba(color, 0.4));

      // label
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
    if (!state.nodes.length) return;
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
    mmNodes
      .attr("cx", d => (d.x - minX) * s + ox)
      .attr("cy", d => (d.y - minY) * s + oy)
      .attr("r", 1.8)
      .attr("fill", d => d.commColor)
      .attr("opacity", 0.7);

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
    applyHighlight();
    pulseNode(id);
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
      if (s === id) neighbors.push({ other: state.byId[t], direction: "→", type: l.type });
      else if (t === id) neighbors.push({ other: state.byId[s], direction: "←", type: l.type });
    });
    const nb = document.getElementById("nb-list");
    nb.innerHTML = "";
    if (!neighbors.length) {
      nb.innerHTML = `<div style="color:var(--paper-ink-faint); font-family: var(--font-hand); padding: 10px;">（孤立节点）</div>`;
    }
    neighbors.forEach(o => {
      if (!o.other) return;
      const el = document.createElement("div");
      el.className = "nb-item";
      el.innerHTML = `
        <span class="nb-item__arrow">${o.direction}</span>
        <span class="nb-item__type" style="background:${o.other.commColor || '#999'}"></span>
        <span class="nb-item__name">${escapeHtml(o.other.label || o.other.id)}</span>
        <span class="nb-item__rel" data-rel="${o.type || 'EXTRACTED'}">${o.type || 'EXTRACTED'}</span>
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

  // ---------- Search ----------
  function setupSearch() {
    const input = document.getElementById("search");
    const dd = document.getElementById("search-dropdown");
    let activeIdx = -1;
    let results = [];

    function render() {
      if (!results.length) {
        dd.innerHTML = `<div style="padding:10px; color: var(--paper-ink-faint); font-family: var(--font-hand);">无匹配</div>`;
        dd.setAttribute("data-open", "1");
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
          selectNode(n.id, true);
          svg.transition().duration(450).call(zoomBehavior.translateTo, n.x, n.y);
        });
        dd.appendChild(el);
      });
      dd.setAttribute("data-open", "1");
    }

    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { dd.setAttribute("data-open", "0"); return; }
      results = state.nodes.filter(n =>
        (n.label || n.id).toLowerCase().includes(q) ||
        (n.content || "").toLowerCase().includes(q)
      );
      activeIdx = 0;
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
        renderEdges();
        // re-run sim briefly for layout freshness
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

  // ---------- Footer ----------
  function updateFooter() {
    document.getElementById("n-nodes").textContent = state.nodes.length;
    document.getElementById("n-edges").textContent = state.links.length;
    document.getElementById("n-date").textContent = DATA.meta.build_date;
    document.getElementById("foot-shown").textContent = state.nodes.length;
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
      nodeLayer.selectAll("g.node-group").attr("data-rendered", null);
      nodeLayer.selectAll("g.node-group").each(function(d) {
        const g = d3.select(this);
        g.select(".node-shape").attr("d", nodeShapePath(d));
        g.select(".node-halo").attr("d", nodeHaloPath(d));
        g.select(".node-label").attr("dy", nodeRadius(d) + 14);
      });
      simulation.force("collide", d3.forceCollide().radius(d => nodeRadius(d) + 12).strength(0.9));
      simulation.alpha(0.5).restart();
    });
    hookSeg("seg-bubble", "bubbleMode", () => {
      nodeLayer.selectAll(".node-shape").style("stroke", d => nodeStrokeColor(d));
      renderBlobs();
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

  // ---------- Resize ----------
  window.addEventListener("resize", () => {
    if (simulation) {
      simulation.force("center", d3.forceCenter(svgNode.clientWidth / 2, svgNode.clientHeight / 2).strength(0.05));
      simulation.alpha(0.2).restart();
    }
    renderMinimap();
  });

  // ---------- Boot ----------
  applyVariant(state.tweaks.variant);
  prepareData();
  document.getElementById("wiki-title").textContent = DATA.meta.wiki_title;
  setupZoom();
  renderEdges();
  renderNodes();
  initSim();
  setupFilters();
  setupSearch();
  setupTweaks();
  setupEditMode();
  updateFooter();

  // Auto-select a node after stabilization for visual polish (comment out if not wanted)
  // setTimeout(() => selectNode("Transformer", false), 1500);
})();
