const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
const start = source.indexOf("function sourceTimeout(");
const end = source.indexOf("function sourceHistoryMetadata(", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const context = vm.createContext({ Date, Set, FIRST_COLLECTION_LOOKBACK_MS: 30 * 86400000,
  MMPDB: {
    sourceHistory: async (_sourceId, urls) => new Set(urls.filter(url => url.endsWith("/duplicate"))),
    expiredArticleUrls: async (_urls) => new Set(["https://example.test/expired"]),
    all: async () => [{ canonicalUrl: "https://example.test/stored" }]
  }
});
vm.runInContext(source.slice(start, end), context);

test("source persistence diagnostics name each reason a returned URL was not newly stored", async () => {
  const result = await vm.runInContext(`(async () => {
    const now = Date.now(), diagnostics = {}, rejectionDecisions = {};
    const rows = [
      { canonicalUrl: "https://example.test/stored", publishedAt: now },
      { canonicalUrl: "https://example.test/expired", publishedAt: now },
      { canonicalUrl: "https://example.test/duplicate", publishedAt: now },
      { canonicalUrl: "https://example.test/old", publishedAt: now - 5 * 86400000 },
      { canonicalUrl: "https://example.test/new", publishedAt: now }
    ];
    const kept = await sourceRowsToPersist("source", rows, now - 86400000, 0, null, diagnostics, false, rejectionDecisions);
    return { now, kept: kept.map(row => row.canonicalUrl), diagnostics, rejectionDecisions };
  })()`, context);
  assert.deepEqual(Array.from(result.kept), ["https://example.test/stored", "https://example.test/new"]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.diagnostics)), {
    alreadyStored: 1, retentionTombstone: 1, deduplicated: 1,
    outsideInitialWindow: 0, olderThanLastSync: 1, eligible: 1
  });
  const refusal = result.rejectionDecisions["https://example.test/old"];
  assert.equal(refusal.rejectionReason, "olderThanLastSync");
  assert.equal(refusal.cutoffAtDecision, result.now - 86400000);
  assert.equal(refusal.publishedAt, result.now - 5 * 86400000);
  assert.ok(refusal.evaluatedAt >= refusal.publishedAt);
  assert.equal(result.rejectionDecisions["https://example.test/duplicate"].rejectionReason, "deduplicated");
  assert.equal(result.rejectionDecisions["https://example.test/expired"].rejectionReason, "retentionTombstone");
});
