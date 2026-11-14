const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const background = fs.readFileSync(path.join(root, "js/background.js"), "utf8");
const wall = fs.readFileSync(path.join(root, "js/wall.js"), "utf8");
const start = background.indexOf("async function probeArticleVideo(");
const end = background.indexOf("async function readOpenPageForSource(", start);
assert.ok(start >= 0 && end > start);

function createProbe({ article, tab, result, allowed = true } = {}) {
  const calls = { queries: [], scripts: [], createdTabs: 0 };
  const MMP = {
    cleanUrl(value) {
      try {
        const url = new URL(value);
        for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "mc_cid", "mc_eid"]) url.searchParams.delete(key);
        url.hash = "";
        if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/$/, "");
        return url.href;
      } catch { return ""; }
    },
    probeVideoPage() {}
  };
  const context = vm.createContext({
    URL,
    MMP,
    MMPDB: { get: async () => article },
    accessible: async () => allowed,
    browser: {
      tabs: {
        query: async query => { calls.queries.push(query); return tab ? [tab] : []; },
        create: async () => { calls.createdTabs++; }
      },
      scripting: { executeScript: async options => { calls.scripts.push(options); return [{ result }]; } }
    }
  });
  vm.runInContext(background.slice(start, end), context);
  return { context, calls };
}

test("a click probe returns a discovered HLS, DASH, or file only from the already-open article tab", async () => {
  const article = { id: "article-1", canonicalUrl: "https://news.example/story" };
  const tab = { id: 17, url: "https://news.example/story" };
  const source = "https://media.example/master.mpd?token=private";
  const { context, calls } = createProbe({ article, tab, result: { kind: "dash", src: source } });
  const result = await vm.runInContext('probeArticleVideo("article-1")', context);

  assert.equal(result.kind, "dash");
  assert.equal(result.src, source);
  assert.equal(calls.queries.length, 1);
  assert.deepEqual(Object.keys(calls.queries[0]), []);
  assert.equal(calls.scripts.length, 1);
  assert.equal(calls.scripts[0].target.tabId, tab.id);
  assert.equal(calls.scripts[0].func, context.MMP.probeVideoPage);
  assert.deepEqual(Array.from(calls.scripts[0].args), [3500]);
  assert.equal(calls.createdTabs, 0);
});

test("an unavailable video does not open or navigate to the source page", async () => {
  const article = { id: "article-1", canonicalUrl: "https://news.example/story" };
  const { context, calls } = createProbe({ article, tab: null, result: null });
  const result = await vm.runInContext('probeArticleVideo("article-1")', context);

  assert.equal(result.kind, "unavailable");
  assert.match(result.error, /^Vidéo indisponible dans Mon Mur/);
  assert.equal(calls.queries.length, 1);
  assert.deepEqual(Object.keys(calls.queries[0]), []);
  assert.equal(calls.scripts.length, 0);
  assert.equal(calls.createdTabs, 0);
});

test("unknown iframes, missing URLs, and insecure streams never become players", async () => {
  const article = { id: "article-1", canonicalUrl: "https://news.example/story" };
  const tab = { id: 17, url: article.canonicalUrl };
  for (const result of [
    { kind: "frame", srcs: ["https://player.example/null"] },
    { kind: "hls", src: "" },
    { kind: "file", src: "http://media.example/video.mp4" }
  ]) {
    const harness = createProbe({ article, tab, result });
    const response = await vm.runInContext('probeArticleVideo("article-1")', harness.context);
    assert.equal(response.kind, "unavailable");
    assert.match(response.error, /^Vidéo indisponible dans Mon Mur/);
    assert.equal(response.src, undefined);
  }
});

test("the article keeps identified-but-unavailable videos and gives their click a probe path", () => {
  assert.match(wall, /videoInfo=result\.video\|\|null/);
  assert.doesNotMatch(wall, /videoInfo=result\.video\?\.kind==="unavailable"\?null/);
  assert.match(wall, /videoInfo\.kind==="unavailable"\|\|videoInfo\.kind==="francetv"[\s\S]*?type:"probeArticleVideo"/);
  assert.match(wall, /loadDashLibrary[\s\S]*?player\.initialize\(frame,videoInfo\.src,true\)/);
  assert.match(wall, /Vidéo indisponible dans Mon Mur/);
  assert.doesNotMatch(wall, /frame\.src=videoInfo\.src[\s\S]*?kind==="unavailable"/);
});
