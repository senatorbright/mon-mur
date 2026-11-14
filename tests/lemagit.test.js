const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function node({ text = "", attrs = {}, selectors = {}, card = null, parentElement = null, lists = {} } = {}) {
  return {
    textContent: text,
    parentElement,
    lists,
    getAttribute: name => attrs[name] || "",
    querySelector: selector => selectors[selector] || null,
    querySelectorAll: selector => lists[selector] || [],
    closest: () => card
  };
}

const listLink = node({ text: "OpenSearch : exemple", attrs: { href: "/actualites/exemple" } });
const datedCard = node({ text: "27 octobre 2026 OpenSearch : exemple Résumé", selectors: {
  "[itemprop='headline'], h1, h2, h3, h4, [class*='title' i]": node({ text: "OpenSearch : exemple" }),
  'time[datetime], [itemprop*="datePublished" i], [property*="published_time" i], [class*="date" i], [class*="time" i]': node({ text: "octobre 27, 2026" }),
  "[itemprop='description'], [class*='excerpt' i], [class*='summary' i], p": node({ text: "Résumé" })
} });
listLink.closest = () => datedCard;
const homeLink = node({ text: "À la une", attrs: { href: "/actualites/une" } });
const homeCard = node({ text: "À la une Résumé de la une", selectors: {
  "[itemprop='headline'], h1, h2, h3, h4, [class*='headline' i], [class*='title' i]": node({ text: "À la une" }),
  "[itemprop='description'], [class*='excerpt' i], [class*='summary' i], p": node({ text: "Résumé de la une" })
} });
homeLink.parentElement = homeCard;
homeCard.lists["a[href]"] = [homeLink];
const documents = {
  listing: { title: "Actualités", body: { textContent: "" }, querySelectorAll: selector => selector.includes("main a[href]") ? [listLink] : [] },
  home: { title: "Actualités", body: { textContent: "" }, querySelectorAll: selector => selector.includes("main a[href]") ? [homeLink] : [] }
};
class DOMParser {
  parseFromString(html) { return documents[html]; }
}
const document = { createElement: () => ({ set innerHTML(value) { this.value = value; } }) };
const context = vm.createContext({ URL, Date, Map, Set, Object, String, Number, RegExp, JSON, DOMParser, document });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8"), context);

test("generic editorial cards extract French publication dates independent of domain", () => {
  const articles = vm.runInContext('MMP.parseHtmlArticles("listing", "https://example.test/actualites", {id:"example"})', context);
  assert.equal(articles.length, 1);
  assert.equal(articles[0].publishedAt, Date.UTC(2026, 9, 27));
  assert.equal(articles[0].datePrecision, "day");
  assert.equal(articles[0].dateIsFallback, false);
});

test("generic compact cards recover without semantic classes or invented dates", () => {
  const articles = vm.runInContext('MMP.parseHtmlArticles("home", "https://example.test/", {id:"example"})', context);
  assert.equal(articles.length, 1);
  assert.equal(articles[0].canonicalUrl, "https://example.test/actualites/une");
  assert.equal(articles[0].summary, "Résumé de la une");
  assert.equal(articles[0].dateIsFallback, true);
  assert.equal(articles[0].datePrecision, "unknown");
});

test("localized date parsing validates calendar days", () => {
  assert.equal(vm.runInContext('MMP.publicationDateFromText("27 oct.\'26")', context), Date.UTC(2026, 9, 27));
  assert.equal(vm.runInContext('MMP.publicationDateFromText("février 30, 2026")', context), Number.NaN);
});
