const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ URL, Date, Map, Set, Object, String, Number, RegExp, JSON });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8"), context);
const dateFromUrl = url => vm.runInContext(`MMP.publicationDateFromUrl(${JSON.stringify(url)})`, context);

test("a dated article URL yields its validated calendar publication date regardless of domain", () => {
  assert.equal(dateFromUrl("https://french.news.cn/20261027/abcdef0123456789abcdef0123456789/c.html"), Date.UTC(2026, 9, 27));
  assert.equal(dateFromUrl("https://unknown.example/20261027/abcdef0123456789abcdef0123456789/c.html"), Date.UTC(2026, 9, 27));
  assert.equal(dateFromUrl("https://french.news.cn/20260230/abcdef0123456789abcdef0123456789/c.html"), Number.NaN);
  assert.equal(dateFromUrl("https://example.test/news/20261027/story"), Date.UTC(2026, 9, 27));
  assert.equal(dateFromUrl("https://example.test/news/20261327/story"), Number.NaN);
});

test("HTML URL dates are fallback-only and never override structured publication dates", () => {
  const articleUrl = "https://unknown.example/20261027/abcdef0123456789abcdef0123456789/c.html";
  const link = { textContent: "Un article au titre suffisamment long", parentElement: null, getAttribute: name => name === "href" ? articleUrl : "", querySelector: () => null, querySelectorAll: () => [] };
  const metadata = { textContent: JSON.stringify({ "@type": "NewsArticle", url: articleUrl, headline: "Un article au titre suffisamment long", datePublished: "2026-10-26T12:00:00Z" }) };
  const docs = {
    structured: { title: "", body: { textContent: "" }, querySelectorAll: selector => selector === 'script[type="application/ld+json"]' ? [metadata] : selector === "a[href]" ? [link] : [] },
    urlOnly: { title: "", body: { textContent: "" }, querySelectorAll: selector => selector === 'script[type="application/ld+json"]' ? [] : selector === "a[href]" ? [link] : [] }
  };
  class FixtureDOMParser { parseFromString(html) { return docs[html]; } }
  const fixtureContext = vm.createContext({ URL, Date, Map, Set, Object, String, Number, RegExp, JSON, DOMParser: FixtureDOMParser, document: { createElement: () => ({ set innerHTML(value) { this.value = value; }, value: "" }) } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8"), fixtureContext);
  const structured = vm.runInContext('MMP.parseHtmlArticles("structured", "https://unknown.example/", {id:"test"})', fixtureContext)[0];
  assert.equal(structured.publishedAt, Date.parse("2026-10-26T12:00:00Z"));
  assert.equal(structured.dateIsFallback, false);
  const urlOnly = vm.runInContext('MMP.parseHtmlArticles("urlOnly", "https://unknown.example/", {id:"test"})', fixtureContext)[0];
  assert.equal(urlOnly.publishedAt, Date.UTC(2026, 9, 27));
  assert.equal(urlOnly.dateIsFallback, true);
});
