const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function element(localName, textContent = "", attrs = {}, children = []) {
  const node = {
    localName,
    nodeName: localName,
    textContent,
    attrs,
    children,
    getAttribute(name) { return this.attrs[name] || ""; },
    getElementsByTagName(name) {
      return descendants(this).filter(child => child.nodeName === name);
    },
    getElementsByTagNameNS(_namespace, name) {
      return descendants(this).filter(child => child.localName === name || child.nodeName.endsWith(`:${name}`));
    }
  };
  return node;
}

function descendants(node) {
  return node.children.flatMap(child => [child, ...descendants(child)]);
}

function documentFor(xml) {
  const isAtom = xml.includes("<feed");
  const isUrlDated = xml.includes("<url-date");
  const mediaVariants = xml.includes("media-variants");
  const itemUrl = isUrlDated ? "https://publisher.example/20261027/abcdef0123456789abcdef0123456789/c.html" : "https://publisher.example/news/item";
  const item = isAtom
    ? element("entry", "", {}, [
      element("title", "Article générique"),
      element("link", "", { rel: "alternate", href: itemUrl }),
      element("updated", "Mon, 26 Oct 2026 12:00:00 GMT"),
      element("summary", "Résumé public")
    ])
    : element("item", "", {}, [
      element("title", "Article générique"),
      element("link", itemUrl),
      element("pubDate", "Mon, 26 Oct 2026 12:00:00 GMT"),
      element("description", "Résumé public"),
      ...(mediaVariants ? [
        element("media:content", "", { url: "https://publisher.example/image-320x180.jpg", width: "320", height: "180" }),
        element("media:content", "", { url: "https://publisher.example/image-1280x720.jpg", width: "1280", height: "720" })
      ] : [])
    ]);
  const channel = element("channel", "", {}, [element("title", "Flux générique"), item]);
  const root = isAtom ? element("feed", "", {}, [element("title", "Flux générique"), item]) : element("rss", "", {}, [channel]);
  root.getElementsByTagName = function(name) { return descendants(this).filter(child => child.nodeName === name); };
  return {
    documentElement: root,
    querySelector: () => null,
    getElementsByTagName: name => descendants(root).filter(child => child.nodeName === name),
    getElementsByTagNameNS: (_namespace, name) => descendants(root).filter(child => child.localName === name || child.nodeName.endsWith(`:${name}`))
  };
}

class DOMParser {
  parseFromString(xml) { return documentFor(xml); }
}

const document = {
  createElement: () => ({ set innerHTML(value) { this.value = value; }, value: "" })
};
const context = vm.createContext({ URL, Date, Intl, Set, Map, Object, String, Number, RegExp, JSON, DOMParser, document });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8"), context);

test("generic RSS feeds are parsed without publisher-specific rules", () => {
  const articles = vm.runInContext('MMP.parseFeed("<rss/>", "https://publisher.example/feed.xml", {id:"publisher"})', context);
  assert.equal(articles.length, 1);
  assert.equal(articles[0].canonicalUrl, "https://publisher.example/news/item");
  assert.equal(articles[0].title, "Article générique");
  assert.equal(articles[0].summary, "Résumé public");
});

test("RSS image variants select the largest declared rendition", () => {
  const articles = vm.runInContext('MMP.parseFeed("<rss><media-variants/></rss>", "https://publisher.example/feed.xml", {id:"publisher"})', context);
  assert.equal(articles[0].image, "https://publisher.example/image-1280x720.jpg");
});

test("generic Atom feeds are parsed without publisher-specific rules", () => {
  const articles = vm.runInContext('MMP.parseFeed("<feed/>", "https://publisher.example/atom.xml", {id:"publisher"})', context);
  assert.equal(articles.length, 1);
  assert.equal(articles[0].canonicalUrl, "https://publisher.example/news/item");
  assert.equal(articles[0].title, "Article générique");
  assert.equal(articles[0].summary, "Résumé public");
});

test("JSON Feed entries retain optional metadata and reject duplicates without fabricating dates", () => {
  const json = JSON.stringify({
    version: "https://jsonfeed.org/version/1.1",
    items: [
      { id: "entry-1", url: "https://publisher.example/post", title: "Article JSON", summary: "Résumé", content_text: "Résumé complet\nDeuxième paragraphe", date_published: "2026-10-26T12:00:00Z", authors: [{ name: "Alex Martin" }], tags: ["économie"], image: "https://publisher.example/post.jpg", attachments: [{ url: "https://publisher.example/video.mp4", mime_type: "video/mp4" }] },
      { id: "entry-duplicate", url: "https://publisher.example/post", title: "Doublon", date_published: "2026-10-26T12:00:00Z" },
      { id: "entry-2", url: "https://publisher.example/undated", title: "Sans date" }
    ]
  });
  const entries = vm.runInContext(`MMP.parseJsonFeed(${JSON.stringify(json)}, "https://publisher.example/feed.json", {id:"publisher"})`, context);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].author, "Alex Martin");
  assert.equal(entries[0].image, "https://publisher.example/post.jpg");
  assert.equal(entries[0].video, "https://publisher.example/video.mp4");
  assert.deepEqual(Array.from(entries[0].categories), ["économie"]);
  assert.equal(entries[1].dateIsFallback, true);
  const withContent = vm.runInContext(`MMP.parseJsonFeed(${JSON.stringify(json)}, "https://publisher.example/feed.json", {id:"publisher"}, true)`, context);
  assert.match(withContent[0].feedContentHtml, /<br>/);
});

