const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
const start = background.indexOf("function schemaCinema(");
const end = background.indexOf("function pageCinemaMetadata(", start);
assert.ok(start >= 0 && end > start);
const context = vm.createContext({ JSON, String, Number });
vm.runInContext(background.slice(start, end), context);
const lookupStart = background.indexOf("function cleanCinemaTitle(");
const lookupEnd = background.indexOf("function usableCinemaImage(", lookupStart);
const lookupContext = vm.createContext({
  Date, URL, String, Number, Map,
  MMP: {
    decodeHtmlEntities: value => String(value),
    normalizeText: value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  }
});
vm.runInContext(background.slice(lookupStart, lookupEnd), lookupContext);
const pageEnd = background.indexOf("async function fetchWikipediaCinema(", lookupStart);
const pageContext = vm.createContext({
  JSON, String, Number, URL, Date,
  MMP: {
    decodeHtmlEntities: value => String(value),
    cleanUrl: (value, base) => { try { return new URL(value, base).href; } catch { return ""; } },
    normalizeText: value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  },
  articleImage: () => ""
});
vm.runInContext(background.slice(lookupStart, pageEnd), pageContext);
const lookupFunctionsEnd = background.indexOf("async function enrichCinemaArticles(", lookupStart);
function wikipediaHarness(pages) {
  const calls = [];
  const context = vm.createContext({
    JSON, String, Number, URL, Date, Map, Set, encodeURIComponent, decodeURIComponent,
    MMP: {
      decodeHtmlEntities: value => String(value),
      cleanUrl: (value, base) => { try { return new URL(value, base).href; } catch { return ""; } },
      normalizeText: value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    },
    hasCinemaLookupConsent: async () => true,
    accessible: async () => true,
    fetchText: async url => {
      calls.push(url);
      if (url.includes("/w/rest.php/v1/search/page")) return { text: JSON.stringify({ pages }) };
      const title = decodeURIComponent(url.split("/").at(-1));
      return { text: JSON.stringify({ title, extract: "Résumé connu", content_urls: { desktop: { page: `https://fr.wikipedia.org/wiki/${title}` } } }) };
    }
  });
  vm.runInContext(background.slice(lookupStart, lookupFunctionsEnd), context);
  return { context, calls };
}

function metadata(type, item) {
  const script = { textContent: JSON.stringify({ "@context": "https://schema.org", "@type": type, ...item }) };
  return vm.runInContext("schemaCinema({querySelectorAll: () => [script]})", vm.createContext({ ...context, script }));
}

test("schema cinema metadata identifies a film and keeps its declared rating scale", () => {
  const result = metadata("Movie", {
    name: "Film Exemple", datePublished: "2024-01-01", genre: ["Drame"],
    aggregateRating: { ratingValue: "4.2", bestRating: "5", ratingCount: "81" }
  });
  assert.equal(result.kind, "film");
  assert.equal(result.rating, "4.2");
  assert.equal(result.ratingScale, "5");
  assert.equal(result.ratingCount, "81");
});

test("AlloCiné press and spectator scores stay separate and retain their own counts", () => {
  const items = [
    { label: "Presse", score: "4,2", count: "40 critiques" },
    { label: "Spectateurs", score: "4,4", count: "21260 notes, 1867 critiques" }
  ].map(value => ({ querySelector: selector => ({
    ".rating-title": { textContent: value.label },
    ".stareval-note": { textContent: value.score },
    ".stareval-review": { textContent: value.count }
  })[selector] || null }));
  const result = vm.runInContext("allocineRatings({querySelectorAll: () => items})", vm.createContext({ ...pageContext, items }));
  assert.deepEqual(Array.from(result, rating => [rating.kind, rating.value, rating.scale, rating.count, rating.source]), [
    ["presse", "4.2", "5", "40 critiques", "allocine"],
    ["spectateurs", "4.4", "5", "21260 notes, 1867 critiques", "allocine"]
  ]);
});

test("schema cinema metadata distinguishes a series and does not fabricate a rating", () => {
  const result = metadata("TVSeries", { name: "Série Exemple", genre: ["Policier"] });
  assert.equal(result.kind, "series");
  assert.equal(result.rating, "");
  assert.equal(result.ratingScale, "");
});

test("an article with no cinema evidence remains unrecognized", () => {
  const document = { title: "Actualités du jour", querySelectorAll: () => [], querySelector: () => null };
  const result = vm.runInContext(`pageCinemaMetadata(document, {title:"Actualités du jour",canonicalUrl:"https://publisher.example/news"})`, vm.createContext({ ...pageContext, document }));
  assert.equal(result.recognized, false);
  assert.equal(result.kind, "");
});

