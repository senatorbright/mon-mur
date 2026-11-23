const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Element {
  constructor(tag, attrs = {}, children = [], content = "") {
    this.localName = tag.toLowerCase();
    this.nodeName = this.localName;
    this.attrs = attrs;
    this.children = children;
    this.classList = String(attrs.class || "").split(/\s+/).filter(Boolean);
    this.parentElement = null;
    this._content = content;
    for (const child of children) child.parentElement = this;
  }
  get textContent() { return [this._content, ...this.children.map(child => child.textContent)].filter(Boolean).join(" "); }
  getAttribute(name) { return this.attrs[name] ?? ""; }
  get nextElementSibling() { const siblings = this.parentElement?.children || [], index = siblings.indexOf(this); return index >= 0 ? siblings[index + 1] || null : null; }
  matches(selector) {
    const classContains = selector.match(/^\[class\*=["']([^"']+)["']\s+i?\]$/i);
    if (classContains) return String(this.attrs.class || "").toLowerCase().includes(classContains[1].toLowerCase());
    if (selector.includes(">")) {
      const parts = selector.split(">").map(part => part.trim());
      return parts.length === 2 && this.matches(parts[1]) && !!this.parentElement?.matches(parts[0]);
    }
    if (selector.includes(" ")) {
      const parts = selector.trim().split(/\s+/);
      if (!this.matches(parts.pop())) return false;
      let ancestor = this.parentElement;
      while (parts.length) {
        const expected = parts.pop();
        while (ancestor && !ancestor.matches(expected)) ancestor = ancestor.parentElement;
        if (!ancestor) return false;
        ancestor = ancestor.parentElement;
      }
      return true;
    }
    const match = selector.trim().match(/^([a-z][\w-]*)?((?:\.[\w-]+)*)(?:\[([\w-]+)(?:=["']([^"']*)["'])?\])?$/i);
    if (!match) return false;
    if (match[1] && this.localName !== match[1].toLowerCase()) return false;
    if (match[2] && match[2].slice(1).split(".").some(name => !this.classList.includes(name))) return false;
    if (match[3] && !(match[3] in this.attrs)) return false;
    return !match[4] || this.attrs[match[3]] === match[4];
  }
  querySelectorAll(selector) {
    const alternatives = selector.split(",").map(part => part.trim());
    const out = [];
    const visit = node => {
      for (const child of node.children) {
        if (alternatives.some(part => child.matches(part))) out.push(child);
        visit(child);
      }
    };
    visit(this);
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (selector.split(",").some(part => node.matches(part.trim()))) return node; return null; }
  contains(node) { for (let current = node; current; current = current.parentElement) if (current === this) return true; return false; }
}

function listing(count = 3) {
  const cards = Array.from({ length: count }, (_, index) => new Element("article", { class: "story-card" }, [
    new Element("h2", { class: "story-title" }, [new Element("a", { href: `/news/${index + 1}`, class: "story-link" }, [], `Publication ${index + 1}`)]),
    new Element("time", { datetime: `2026-10-${String(index + 20).padStart(2, "0")}` }, [], "date"),
    new Element("p", { class: "excerpt" }, [], `Résumé cohérent pour la publication numéro ${index + 1}.`),
    new Element("img", { src: `/images/${index + 1}.jpg` })
  ]));
  const main = new Element("main", {}, cards);
  return new Element("body", {}, [main]);
}

function singlePublication() {
  const data = {
    "@context": "https://schema.org", "@type": "ReportageNewsArticle", url: "https://publisher.example/story",
    headline: "Une publication isolée structurée", datePublished: "2026-10-28T10:30:00Z",
    author: { "@type": "Person", name: "Camille Martin" }, articleSection: "Économie", keywords: "industrie, énergie",
    description: "Description de la publication.", image: "https://publisher.example/story.jpg"
  };
  const related = { "@type": "NewsArticle", url: "https://publisher.example/related", headline: "Un article associé" };
  return new Element("body", {}, [new Element("script", { type: "application/ld+json" }, [], JSON.stringify({ "@graph": [related, data] }))]);
}

