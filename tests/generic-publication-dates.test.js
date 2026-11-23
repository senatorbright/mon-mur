const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ URL, Date, Map, Set, Object, String, Number, RegExp, JSON });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8"), context);
const dateFromUrl = url => vm.runInContext(`MMP.publicationDateFromUrl(${JSON.stringify(url)})`, context);
const dateFromText = (value, pageUrl) => vm.runInContext(`MMP.publicationDate(${JSON.stringify(value)}, ${JSON.stringify(pageUrl || "")})`, context);
const assessDates = articles => JSON.parse(JSON.stringify(vm.runInContext(`MMP.assessPublicationDates(${JSON.stringify(articles)})`, context)));

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

test("explicit timezone offsets are interpreted generically, independent of publisher", () => {
  const value = "2026-10-27T10:30:00+08:00";
  assert.equal(dateFromText(value, "https://french.news.cn/story"), Date.parse(value));
  assert.equal(dateFromText(value, "https://unknown.example/story"), Date.parse(value));
  assert.equal(dateFromText(value, "https://www.ladepeche.fr/story"), Date.parse(value));
  assert.equal(dateFromText("2026-10-27T10:30:00Z"), Date.parse("2026-10-27T10:30:00Z"));
});

test("French editorial dates are parsed without publisher-specific configuration", () => {
  assert.equal(dateFromText("27 octobre 2026", "https://www.ladepeche.fr/article"), Date.UTC(2026, 9, 27));
  assert.equal(dateFromText("27 oct. '26", "https://unknown.example/article"), Date.UTC(2026, 9, 27));
  assert.equal(dateFromText("vendredi 13 novembre 2026", "https://unknown.example/article"), Date.UTC(2026, 10, 13));
  assert.equal(dateFromText("lundi 12 octobre 2026", "https://unknown.example/article"), Date.UTC(2026, 9, 12));
});

test("invalid ISO calendar dates stay invalid even when a timezone is present", () => {
  assert.equal(dateFromText("2026-02-30T10:30:00Z"), Number.NaN);
  assert.equal(dateFromText("2026-02-30T10:30:00+08:00"), Number.NaN);
});

test("date reliability requires a strict majority of a representative sample", () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({
    canonicalUrl: `https://publisher.example/${index}`,
    publishedAt: Date.now() - index * 1000,
    dateIsFallback: index < 2,
    datePrecision: index < 2 ? "day" : "instant"
  }));
  const accepted = assessDates(rows);
  assert.equal(accepted.sampleCount, 5);
  assert.equal(accepted.reliableCount, 3);
  assert.equal(accepted.urlOnlyCount, 2);
  assert.equal(accepted.reliable, true);
  rows[2].dateIsFallback = true;
  assert.equal(assessDates(rows).reliable, false);
});
