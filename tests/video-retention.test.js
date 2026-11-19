const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ indexedDB: {}, IDBKeyRange: {}, Date, Set, Number });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/db.js"), "utf8"), context);
const retainByAge = (article, threshold, sources) => vm.runInContext(`MMPDB.retainByAge(${JSON.stringify(article)}, ${threshold}, ${JSON.stringify(sources)})`, context);
const retainPinned = (article, ids) => vm.runInContext(`MMPDB.retainByAge(${JSON.stringify(article)}, ${cutoff}, [], ${JSON.stringify(ids)})`, context);
const cutoff = 1_000;

test("old auto videos survive cleanup while classical walls still filter them by their own retention", () => {
  const video = { sourceId: "youtube-keyword-search", sourceIds: ["youtube-keyword-search"], publishedAt: 500 };
  assert.equal(retainByAge(video, cutoff, ["youtube-keyword-search"]), true);
  assert.equal(retainByAge(video, cutoff, []), false, "disabled auto providers do not protect their old videos");
  const shared = { ...video, sourceIds: ["wall-source", "youtube-keyword-search"] };
  assert.equal(retainByAge(shared, cutoff, ["youtube-keyword-search"]), true);
  assert.equal(Number(shared.publishedAt) >= cutoff, false, "the classic wall's existing age filter still hides the old item");
});

test("classical-only articles still expire and recent articles remain", () => {
  assert.equal(retainByAge({ sourceId: "wall-source", publishedAt: 500 }, cutoff, ["youtube-keyword-search"]), false);
  assert.equal(retainByAge({ sourceId: "wall-source", publishedAt: 1_001 }, cutoff, ["youtube-keyword-search"]), true);
});

test("old PDF auto documents survive cleanup only while Internet Archive is enabled", () => {
  const pdf = { sourceId: "internet-archive:documents", sourceIds: ["internet-archive:documents"], documentKind: "pdf", publishedAt: 500 };
  assert.equal(retainByAge(pdf, cutoff, ["internet-archive:documents"]), true);
  assert.equal(retainByAge(pdf, cutoff, []), false);
  const shared = { ...pdf, sourceIds: ["wall-source", "internet-archive:documents"] };
  assert.equal(retainByAge(shared, cutoff, ["internet-archive:documents"]), true);
  assert.equal(Number(shared.publishedAt) >= cutoff, false, "classic walls still apply their existing age cutoff");
});

test("old unread automatic-wall items stay stored until marked read across every provider", () => {
  for (const sourceId of ["youtube-keyword-search", "peertube-keyword-search", "crowdbunker-keyword-search", "rumble-keyword-search", "bluesky-keyword-search", "linkedin-keyword-search", "internet-archive:documents"]) {
    const unread = { id: sourceId, sourceId, sourceIds: [sourceId], publishedAt: 500 };
    assert.equal(retainPinned(unread, [sourceId]), true, `${sourceId} stays in the database while unread`);
    assert.equal(retainPinned(unread, []), false, `${sourceId} can expire after it is marked read`);
  }
});

test("a video stays stored through a second refresh and an expired known video is not reimported", () => {
  const videoContext = vm.createContext({ console, URL, Intl, Date, Map, Set, Object, String, Number, RegExp, JSON });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8"), videoContext);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/youtube.js"), "utf8"), videoContext);
  const video = { id: "video1234567", title: "NixOS", publishedAt: 1_100, publishedLabel: "il y a 1 heure" };
  const state = { referenceAt: 1_000, initializedAt: 1_000, seen: {} };
  const track = (current, now) => JSON.parse(JSON.stringify(vm.runInContext(`MMPY.trackResults(${JSON.stringify(current)}, ${JSON.stringify([video])}, "NixOS", ${now}, true)`, videoContext)));
  const first = track(state, 1_200);
  const stored = [{ ...first.articles[0], sourceId: "youtube-keyword-search", sourceIds: ["youtube-keyword-search"] }];
  assert.equal(stored.length, 1, "the first refresh imports the newly published video");
  const expiryCutoff = 1_200;
  assert.equal(retainByAge(stored[0], expiryCutoff, ["youtube-keyword-search"]), true);

  const second = track(first.state, 1_500);
  assert.equal(second.articles.length, 0, "the second refresh deduplicates the already known video");
  assert.equal(stored.length, 1, "the stored video remains available after the second refresh");

  assert.equal(retainByAge(stored[0], expiryCutoff, []), false, "when its provider is disabled, age cleanup may expire it");
  const afterExpiry = track(second.state, 1_800);
  assert.equal(afterExpiry.articles.length, 0, "the existing seen history prevents repeated reimport after expiry");
});