test("ordinary JSON APIs are rejected as JSON Feed", () => {
  for (const document of [
    { results: [{ title: "Résultat GOV.UK", web_url: "https://www.gov.uk/news/story" }] },
    { version: "https://jsonfeed.org/version/1", results: [] },
    { version: "https://jsonfeed.org/version/1", items: {} }
  ]) {
    assert.throws(() => vm.runInContext(`MMP.parseJsonFeed(${JSON.stringify(JSON.stringify(document))}, "https://api.example/news", {id:"source"})`, context), /invalide|incompatible avec JSON Feed/);
  }
});

test("HTML alternate links discover JSON Feed without a publisher-specific rule", async () => {
  const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const start = background.indexOf("function feedMethod(");
  const end = background.indexOf("async function readOpenPage(", start);
  assert.ok(start >= 0 && end > start);
  const declared = { href: "https://unknown.example/syndication/items.json", type: "application/feed+json", title: "Articles" };
  declared.getAttribute = name => ({ href: "/syndication/items.json", type: "application/feed+json", rel: "alternate", title: "Articles" })[name] || "";
  class HtmlDOMParser { parseFromString() { return { querySelectorAll: selector => selector.startsWith("link[") ? [declared] : [] }; } }
  const discoverContext = vm.createContext({ URL, Set, Map, Promise, DOMParser: HtmlDOMParser, MMP: { cleanUrl(value, base) { try { return new URL(value, base).href; } catch { return ""; } } } });
  vm.runInContext(background.slice(start, end), discoverContext);
  const feeds = await vm.runInContext('discoverFeedCandidates("https://unknown.example/news", "<html></html>")', discoverContext);
  assert.ok(feeds.some(feed => feed.url === "https://unknown.example/syndication/items.json" && feed.type === "application/feed+json"));
  assert.equal(vm.runInContext('feedMethod("https://unknown.example/feed.json", "application/feed+json")', discoverContext), "jsonfeed");
});

test("the existing source collector stores validated JSON Feed entries using the structured method", async () => {
  const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const start = background.indexOf("function structuredExtractionProfile(");
  const end = background.indexOf("async function validateArticleAccess(", start);
  assert.ok(start >= 0 && end > start);
  const article = { canonicalUrl: "https://publisher.example/post", title: "Article JSON", summary: "Résumé", author: "Alex", image: "", categories: [], publishedAt: 1, dateIsFallback: false };
  const context = vm.createContext({
    URL, Date, Map, Promise,
    MMP: { parseJsonFeed: () => [article], recoverArticleTitle: title => title, parseFeed() { throw new Error("XML parser should not run for JSON Feed"); }, normalizeFeedXml() { throw new Error("XML normalization should not run for JSON Feed"); } },
    fetchText: async () => ({ text: '{"version":"https://jsonfeed.org/version/1","items":[]}', status: 200, type: "application/feed+json" }),
    enrichArticleImages: async (_body, _source, articles) => ({ articles, imageUpdates: [] }),
    enrichCinemaArticles: async articles => articles
  });
  vm.runInContext(background.slice(start, end), context);
  const result = await vm.runInContext('fetchSource({id:"source",method:"jsonfeed",pageUrl:"https://publisher.example",feedUrl:"https://publisher.example/feed.json"}, new Map(), [], {})', context);
  assert.equal(result.method, "jsonfeed");
  assert.equal(result.extractionProfile.kind, "structured-feed");
  assert.equal(result.extractionProfile.fields.author, true);
  assert.equal(result.articles[0].author, "Alex");
});

test("an RSS publication date takes precedence over a date encoded in its article URL", () => {
  const articles = vm.runInContext('MMP.parseFeed("<rss><url-date/></rss>", "https://publisher.example/feed.xml", {id:"publisher"})', context);
  assert.equal(articles[0].publishedAt, Date.parse("Mon, 26 Oct 2026 12:00:00 GMT"));
  assert.equal(articles[0].dateIsFallback, false);
});

test("HTML alternate links discover declared Atom feeds on unknown domains", async () => {
  const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const start = background.indexOf("function feedMethod(");
  const end = background.indexOf("async function readOpenPage(", start);
  assert.ok(start >= 0 && end > start);
  const declared = { href: "https://unknown.example/syndication/news.xml", type: "application/atom+xml", title: "Actualités", getAttribute: name => ({ href: "/syndication/news.xml", type: "application/atom+xml", rel: "alternate", title: "Actualités" })[name] || "" };
  class HtmlDOMParser { parseFromString() { return { querySelectorAll: selector => selector.startsWith("link[") ? [declared] : [] }; } }
  const discoverContext = vm.createContext({ URL, Set, Map, Promise, DOMParser: HtmlDOMParser, MMP: { cleanUrl(value, base) { try { return new URL(value, base).href; } catch { return ""; } } } });
  vm.runInContext(background.slice(start, end), discoverContext);
  const feeds = await vm.runInContext('discoverFeedCandidates("https://unknown.example/news", "<html></html>")', discoverContext);
  assert.ok(feeds.some(feed => feed.url === "https://unknown.example/syndication/news.xml" && feed.type === "application/atom+xml"));
});

test("the retained French-Stream category feed endpoint remains available", () => {
  const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const start = background.indexOf("function knownPublisherFeedCandidates(");
  const end = background.indexOf("function cleanRequestUrl(", start);
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({ URL });
  vm.runInContext(background.slice(start, end), context);
  const candidates = vm.runInContext('knownPublisherFeedCandidates("https://french-stream.net/films/")', context);
  assert.deepEqual(Array.from(candidates), ["https://french-stream.net/engine/rss.php?do=cat&category=films"]);
  assert.deepEqual(Array.from(vm.runInContext('knownPublisherFeedCandidates("https://unknown.example/films/")', context)), []);
});