function singlePublicationWithTimeOnly() {
  const data = { "@context": "https://schema.org", "@type": "NewsArticle", url: "https://publisher.example/time-story", headline: "Article daté uniquement par une balise time" };
  return new Element("body", {}, [
    new Element("script", { type: "application/ld+json" }, [], JSON.stringify(data)),
    new Element("article", {}, [new Element("h1", {}, [], data.headline), new Element("time", { datetime: "2026-11-20T09:15:00Z" }, [], "20 novembre à 10 h 15")])
  ]);
}

function singlePublicationWithHeadlineSmallDate() {
  const data = { "@context": "https://schema.org", "@type": "NewsArticle", url: "https://publisher.example/small-date", headline: "Article avec date française près du titre" };
  return new Element("body", {}, [
    new Element("script", { type: "application/ld+json" }, [], JSON.stringify(data)),
    new Element("article", {}, [
      new Element("h1", {}, [], data.headline),
      new Element("small", {}, [], "vendredi 13 novembre 2026"),
      new Element("div", { id: "introduction" }, [], "Une présentation éditoriale suffisamment longue."),
      new Element("p", { class: "event-date" }, [], "Événement : 5 décembre 2026")
    ])
  ]);
}

function singlePublicationWithBodyEventDateOnly() {
  const data = { "@context": "https://schema.org", "@type": "NewsArticle", url: "https://publisher.example/event-date-only", headline: "Article sans date de publication visible" };
  return new Element("body", {}, [
    new Element("script", { type: "application/ld+json" }, [], JSON.stringify(data)),
    new Element("article", {}, [
      new Element("h1", {}, [], data.headline),
      new Element("small", { class: "event-date" }, [], "5 décembre 2026"),
      new Element("div", { id: "introduction" }, [], "Une présentation éditoriale suffisamment longue."),
      new Element("p", {}, [], "Un contenu événementiel présenté dans le corps de l’article.")
    ])
  ]);
}

function singlePublicationWithVisibleZonedDate() {
  const data = { "@context": "https://schema.org", "@type": "NewsArticle", url: "https://publisher.example/zoned-story", headline: "Article avec date et fuseau visibles" };
  return new Element("body", {}, [
    new Element("script", { type: "application/ld+json" }, [], JSON.stringify(data)),
    new Element("article", {}, [new Element("h1", {}, [], data.headline), new Element("time", {}, [], "2026-10-27T10:30:00+08:00")])
  ]);
}

function xinhuaPublicationWithVisibleTime() {
  const data = { "@type": "NewsArticle", url: "https://french.news.cn/20261123/example/c.html", headline: "Article Xinhua avec heure visible" };
  return new Element("body", {}, [
    new Element("meta", { name: "publishdate", content: "2026-11-23" }),
    new Element("script", { type: "application/ld+json" }, [], JSON.stringify(data)),
    new Element("article", {}, [new Element("h1", {}, [], data.headline), new Element("div", { class: "info" }, [new Element("p", { class: "time" }, [], "French.news.cn | 2026-11-23 à 02:05")])])
  ]);
}

function singlePublicationWithDateCreatedOnly() {
  const data = { "@context": "https://schema.org", "@type": "NewsArticle", url: "https://publisher.example/created-story", headline: "Article avec dateCreated seulement", dateCreated: "2026-11-20T09:15:00Z" };
  return new Element("body", {}, [new Element("script", { type: "application/ld+json" }, [], JSON.stringify(data))]);
}

function listingWithSchema() {
  const body = listing(3);
  const graph = Array.from({ length: 3 }, (_, index) => ({
    "@type": "NewsArticle", url: `https://publisher.example/news/${index + 1}`,
    headline: `Publication ${index + 1}`, author: { name: `Auteur ${index + 1}` },
    articleSection: "Actualités", keywords: "locale, reportage", datePublished: index === 0 ? "2026-10-28" : "2026-10-28T09:00:00Z",
    video: { contentUrl: `https://publisher.example/video/${index + 1}.mp4` }
  }));
  return new Element("body", {}, [...body.children, new Element("script", { type: "application/ld+json" }, [], JSON.stringify({ "@graph": graph }))]);
}

