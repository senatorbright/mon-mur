const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
const start = source.indexOf("function configuredLookbackMs(");
const end = source.indexOf("async function fetchText(", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);

function makeHarness(refreshMinutes = 15) {
  const history = new Map(), expired = new Set(), stored = new Map();
  const context = vm.createContext({
    Date, Map, Set, Promise, Number,
    DEFAULT_REFRESH_INTERVAL: 15,
    REFRESH_INTERVALS: [5, 10, 15, 30, 60, 1440],
    refreshInterval: async () => refreshMinutes,
    MMP: { normalizeText: value => String(value || "").toLowerCase(), matchTerm: (text, term) => String(text).toLowerCase().includes(String(term).toLowerCase()) },
    MMPDB: {
      sourceHistory: async (_id, urls, acquiredOnly = false) => new Set(urls.filter(url => history.has(url) && (!acquiredOnly || history.get(url) !== false))),
      expiredArticleUrls: async urls => new Set(urls.filter(url => expired.has(url))),
      all: async () => [...stored.values()]
    }
  });
  vm.runInContext(source.slice(start, end), context);
  return {
    history, expired, stored, context,
    select: (rows, sync, startedAt, wallCutoffs = null, diagnostics = null, acquiredOnly = false) => {
      context.testRows = rows; context.testWallCutoffs = wallCutoffs; context.testDiagnostics = diagnostics;
      return vm.runInContext(`sourceRowsToPersist("source", testRows, ${sync}, ${startedAt}, testWallCutoffs, testDiagnostics, ${acquiredOnly})`, context);
    }
  };
}

test("first collection uses the configured refresh lookback and excludes fallback dates", async () => {
  const { select } = makeHarness(15), startedAt = Date.now();
  const rows = [
    { canonicalUrl: "https://example.test/fresh", publishedAt: startedAt - 5 * 60_000, dateIsFallback: false, datePrecision: "instant" },
    { canonicalUrl: "https://example.test/too-old", publishedAt: startedAt - 16 * 60_000, dateIsFallback: false, datePrecision: "instant" },
    { canonicalUrl: "https://example.test/no-date", publishedAt: startedAt, dateIsFallback: true, datePrecision: "unknown" }
  ];
  const kept = await select(rows, 0, startedAt);
  assert.deepEqual(JSON.parse(JSON.stringify(kept)).map(row => row.canonicalUrl), ["https://example.test/fresh"]);
});

test("first-collection wall cutoffs use each wall's configured lookback", () => {
  const { context } = makeHarness();
  const startedAt = Date.now(), wall = { id: "wall", name: "Actus" }, source = { id: "source", wallIds: [wall.id] };
  const current = { refreshIntervalMinutes: 10, walls: [wall], wallSettings: { wall: { excludedKeywords: [], excludedCategories: [] } } };
  const cutoffs = vm.runInContext(`firstCollectionCutoffs(${JSON.stringify(source)}, [], ${JSON.stringify(current)}, [], ${startedAt})`, context);
  assert.equal(cutoffs.get("wall"), startedAt - 10 * 60_000);
});

test("explicit day-only dates qualify when their calendar day overlaps the freshness window", async () => {
  const { select } = makeHarness(), now = Date.now();
  const row = { canonicalUrl: "https://example.test/day-only", publishedAt: now - 60_000, dateIsFallback: false, datePrecision: "day" };
  assert.deepEqual(JSON.parse(JSON.stringify(await select([row], now - 120_000, 0))), [row]);
  const stale = { ...row, canonicalUrl: "https://example.test/stale-day", publishedAt: now - 3 * 86400000 };
  assert.deepEqual(JSON.parse(JSON.stringify(await select([stale], now - 120_000, 0))), []);
  assert.deepEqual(JSON.parse(JSON.stringify(await select([row], now - 120_000, 0, null, null, true))), [row]);
});

test("a publication at or before the last successful sync remains excluded by the current freshness rule", async () => {
  const { select } = makeHarness(), now = Date.now(), diagnostics = {};
  const row = { canonicalUrl: "https://example.test/older-than-sync", publishedAt: now - 120_000, dateIsFallback: false, datePrecision: "instant" };
  assert.deepEqual(JSON.parse(JSON.stringify(await select([row], now - 60_000, 0, null, diagnostics))), []);
  assert.equal(diagnostics.olderThanLastSync, 1);
});
