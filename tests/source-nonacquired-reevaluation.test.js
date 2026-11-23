const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
const start = source.indexOf("async function sourceRowsToPersist(");
const end = source.indexOf("function sourceHistoryMetadata(", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);

function makeHarness(acquiredByUrl = new Map(), storedArticles = [], historyEntries = new Map()) {
  const context = vm.createContext({
    Date, Map, Set, Promise, Number,
    MMP: {},
    refreshInterval: async () => 15,
    MMPDB: {
      sourceHistory: async (_sourceId, urls, acquiredOnly = false) => new Set(urls.filter(url => acquiredByUrl.has(url) && (!acquiredOnly || acquiredByUrl.get(url) !== false))),
      sourceHistoryEntries: async (_sourceId, urls) => new Map(urls.filter(url => historyEntries.has(url)).map(url => [url, historyEntries.get(url)])),
      expiredArticleUrls: async () => new Set(),
      all: async () => storedArticles
    }
  });
  vm.runInContext(source.slice(start, end), context);
  return {
    select: (row, lastSync = 0) => vm.runInContext(`sourceRowsToPersist("source", ${JSON.stringify([row])}, ${lastSync}, 0)`, context)
  };
}

test("an unacquired URL is re-evaluated when a later extraction supplies a usable date", async () => {
  const url = "https://publisher.example/story";
  const now = Date.now();
  const { select } = makeHarness(new Map([[url, false]]));
  const row = { canonicalUrl: url, publishedAt: now - 60_000, dateIsFallback: false, datePrecision: "instant" };
  assert.deepEqual(JSON.parse(JSON.stringify(await select(row, now - 120_000))), [row]);
});

test("an acquired URL remains deduplicated when it is returned again", async () => {
  const url = "https://publisher.example/story";
  const { select } = makeHarness(new Map([[url, true]]));
  const row = { canonicalUrl: url, publishedAt: Date.now() - 60_000, dateIsFallback: false, datePrecision: "instant" };
  assert.deepEqual(JSON.parse(JSON.stringify(await select(row))), []);
});

test("a corrected date is compared with the cutoff of its original non-acquired attempt", async () => {
  const url = "https://publisher.example/story", now = Date.now();
  const originalCutoff = now - 5 * 60_000, lastSuccessfulSync = now - 60_000;
  const history = new Map([[url, { acquired: false, firstSeenAt: now - 4 * 60_000, acquisitionCutoffAt: originalCutoff }]]);
  const { select } = makeHarness(new Map([[url, false]]), [], history);
  const row = { canonicalUrl: url, publishedAt: now - 2 * 60_000, dateIsFallback: false, datePrecision: "instant" };
  assert.ok(row.publishedAt <= lastSuccessfulSync, "the corrected publication time predates the newer successful sync");
  assert.deepEqual(JSON.parse(JSON.stringify(await select(row, lastSuccessfulSync))), [row]);
});

test("an article already in the article database keeps its update row instead of being called a duplicate", async () => {
  const url = "https://publisher.example/story";
  const row = { canonicalUrl: url, publishedAt: Date.now() - 60_000, dateIsFallback: false, datePrecision: "instant" };
  const { select } = makeHarness(new Map([[url, false]]), [{ canonicalUrl: url }]);
  assert.deepEqual(JSON.parse(JSON.stringify(await select(row))), [row]);
});

test("the normal refresh accepts an explicit day date overlapping the fresh interval", async () => {
  const url = "https://publisher.example/story";
  const { select } = makeHarness(new Map([[url, false]]));
  const row = { canonicalUrl: url, publishedAt: Date.now() - 60_000, dateIsFallback: false, datePrecision: "day" };
  assert.deepEqual(JSON.parse(JSON.stringify(await select(row, Date.now() - 120_000))), [row]);
});
