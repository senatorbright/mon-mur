const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
const start = background.indexOf("async function fetchText(");
const end = background.indexOf("async function accessible(", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const fetchTextSource = background.slice(start, end);

function harness(response) {
  const requests = [];
  const context = vm.createContext({
    AbortController,
    AbortSignal,
    URL,
    Error,
    Promise,
    setTimeout,
    clearTimeout,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return response;
    }
  });
  vm.runInContext(fetchTextSource, context);
  return { requests, fetchText: (url, timeout) => vm.runInContext(`fetchText(${JSON.stringify(url)}, ${timeout})`, context) };
}

test("generic RSS and article requests omit cookies for every host", async () => {
  const app = harness({
    ok: true,
    status: 200,
    url: "https://example.test/feed.xml",
    headers: { get: name => name === "content-type" ? "application/rss+xml" : "" },
    text: async () => "<rss/>"
  });
  const result = await app.fetchText("https://example.test/feed.xml", 1000);
  assert.equal(result.text, "<rss/>");
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].options.credentials, "omit");
});

test("a server access denial is returned without a credential retry", async () => {
  const app = harness({ ok: false, status: 403, url: "https://example.test/article", headers: { get: () => "text/html" } });
  await assert.rejects(app.fetchText("https://example.test/article", 1000), error => error.status === 403 && error.kind === "access");
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].options.credentials, "omit");
});

test("the retained Demosphere event extractor still returns the event description", () => {
  const start = background.indexOf("function demosphereEventContent(");
  const end = background.indexOf("async function wordpressFeaturedImage(", start);
  assert.ok(start >= 0 && end > start);
  const body = { innerHTML: "Description détaillée de cet événement public", querySelectorAll: () => [], cloneNode() { return this; } };
  const event = { querySelector: selector => selector === "#htmlView" ? body : null };
  const doc = { querySelector: selector => selector === "#eventMain" ? event : null };
  const context = vm.createContext({ URL, MMP: { normalizeText: value => String(value).toLowerCase() }, usableReaderContent: (html, _url, min) => html.length >= min ? { text: html } : null });
  vm.runInContext(background.slice(start, end), context);
  const result = vm.runInContext('demosphereEventContent(doc, article)', vm.createContext({ ...context, doc, article: { canonicalUrl: "https://events.demosphere.net/rv/123", title: "Événement" } }));
  assert.match(result.text, /Description détaillée/);
});

test("full content from an RSS entry remains available when fetching its article fails", async () => {
  const start = background.indexOf("async function fetchReaderContent(");
  const end = background.indexOf("function cleanCinemaTitle(", start);
  assert.ok(start >= 0 && end > start);
  const fetchText = async url => {
    if (url === "https://publisher.example/feed.xml") return { text: "<rss/>", type: "application/rss+xml" };
    throw Object.assign(new Error("Accès refusé"), { status: 403 });
  };
  class FeedDOMParser { parseFromString() { return { querySelector: () => null }; } }
  const context = vm.createContext({
    URL,
    state: async () => ({ sources: [{ id: "s", feedUrl: "https://publisher.example/feed.xml", method: "rss" }] }),
    accessible: async () => true,
    fetchText,
    DOMParser: FeedDOMParser,
    MMP: { parseFeed: () => [{ canonicalUrl: "https://publisher.example/article", feedContentHtml: "Contenu complet fourni dans le flux" }] },
    usableReaderContent: (html, _url) => html ? { html, text: html } : null
  });
  vm.runInContext(background.slice(start, end), context);
  const result = await vm.runInContext('fetchReaderContent({ id:"a", sourceId:"s", canonicalUrl:"https://publisher.example/article", image:"" })', context);
  assert.equal(result.source, "flux");
  assert.match(result.text, /Contenu complet fourni dans le flux/);
});

test("Readability wins over broad article-content selectors that can match recommendations", async () => {
  const start = background.indexOf("async function fetchReaderContent(");
  const end = background.indexOf("function cleanCinemaTitle(", start);
  assert.ok(start >= 0 && end > start);
  let readabilityCalled = false, fallbackQueried = false;
  const unrelatedRecommendation = { innerHTML: "Un article recommandé", cloneNode() { return this; }, querySelectorAll: () => [] };
  const doc = {
    head: { prepend() {} },
    querySelector(selector) { if (selector.includes("articleBody")) return null; fallbackQueried = true; return unrelatedRecommendation; },
    querySelectorAll: () => [],
    createElement: () => ({ set href(value) { this.value = value; } })
  };
  class ArticleDOMParser { parseFromString(value) { return value === "readability-story" ? { body: { textContent: "Le véritable article commence ici." } } : doc; } }
  class Readability { constructor() {} parse() { readabilityCalled = true; return { content: "readability-story" }; } }
  const context = vm.createContext({
    URL, Readability,
    state: async () => ({ sources: [] }),
    accessible: async () => true,
    fetchText: async () => ({ text: "<html></html>", type: "text/html" }),
    DOMParser: ArticleDOMParser,
    MMP: { cleanUrl: () => "", extractVideo: () => null },
    markInlineVideo: () => false,
    semanticArticleContent: () => null,
    articleImage: () => "",
    wordpressFeaturedImage: async () => "",
    eventMetadata: () => null,
    demosphereEventContent: () => null,
    clean: () => {},
    usableReaderContent: html => ({ html, text: html === "readability-story" ? "Le véritable article commence ici." : html })
  });
  vm.runInContext(background.slice(start, end), context);
  const result = await vm.runInContext('fetchReaderContent({ id:"a", sourceId:"s", canonicalUrl:"https://unknown.example/article", image:"" })', context);
  assert.equal(readabilityCalled, true);
  assert.equal(fallbackQueried, false);
  assert.match(result.text, /véritable article/);
  assert.doesNotMatch(result.text, /recommandé/);
  assert.equal(result.source, "article");
});

test("an inline player placeholder stays between its surrounding article blocks", () => {
  const start = background.indexOf("const INLINE_VIDEO_MARKER =");
  const end = background.indexOf("function demosphereEventContent(", start);
  assert.ok(start >= 0 && end > start);
  const sequence = ["paragraph before", null, "paragraph after"];
  const media = { closest: () => block };
  const block = {
    querySelector: () => ({ textContent: "Description de la vidéo" }),
    replaceWith(node) { sequence[1] = node; }
  };
  sequence[1] = media;
  const doc = {
    querySelectorAll: selector => { assert.match(selector, /article video/); return [media]; },
    createElement: tag => ({ tagName: tag.toUpperCase(), textContent: "" })
  };
  const context = vm.createContext({});
  vm.runInContext(background.slice(start, end), context);
  const video = { kind: "unavailable" };
  context.doc = doc; context.video = video;
  assert.equal(vm.runInContext("markInlineVideo(doc, video)", context), true);
  assert.equal(sequence[0], "paragraph before");
  assert.equal(sequence[1].textContent, "MONMUR_VIDEO_BLOCK");
  assert.equal(sequence[2], "paragraph after");
  assert.equal(video.caption, "Description de la vidéo");
});
