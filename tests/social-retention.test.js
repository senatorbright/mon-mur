const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function snapshotHarness({ articles = [], snapshots = [], articleStates = {} } = {}) {
  const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const functions = source.slice(source.indexOf("async function recordAutomaticHistory("), source.indexOf("async function fetchText("));
  const storage = { automaticSocialArticleSnapshots: snapshots, articleStates };
  const savedHistory = [];
  const context = vm.createContext({
    AUTOMATIC_SOCIAL_SNAPSHOT_KEY: "automaticSocialArticleSnapshots",
    AUTOMATIC_SOCIAL_SOURCE_IDS: new Set(["bluesky-keyword-search", "linkedin-keyword-search"]),
    BLUESKY_SOURCE_ID: "bluesky-keyword-search", LINKEDIN_SOURCE_ID: "linkedin-keyword-search",
    MMPDB: {
      all: async () => articles,
      putMany: async rows => { articles.push(...rows); },
      rememberSourceArticles: async (sourceId, rows, metadata) => savedHistory.push({ sourceId, rows, metadata })
    },
    browser: { storage: { local: {
      get: async defaults => ({ ...defaults, ...storage }),
      set: async value => Object.assign(storage, value)
    } } },
    automaticHistoryMetadata: (sourceId, wallIds, mode) => ({ sourceId, wallIds, mode }),
    console
  });
  vm.runInContext(functions, context);
  return { context, storage, articles, savedHistory };
}

test("unread social posts are mirrored and restored to IndexedDB after their rows disappear", async () => {
  const story = { id: "post-1", sourceId: "bluesky-keyword-search", sourceIds: ["bluesky-keyword-search"], canonicalUrl: "https://bsky.app/post/1", title: "NixOS", publishedAt: 100 };
  const { context, storage, articles, savedHistory } = snapshotHarness({ articles: [story] });
  await vm.runInContext("saveAutomaticSocialSnapshots()", context);
  assert.equal(storage.automaticSocialArticleSnapshots.length, 1);
  articles.length = 0;
  const restored = await vm.runInContext("restoreAutomaticSocialSnapshots()", context);
  assert.equal(restored, 1);
  assert.equal(articles[0].id, story.id);
  assert.equal(savedHistory[0].sourceId, "bluesky-keyword-search");
});

test("read and later social posts are removed from the recovery snapshot", async () => {
  const story = { id: "post-1", sourceId: "linkedin-keyword-search", sourceIds: ["linkedin-keyword-search"], canonicalUrl: "https://example.test/post/1", title: "Actu", publishedAt: 100 };
  const { context, storage } = snapshotHarness({ snapshots: [story], articleStates: { "post-1": { status: "read" } } });
  await vm.runInContext("saveAutomaticSocialSnapshots()", context);
  assert.equal(storage.automaticSocialArticleSnapshots.length, 0);
});