function classlessListing() {
  const base = listing(3).children[0];
  const cards = base.children.map(card => new Element("div", {}, card.children));
  const section = new Element("section", { class: "news-list" }, cards);
  const main = new Element("main", {}, [section, new Element("div", { class: "layout-spacer" }, [])]);
  return new Element("body", {}, [main, new Element("aside", {}, [new Element("div", {}, [])])]);
}

function imageArchiveCards() {
  const cards = Array.from({ length: 3 }, (_, index) => new Element("div", { class: "archive-card" }, [
    new Element("a", { href: `/archive/${index + 1}` }, [
      new Element("h2", {}, [], `Publication d’archive numéro ${index + 1}`),
      new Element("img", { src: `/images/archive-${index + 1}.jpg` })
    ])
  ]));
  return new Element("body", {}, [new Element("main", {}, cards)]);
}

function navigationAndEditorialCards() {
  const navigation = ["S'abonner", "Journal", "Gourdon", "Voir plus de contenus: Actualités Gourdon"].map((title, index) => new Element(index === 3 ? "div" : "nav", { class: index === 3 ? "block center-align" : "navbar-sub" }, [
    new Element("h2", {}, [], "Actualités locales et informations pratiques"),
    new Element("p", {}, [], "Retrouvez les dernières informations, les horaires et toutes les nouveautés de votre territoire."),
    new Element("a", { href: `/navigation/${index + 1}` }, [], title)
  ]));
  const legitimate = new Element("article", {}, [
    new Element("h2", {}, [new Element("a", { href: "/actualites/article-sans-date" }, [], "Un véritable article sans date")]),
    new Element("p", {}, [], "Un résumé éditorial assez long qui confirme qu’il s’agit d’un contenu publié.")
  ]);
  return new Element("body", {}, [new Element("div", { class: "main-content" }, [new Element("main", {}, [...navigation, legitimate])])]);
}

function metacriticGameCards() {
  const cards = ["Game Alpha", "Game Beta", "Game Gamma"].map((title, index) => new Element("article", { class: "c-gameProductCard" }, [
    new Element("a", { href: `/game/${index + 1}/` }, [
      new Element("h2", { class: "c-gameProductCard_title" }, [], title),
      new Element("img", { src: `/images/game-${index + 1}.jpg` })
    ])
  ]));
  return new Element("body", {}, [new Element("main", {}, cards)]);
}

const documents = new Map([["listing", listing(3)], ["one-listing-item", listing(1)], ["single-publication", singlePublication()], ["single-publication-time-only", singlePublicationWithTimeOnly()], ["single-publication-headline-small-date", singlePublicationWithHeadlineSmallDate()], ["single-publication-body-event-date-only", singlePublicationWithBodyEventDateOnly()], ["single-publication-visible-zoned-date", singlePublicationWithVisibleZonedDate()], ["xinhua-publication-visible-time", xinhuaPublicationWithVisibleTime()], ["single-publication-date-created-only", singlePublicationWithDateCreatedOnly()], ["listing-with-schema", listingWithSchema()], ["classless-listing", classlessListing()], ["image-archive", imageArchiveCards()], ["navigation-and-editorial", navigationAndEditorialCards()], ["metacritic-games", metacriticGameCards()]]);
class DOMParser {
  parseFromString(value) {
    const body = documents.get(value);
    const doc = {
      body,
      title: "",
      querySelectorAll: selector => body.querySelectorAll(selector),
      querySelector: selector => body.querySelector(selector)
    };
    return doc;
  }
}
const context = vm.createContext({ URL, Date, Intl, Set, Map, Object, String, Number, RegExp, JSON, DOMParser, document: { createElement: () => ({ set innerHTML(value) { this.value = value; }, value: "" }) } });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8"), context);
const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");

