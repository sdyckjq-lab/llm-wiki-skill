import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const html = process.env.GRAPH_NODE_SLIM_HTML || "";
assert.notEqual(html, "", "GRAPH_NODE_SLIM_HTML must point at generated HTML");

const browser = await chromium.launch({
  // This regression targets the DOM/SVG small-graph fallback. The default offline
  // global route uses Sigma when WebGL is available, which has a different DOM.
  args: ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"]
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(pathToFileURL(html).href);
  await page.waitForSelector("[data-llm-wiki-graph-root='true']");

  const node = page.locator(".node[data-id='A']");
  await node.waitFor();
  await assertNodeDetailDisplay(node, "none", "none", "default card node should hide type and weight details");
  assert.equal(await node.locator(".node-name").innerText(), "节点A", "default card node should keep the title visible");

  await node.hover();
  await assertNodeDetailDisplay(node, "block", "flex", "hovered card node should expose type and weight details");
  await page.waitForSelector(".graph-hover-preview[data-state='open']");
  const preview = page.locator(".graph-hover-preview");
  await preview.locator(".graph-hover-preview-title", { hasText: /^节点A$/ }).waitFor();
  await preview.getByText("实体").waitFor();
  await preview.getByText("这是节点A的内容。").waitFor();
  assert.equal(await preview.locator(".graph-hover-preview-summary").count(), 1, "content nodes should show a preview summary");

  await page.mouse.move(20, 20);
  await waitForPreviewState(page, "closed");
  await assertNodeDetailDisplay(node, "none", "none", "card node details should hide again after hover leaves");

  await node.click();
  await page.waitForSelector(".graph-reader[data-state='open']");
  await assertNodeDetailDisplay(node, "block", "flex", "selected card node should expose type and weight details");

  const emptyNode = page.locator(".node[data-id='empty-preview']");
  if (await emptyNode.count()) {
    await emptyNode.hover();
    await page.waitForSelector(".graph-hover-preview[data-state='open']");
    await preview.locator(".graph-hover-preview-title", { hasText: /^空内容节点$/ }).waitFor();
    await preview.getByText("主题").waitFor();
    assert.equal(await preview.locator(".graph-hover-preview-summary").count(), 0, "empty content nodes should omit summary text");
  }
} finally {
  await browser.close();
}

async function waitForPreviewState(page, state) {
  await page.waitForFunction((state) => {
    return document.querySelector(".graph-hover-preview")?.dataset.state === state;
  }, state);
}

async function assertNodeDetailDisplay(node, expectedKind, expectedMeta, message) {
  const actual = await node.evaluate((element) => {
    const kind = element.querySelector(".node-kind");
    const meta = element.querySelector(".node-meta");
    const styles = element.ownerDocument.defaultView;
    return {
      kind: kind && styles ? styles.getComputedStyle(kind).display : "",
      meta: meta && styles ? styles.getComputedStyle(meta).display : "",
      metaText: meta?.textContent?.trim() || ""
    };
  });
  assert.equal(actual.kind, expectedKind, `${message}: node kind display`);
  assert.equal(actual.meta, expectedMeta, `${message}: node meta display`);
  assert.match(actual.metaText, /\d+|来源暂不可用/, `${message}: node meta text should remain available`);
}
