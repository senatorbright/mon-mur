const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
const start = source.indexOf("const FIRST_COLLECTION_LOOKBACK_MS");
const end = source.indexOf("async function fetchText", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);

function makeHarness() {
  const history = new Set();
  const stored = new Set();
  const context = vm.createContext({
    Date, Map, Set, Promise, Number,
    MMP: { normalizeText: value => String(value || "").toLowerCase(), matchTerm: (text, term) => String(text).toLowerCase().includes(String(term).toLowerCase()) },
    MMPDB: {
      sourceHistory: async (_id, urls) => new Set(urls.filter(url => history.has(url))),
      expiredArticleUrls: async () => new Set(),
      all: async () => [...stored].map(canonicalUrl => ({ canonicalUrl }))
    }
  });
  vm.runInContext(source.slice(start, end), context);
  return {
    select: (rows, sync, startedAt) => vm.runInContext(`sourceRowsToPersist("source", ${JSON.stringify(rows)}, ${sync}, ${startedAt})`, context),
    history, context
  };
}

test("first source collection accepts reliable publications from the last ten hours only", async () => {
  const { select } = makeHarness();
  const startedAt = 10_000_000_000_000;
  const rows = [
    { canonicalUrl: "https://example.test/one-hour", publishedAt: startedAt - 60 * 60 * 1000, dateIsFallback: false },
    { canonicalUrl: "https://example.test/nine-hours", publishedAt: startedAt - 9 * 60 * 60 * 1000, dateIsFallback: false },
    { canonicalUrl: "https://example.test/eleven-hours", publishedAt: startedAt - 11 * 60 * 60 * 1000, dateIsFallback: false },
    { canonicalUrl: "https://example.test/no-date", publishedAt: startedAt, dateIsFallback: true }
  ];
  const kept = await select(rows, 0, startedAt);
  assert.deepEqual(JSON.parse(JSON.stringify(kept)).map(row => row.canonicalUrl), ["https://example.test/one-hour", "https://example.test/nine-hours"]);
});

test("a first-collection exclusion stays seen and cannot reappear on the next sync", async () => {
  const { select, history } = makeHarness();
  const startedAt = 10_000_000_000_000;
  const old = { canonicalUrl: "https://example.test/old", publishedAt: startedAt - 11 * 60 * 60 * 1000, dateIsFallback: false };
  assert.equal((await select([old], 0, startedAt)).length, 0);
  history.add(old.canonicalUrl); // Mirrors rememberSourceArticles(rows) after a successful collection.
  assert.equal((await select([old], startedAt + 1000, 0)).length, 0);
});

test("first collection widens the cached candidate window in two-hour steps and respects wall filters", () => {
  const { context } = makeHarness();
  const startedAt = 10_000_000_000_000;
  const wall = { id: "wall", name: "Actus" };
  const source = { id: "source", wallIds: [wall.id] };
  const candidate = { sourceId: "source", sourceIds: ["source"], title: "Publication", publishedAt: startedAt - 13 * 3600000, dateIsFallback: false };
  const current = { walls: [wall], wallSettings: { wall: { retentionDays: 3, excludedKeywords: [], excludedCategories: [] } } };
  const cutoffs = vm.runInContext(`firstCollectionCutoffs(${JSON.stringify(source)}, ${JSON.stringify([candidate])}, ${JSON.stringify(current)}, [], ${startedAt})`, context);
  assert.equal(cutoffs.get("wall"), startedAt - 14 * 3600000);
  current.wallSettings.wall.excludedKeywords = ["publication"];
  const excluded = vm.runInContext(`firstCollectionCutoffs(${JSON.stringify(source)}, ${JSON.stringify([candidate])}, ${JSON.stringify(current)}, [], ${startedAt})`, context);
  assert.equal(excluded.get("wall"), startedAt - 72 * 3600000);
});

test("first collection keeps widening when its recent candidates are already seen or expired", () => {
  const { context } = makeHarness();
  const startedAt = 10_000_000_000_000;
  const wall = { id: "wall", name: "Actus" };
  const source = { id: "source", wallIds: [wall.id] };
  const recent = { canonicalUrl: "https://example.test/recent", sourceId: "source", title: "Déjà vu", publishedAt: startedAt - 11 * 3600000, dateIsFallback: false };
  const older = { canonicalUrl: "https://example.test/older", sourceId: "source", title: "À récupérer", publishedAt: startedAt - 13 * 3600000, dateIsFallback: false };
  const current = { walls: [wall], wallSettings: { wall: { retentionDays: 3, excludedKeywords: [], excludedCategories: [] } } };
  context.unavailableUrls = new Set([recent.canonicalUrl]);
  const cutoffs = vm.runInContext(`firstCollectionCutoffs(${JSON.stringify(source)}, ${JSON.stringify([recent, older])}, ${JSON.stringify(current)}, [], ${startedAt}, unavailableUrls)`, context);
  assert.equal(cutoffs.get("wall"), startedAt - 14 * 3600000);
});

test("the widened first-collection cutoff is also used when a source is rediscovered", async () => {
  const { context, history, select } = makeHarness();
  const startedAt = 10_000_000_000_000;
  const wall = { id: "wall", name: "Actus" };
  const source = { id: "source", wallIds: [wall.id] };
  const alreadySeen = { canonicalUrl: "https://example.test/seen", sourceId: "source", title: "Déjà vu", publishedAt: startedAt - 11 * 3600000, dateIsFallback: false };
  const recoverable = { canonicalUrl: "https://example.test/recoverable", sourceId: "source", title: "À récupérer", publishedAt: startedAt - 13 * 3600000, dateIsFallback: false };
  const current = { walls: [wall], wallSettings: { wall: { retentionDays: 3, excludedKeywords: [], excludedCategories: [] } } };
  history.add(alreadySeen.canonicalUrl);
  context.cutoffs = await vm.runInContext(`firstCollectionCutoffsFor(${JSON.stringify(source)}, ${JSON.stringify([alreadySeen, recoverable])}, ${JSON.stringify(current)}, [], ${startedAt})`, context);
  const kept = await vm.runInContext(`sourceRowsToPersist("source", ${JSON.stringify([alreadySeen, recoverable])}, 0, ${startedAt}, cutoffs)`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(kept)).map(row => row.canonicalUrl), [recoverable.canonicalUrl]);
});