function fetchSourceHarness(overrides = {}) {
  const start = background.indexOf("function representativeArticles(");
  const end = background.indexOf("async function validateArticleAccess(", start);
  const profile = { version: 1, method: "html", kind: "listing", status: "validated", refreshable: true, itemSelector: "article.story-card", linkSelector: "a.story-link", titleSelector: "h2.story-title", validation: { minimumItems: 2 } };
  const article = { canonicalUrl: "https://publisher.example/story", title: "Une histoire", sourceId: "source", publishedAt: 1, dateIsFallback: false };
  const calls = { profile: 0, legacy: 0, learned: 0, articlePageFetches: [] };
  const MMP = {
    recoverArticleTitle(title) { return title; },
    assessPublicationDates(articles) {
      const rows = (articles || []).filter(article => article?.canonicalUrl), limit = Math.min(rows.length, 5);
      const indexes = rows.length <= limit ? rows.map((_, index) => index) : Array.from({ length: limit }, (_, index) => Math.round(index * (rows.length - 1) / (limit - 1)));
      const sample = [...new Set(indexes)].map(index => rows[index]).filter(Boolean);
      const reliableCount = sample.filter(article => article.dateIsFallback !== true && Number(article.publishedAt) > 0 && Number(article.publishedAt) <= Date.now()).length;
      const minimumReliable = Math.floor(sample.length / 2) + 1;
      return { sampleCount: sample.length, reliableCount, fallbackCount: sample.length - reliableCount, urlOnlyCount: 0, rate: sample.length ? reliableCount / sample.length : 0, minimumReliable, reliable: sample.length >= 2 && reliableCount >= minimumReliable, sampleUrls: sample.map(article => article.canonicalUrl) };
    },
    extractHtmlProfile() { calls.profile++; return typeof overrides.profileResult === "function" ? overrides.profileResult(calls.profile) : overrides.profileResult || { articles: [article, { ...article, canonicalUrl: "https://publisher.example/story-2" }], diagnostics: { reason: "Profil HTML validé pour cette collecte." } }; },
    parseHtmlArticles() { calls.legacy++; return overrides.legacyArticles || []; },
    learnHtmlProfile() { calls.learned++; return overrides.learnedResult || { profile: null, diagnostics: { profileLearned: false, reason: "Aucune structure répétitive." } }; },
    extractHtmlPublication(html, pageUrl) {
      if (typeof overrides.singlePublication === "function") return overrides.singlePublication(html, pageUrl);
      return overrides.singlePublication || { article: null, diagnostics: { singlePublication: false, reason: "Aucune publication structurée." } };
    },
    cleanUrl(value) { try { const url = new URL(value); url.hash = ""; url.pathname = url.pathname.replace(/\/$/, "") || "/"; return url.href; } catch { return ""; } }
  };
  const extracted = vm.createContext({
    URL, Date, Map, Set, Promise, MMP,
    diagnosticUrl: url => { try { return new URL(url).href; } catch { return String(url || ""); } },
    requestDiagnostic: (phase, url, extra = {}) => ({ phase, url, ...extra }),
    fetchText: async url => { calls.articlePageFetches.push(url); return { text: url, url, status: 200, type: "text/html" }; },
    knownPublisherFeedCandidates: () => [],
    enrichArticleImages: async (_html, _source, articles) => ({ articles, imageUpdates: [] }),
    enrichCinemaArticles: async articles => articles,
    readOpenPageForSource: async () => ""
  });
  vm.runInContext(background.slice(start, end), extracted);
  return { calls, profile, article, fetchSource: (source, cached = []) => vm.runInContext(`fetchSource(${JSON.stringify(source)}, new Map(), ${JSON.stringify(cached)}, {})`, extracted) };
}