test("an article publication date is not treated as a film release year", () => {
  const result = vm.runInContext('cinemaYear({title:"Critique de Film Exemple",publishedAt:Date.parse("2026-11-11"),dateIsFallback:false})', lookupContext);
  assert.equal(result, 0);
});

test("catalog matching rejects ambiguous titles and selects only a unique matching year", () => {
  const candidates = [
    { path: "/film/exemple-1998", resultYear: 1998, score: 1 },
    { path: "/series/exemple-2024", resultYear: 2024, score: 1 }
  ];
  assert.equal(vm.runInContext(`selectCinemaCandidate(${JSON.stringify(candidates)}, 0)`, lookupContext), null);
  assert.equal(vm.runInContext(`selectCinemaCandidate(${JSON.stringify(candidates)}, 2024).path`, lookupContext), "/series/exemple-2024");
  assert.equal(vm.runInContext('selectCinemaCandidate([], 0)', lookupContext), null);
});

test("Wikipedia fallback returns one exact series match without inventing a rating", async () => {
  const { context } = wikipediaHarness([{ title: "Example (série télévisée, 2024)", description: "série télévisée française 2024" }]);
  const result = await vm.runInContext('fetchWikipediaCinema("Example", 2024)', context);
  assert.equal(result.source, "wikipedia");
  assert.equal(result.kind, "series");
  assert.equal(result.rating, "");
});

test("Wikipedia fallback rejects ambiguous same-name films and series", async () => {
  const { context } = wikipediaHarness([
    { title: "Example (film, 1998)", description: "film de 1998" },
    { title: "Example (série télévisée, 2024)", description: "série télévisée de 2024" }
  ]);
  const result = await vm.runInContext('fetchWikipediaCinema("Example", 0)', context);
  assert.equal(result, null);
});

test("catalog details replace a cached source-page stub and survive the next database read", async () => {
  const rows = new Map([["article-1", {
    id: "article-1", sourceId: "source-1", sourceIds: ["source-1"],
    canonicalUrl: "https://publisher.example/review", title: "Critique de Film Exemple",
    summary: "Résumé", publishedAt: 1, dateIsFallback: false,
    cinema: { title: "Film Exemple", source: "linked-page", url: "https://publisher.example/review" }
  }]]);
  const indexedDB = {
    open() {
      const request = {};
      const db = { transaction() {
        const tx = {};
        const store = {
          getAll() {
            const result = {};
            setTimeout(() => { result.result = [...rows.values()].map(row => structuredClone(row)); result.onsuccess?.(); tx.oncomplete?.(); }, 0);
            return result;
          },
          put(value) { rows.set(value.id, structuredClone(value)); }
        };
        tx.objectStore = () => store;
        return tx;
      } };
      setTimeout(() => { request.result = db; request.onsuccess?.(); }, 0);
      return request;
    }
  };
  const dbContext = vm.createContext({ indexedDB, structuredClone, Date, Set, Number });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/db.js"), "utf8"), dbContext);
  const enriched = {
    ...rows.get("article-1"), cinema: { title: "Film Exemple", source: "allocine", rating: "4.2", ratingScale: "5", ratingSource: "allocine", url: "https://www.allocine.fr/film/fichefilm_gen_cfilm=1.html" },
    cinemaCatalogCheckedAt: 1234
  };
  await vm.runInContext(`MMPDB.putMany([${JSON.stringify(enriched)}])`, dbContext);
  const saved = rows.get("article-1");
  assert.equal(saved.cinema.source, "allocine");
  assert.equal(saved.cinema.rating, "4.2");
  assert.equal(saved.cinemaCatalogCheckedAt, 1234);
});

test("refresh enrichment includes stored cinema articles even when they are no longer in the feed", async () => {
  const article = { id: "old-article", sourceId: "source-1", sourceIds: ["source-1"], cinema: { source: "linked-page" } };
  let saved = null;
  const context = vm.createContext({
    Map, Date,
    MMPDB: { putMany: async rows => { saved = rows[0]; } },
    wallCinemaEnabled: (wall, config) => config.type === "cinema",
    enrichCinemaArticles: async (rows, _cached, policy) => {
      assert.equal(policy.wall.id, "cinema-wall");
      rows[0].cinema = { source: "allocine", title: "Film Exemple" };
      return rows;
    }
  });
  const start = background.indexOf("async function enrichExistingCinemaArticles(");
  const end = background.indexOf("async function fetchCinemaDetails(", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(background.slice(start, end), context);
  context.article = article;
  context.current = {
    sources: [{ id: "source-1", wallIds: ["cinema-wall"] }],
    walls: [{ id: "cinema-wall" }], wallSettings: { "cinema-wall": { type: "cinema" } }
  };
  await vm.runInContext(`enrichExistingCinemaArticles([article], current)`, context);
  assert.equal(saved.cinema.source, "allocine");
});
