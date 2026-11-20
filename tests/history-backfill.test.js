const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
const start = source.indexOf("async function fillWallWithLatestArticles(");
const end = source.indexOf("async function resetCollectionBaselines(", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);

function setup() {
  const current = {
    walls: [{ id: "wall-news" }],
    autoWalls: [],
    sources: [
      { id: "source-news", enabled: true, wallIds: ["wall-news"] },
      { id: "source-disabled", enabled: false, wallIds: ["wall-news"] },
      { id: "source-other-wall", enabled: true, wallIds: ["wall-other"] }
    ]
  };
  const calls = [];
  let fillOverrides = {};
  const context = vm.createContext({
    state: async () => current,
    MMPDB: { all: async () => [{ id: "article-1", canonicalUrl: "https://example.test/article-1", publishedAt: 1_800_000_000_000 }] },
    Date,
    browser: { storage: { local: { get: async () => ({ wallFillOverrides: fillOverrides }), set: async values => { fillOverrides = values.wallFillOverrides; } } } },
    refreshAll: async (...args) => { calls.push(args); return { historyAddedCount: 1, historyFailedCount: 0, latestFillSources: [{ candidateCount: 1, canonicalUrls: ["https://example.test/article-1"] }] }; }
  });
  vm.runInContext(source.slice(start, end), context);
  return { context, calls, getFillOverrides: () => fillOverrides };
}

test("empty-wall fill requests the five latest articles from sources on that wall", async () => {
  const { context, calls, getFillOverrides } = setup();
  const result = await vm.runInContext('fillWallWithLatestArticles("wall-news")', context);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "wall-news");
  assert.equal(calls[0][1], "Remplissage du mur");
  assert.equal(calls[0][2].latestPerSource, 5);
  assert.equal(result.addedCount, 1);
  assert.equal(result.failed, false);
  assert.equal(result.articleIds.length, 1);
  assert.equal(result.articleIds[0], "article-1");
  assert.equal(getFillOverrides()["wall-news"]["article-1"], true);
});

test("wall fill rejects unknown walls", async () => {
  const { context } = setup();
  await assert.rejects(vm.runInContext('fillWallWithLatestArticles("missing")', context), /Mur introuvable/);
});