test("a repeatable HTML listing learns a versioned declarative profile and reuses it", () => {
  const learned = vm.runInContext('MMP.learnHtmlProfile("listing", "https://publisher.example/news")', context);
  assert.equal(learned.diagnostics.profileLearned, true);
  assert.equal(learned.profile.version, 1);
  assert.equal(learned.profile.kind, "listing");
  assert.equal(learned.profile.itemSelector, "article.story-card");
  assert.equal(learned.profile.validation.sampleCount, 3);
  const result = vm.runInContext(`MMP.extractHtmlProfile("listing", "https://publisher.example/news", {id:"source"}, ${JSON.stringify(learned.profile)})`, context);
  assert.equal(result.articles.length, 3);
  assert.equal(result.articles[1].canonicalUrl, "https://publisher.example/news/2");
  assert.equal(result.articles[1].title, "Publication 2");
  assert.equal(result.articles[1].dateIsFallback, false);
  assert.equal(result.articles[1].summary, "Résumé cohérent pour la publication numéro 2.");
});

test("classless cards can be learned through their repeated parent structure", () => {
  const learned = vm.runInContext('MMP.learnHtmlProfile("classless-listing", "https://publisher.example/news")', context);
  assert.equal(learned.diagnostics.profileLearned, true);
  assert.equal(learned.profile.itemSelector, "section.news-list > div");
  const result = vm.runInContext(`MMP.extractHtmlProfile("classless-listing", "https://publisher.example/news", {id:"source"}, ${JSON.stringify(learned.profile)})`, context);
  assert.equal(result.articles.length, 3);
});

test("repeated image archive cards are recognized without date or excerpt fields", () => {
  const learned = vm.runInContext('MMP.learnHtmlProfile("image-archive", "https://publisher.example/archive")', context);
  assert.equal(learned.diagnostics.profileLearned, true);
  assert.equal(learned.profile.kind, "listing");
  const result = vm.runInContext(`MMP.extractHtmlProfile("image-archive", "https://publisher.example/archive", {id:"source"}, ${JSON.stringify(learned.profile)})`, context);
  assert.equal(result.articles.length, 3);
  assert.equal(result.articles[0].title, "Publication d’archive numéro 1");
  assert.equal(result.articles[0].image, "https://publisher.example/images/archive-1.jpg");
});

test("navigation, location and pagination links are excluded while a date-less article remains", () => {
  const result = vm.runInContext('MMP.parseHtmlArticles("navigation-and-editorial", "https://publisher.example/news", {id:"source"})', context);
  assert.deepEqual(Array.from(result, article => article.title), ["Un véritable article sans date"]);
  assert.equal(result[0].dateIsFallback, true);
});

test("Metacritic style game cards remain eligible HTML candidates", () => {
  const result = vm.runInContext('MMP.parseHtmlArticles("metacritic-games", "https://www.metacritic.com/browse/games/", {id:"source"})', context);
  assert.equal(result.length, 3);
  assert.deepEqual(Array.from(result, article => article.title), ["Game Alpha", "Game Beta", "Game Gamma"]);
});

test("a learned listing profile is invalidated when only one block remains", () => {
  const learned = vm.runInContext('MMP.learnHtmlProfile("listing", "https://publisher.example/news")', context);
  const result = vm.runInContext(`MMP.extractHtmlProfile("one-listing-item", "https://publisher.example/news", {id:"source"}, ${JSON.stringify(learned.profile)})`, context);
  assert.equal(result.articles.length, 0);
  assert.match(result.diagnostics.reason, /au moins 2 blocs cohérents/);
});

test("a saved profile falls back when it omits valid reference publications", async () => {
  const reference = Array.from({ length: 43 }, (_, index) => ({ ...fetchSourceHarness().article, canonicalUrl: `https://publisher.example/story-${index + 1}`, title: `Publication valide numéro ${index + 1}` }));
  const profileArticles = reference.slice(0, 4);
  const app = fetchSourceHarness({
    profileResult: { articles: profileArticles, diagnostics: { reason: "Profil utilisable." } },
    legacyArticles: reference
  });
  const result = await app.fetchSource({ id: "source", method: "html", pageUrl: "https://publisher.example/news", pageHtml: "listing", extractionProfile: app.profile });
  assert.equal(result.articles.length, 43);
  assert.equal(result.extractionProfile.status, "stale");
  assert.equal(result.extractionDiagnostics.omittedReferenceCount, 39);
});

test("a structured publication matching the page URL takes precedence over related links", async () => {
  const article = { ...fetchSourceHarness().article, canonicalUrl: "https://publisher.example/story", author: "Camille Martin" };
  const app = fetchSourceHarness({
    singlePublication: { article, diagnostics: { singlePublication: true, structured: true, refreshable: false, fields: { title: true, author: true }, reason: "ReportageNewsArticle reconnu." } },
    legacyArticles: Array.from({ length: 12 }, (_, index) => ({ ...article, canonicalUrl: `https://publisher.example/related-${index + 1}` }))
  });
  const result = await app.fetchSource({ id: "source", method: "html", pageUrl: article.canonicalUrl, pageHtml: "single-publication" });
  assert.equal(result.articles.length, 1);
  assert.equal(result.articles[0].canonicalUrl, article.canonicalUrl);
  assert.equal(result.extractionProfile.kind, "publication");
  assert.equal(app.calls.legacy, 0);
});

test("per-publication Schema.org metadata enriches an extracted HTML profile", () => {
  const learned = vm.runInContext('MMP.learnHtmlProfile("listing-with-schema", "https://publisher.example/news")', context);
  assert.equal(learned.diagnostics.profileLearned, true);
  assert.equal(learned.profile.fields.author, true);
  assert.equal(learned.profile.fields.categories, true);
  assert.equal(learned.profile.fields.keywords, true);
  assert.equal(learned.profile.fields.video, true);
  const result = vm.runInContext(`MMP.extractHtmlProfile("listing-with-schema", "https://publisher.example/news", {id:"source"}, ${JSON.stringify(learned.profile)})`, context);
  assert.equal(result.articles[0].author, "Auteur 1");
  assert.deepEqual(Array.from(result.articles[0].categories), ["Actualités"]);
  assert.deepEqual(Array.from(result.articles[0].keywords), ["locale", "reportage"]);
  assert.equal(result.articles[0].video, "https://publisher.example/video/1.mp4");
  assert.equal(result.articles[0].datePrecision, "day");
});

test("structured metadata can extract one publication without claiming a refreshable listing", () => {
  const result = vm.runInContext('MMP.extractHtmlPublication("single-publication", "https://publisher.example/story", {id:"source"})', context);
  assert.equal(result.article.canonicalUrl, "https://publisher.example/story");
  assert.equal(result.article.author, "Camille Martin");
  assert.deepEqual(Array.from(result.article.categories), ["Économie"]);
  assert.deepEqual(Array.from(result.article.keywords), ["industrie", "énergie"]);
  assert.equal(result.article.dateIsFallback, false);
  assert.equal(result.diagnostics.refreshable, false);
});

test("a time datetime value on an isolated HTML article supplies its publication date", () => {
  const result = vm.runInContext('MMP.extractHtmlPublication("single-publication-time-only", "https://publisher.example/time-story", {id:"source"})', context);
  assert.equal(result.article.publishedAt, Date.parse("2026-11-20T09:15:00Z"));
  assert.equal(result.article.dateIsFallback, false);
});

test("a visible timestamp retains its explicit timezone offset without a publisher rule", () => {
  const result = vm.runInContext('MMP.extractHtmlPublication("single-publication-visible-zoned-date", "https://publisher.example/zoned-story", {id:"source"})', context);
  assert.equal(result.article.publishedAt, Date.parse("2026-10-27T10:30:00+08:00"));
  assert.equal(result.article.dateIsFallback, false);
});

test("a visible Xinhua timestamp overrides date-only metadata and uses Beijing time", () => {
  const result = vm.runInContext('MMP.extractHtmlPublication("xinhua-publication-visible-time", "https://french.news.cn/20261123/example/c.html", {id:"source"})', context);
  assert.equal(result.article.publishedAt, Date.parse("2026-11-23T02:05:00+08:00"));
  assert.equal(result.article.datePrecision, "instant");
  assert.equal(result.article.dateIsFallback, false);
});

test("a localized date in a small element adjacent to the headline is a publication date", () => {
  const result = vm.runInContext('MMP.extractHtmlPublication("single-publication-headline-small-date", "https://publisher.example/small-date", {id:"source"})', context);
  assert.equal(result.article.publishedAt, Date.UTC(2026, 10, 13));
  assert.equal(result.article.dateIsFallback, false);
});

test("a date only in the article body is not mistaken for its publication date", () => {
  const result = vm.runInContext('MMP.extractHtmlPublication("single-publication-body-event-date-only", "https://publisher.example/event-date-only", {id:"source"})', context);
  assert.equal(result.article.dateIsFallback, true);
  assert.equal(result.article.datePrecision, "unknown");
});

test("dateCreated alone is not treated as the publication date", () => {
  const result = vm.runInContext('MMP.extractHtmlPublication("single-publication-date-created-only", "https://publisher.example/created-story", {id:"source"})', context);
  assert.equal(result.article.dateIsFallback, true);
  assert.equal(result.article.datePrecision, "unknown");
});

test("HTML refreshes reuse a persisted profile after checking reference coverage", async () => {
  const app = fetchSourceHarness();
  const result = await app.fetchSource({ id: "source", method: "html", pageUrl: "https://publisher.example/news", pageHtml: "listing", extractionProfile: app.profile });
  assert.equal(result.error, undefined);
  assert.equal(result.extractionDiagnostics.reusedProfile, true);
  assert.equal(app.calls.profile, 1);
  assert.equal(app.calls.legacy, 1);
  assert.equal(app.calls.learned, 0);
});

test("a failed profile falls back to the existing extractor and learns a replacement", async () => {
  const replacement = { ...fetchSourceHarness().profile, itemSelector: "li.story-card" };
  const first = { canonicalUrl: "https://publisher.example/story", title: "Une histoire", sourceId: "source", publishedAt: 1, dateIsFallback: false };
  const second = { ...first, canonicalUrl: "https://publisher.example/story-2" };
  const app = fetchSourceHarness({
    profileResult: call => call === 1 ? { articles: [], diagnostics: { reason: "Le sélecteur a disparu." } } : { articles: [first, second], diagnostics: { reason: "Profil de remplacement validé." } },
    legacyArticles: [first, second],
    learnedResult: { profile: replacement, diagnostics: { profileLearned: true, reason: "Nouvelle structure détectée." } }
  });
  const result = await app.fetchSource({ id: "source", method: "html", pageUrl: "https://publisher.example/news", pageHtml: "listing", extractionProfile: app.profile });
  assert.equal(result.articles.length, 2);
  assert.equal(result.extractionProfile.itemSelector, "li.story-card");
  assert.equal(result.extractionDiagnostics.profileLearned, true);
  assert.equal(app.calls.profile, 2);
  assert.equal(app.calls.legacy, 1);
  assert.equal(app.calls.learned, 1);
});

test("a structured single page is extracted without being marked as a refreshable listing", async () => {
  const single = { ...fetchSourceHarness().article, canonicalUrl: "https://publisher.example/story", author: "Camille" };
  const app = fetchSourceHarness({ singlePublication: { article: single, diagnostics: { singlePublication: true, refreshable: false, fields: { title: true, date: false }, reason: "Publication isolée." } } });
  const result = await app.fetchSource({ id: "source", method: "html", pageUrl: "https://publisher.example/story", pageHtml: "single-publication" });
  assert.equal(result.articles.length, 1);
  assert.equal(result.extractionProfile.kind, "publication");
  assert.equal(result.extractionProfile.refreshable, false);
});

test("one unstructured HTML list item is retained but marked as unproven and non-refreshable", async () => {
  const article = fetchSourceHarness().article;
  const app = fetchSourceHarness({ legacyArticles: [article] });
  const result = await app.fetchSource({ id: "source", method: "html", pageUrl: "https://publisher.example/news", pageHtml: "listing" });
  assert.equal(result.articles.length, 1);
  assert.equal(result.extractionProfile.kind, "listing-unproven");
  assert.equal(result.extractionProfile.refreshable, false);
  assert.match(result.extractionDiagnostics.reason, /ne prouve pas une structure de liste actualisable/);
});

test("one visible item does not disable a source with a proven repeatable history", async () => {
  const article = fetchSourceHarness().article;
  const app = fetchSourceHarness({ legacyArticles: [article] });
  const old = [
    { sourceId: "source", canonicalUrl: "https://publisher.example/old-1" },
    { sourceId: "source", canonicalUrl: "https://publisher.example/old-2" }
  ];
  const result = await app.fetchSource({ id: "source", method: "html", pageUrl: "https://publisher.example/news", pageHtml: "listing" }, old);
  assert.equal(result.articles.length, 1);
  assert.equal(result.extractionProfile, null);
  assert.equal(result.extractionDiagnostics.refreshable, true);
  assert.match(result.extractionDiagnostics.reason, /historique confirme/);
});

test("missing listing dates are checked on at most five article pages and a majority validates the source", async () => {
  const now = Date.now();
  const articles = Array.from({ length: 8 }, (_, index) => ({
    canonicalUrl: `https://publisher.example/story-${index + 1}`, title: `Article numéro ${index + 1}`,
    publishedAt: now, dateIsFallback: true, datePrecision: "unknown"
  }));
  const profileResult = { articles, diagnostics: { reason: "Dates absentes de la liste." } };
  const app = fetchSourceHarness({
    profileResult,
    singlePublication: (html, url) => html.startsWith("https://publisher.example/") && Number(url.match(/story-(\d+)/)?.[1]) <= 5
      ? { article: { canonicalUrl: url, publishedAt: now - 1000, dateIsFallback: false, datePrecision: "instant" } }
      : { article: null }
  });
  const result = await app.fetchSource({ id: "source", method: "html", pageUrl: "https://publisher.example/news", pageHtml: "listing", extractionProfile: app.profile });
  assert.equal(result.articles.length, 8);
  assert.equal(result.dateReliability.sampleCount, 5);
  assert.equal(result.dateReliability.reliableCount, 3);
  assert.equal(result.dateReliability.reliable, true);
  assert.equal(result.dateReliability.method, "article-pages");
  assert.equal(app.calls.articlePageFetches.length, 5);
  assert.deepEqual(Array.from(result.dateReliability.sampleDetails, detail => detail.url), Array.from(result.dateReliability.sampleUrls));
  assert.equal(result.dateReliability.sampleDetails.filter(detail => detail.result === "date extraite de la page détaillée").length, 3);
  assert.equal(result.dateReliability.sampleDetails.filter(detail => detail.status === 200 && detail.contentType === "text/html").length, 5);
  assert.equal(result.articles.filter(article => article.dateIsFallback).length, 5);
});

test("a refresh keeps dated articles when date reliability degrades and reports the loss", async () => {
  const now = Date.now();
  const articles = Array.from({ length: 5 }, (_, index) => ({
    canonicalUrl: `https://publisher.example/story-${index + 1}`, title: `Article numéro ${index + 1}`,
    publishedAt: now, dateIsFallback: true, datePrecision: "unknown"
  }));
  const app = fetchSourceHarness({
    profileResult: { articles, diagnostics: { reason: "Liste modifiée." } },
    singlePublication: (html, url) => html.startsWith("https://publisher.example/") && Number(url.match(/story-(\d+)/)?.[1]) <= 2
      ? { article: { canonicalUrl: url, publishedAt: now - 1000, dateIsFallback: false, datePrecision: "instant" } }
      : { article: null }
  });
  const result = await app.fetchSource({
    id: "source", method: "html", pageUrl: "https://publisher.example/news", pageHtml: "listing",
    extractionProfile: app.profile, dateReliabilityBaseline: { rate: 0.8 }
  });
  assert.equal(result.articles.length, 5);
  assert.equal(result.dateReliability.reliable, false);
  assert.equal(result.dateReliability.degraded, true);
  assert.match(result.extractionDiagnostics.reason, /Détection des dates dégradée/);
  assert.equal(result.articles.filter(article => !article.dateIsFallback).length, 2);
});
