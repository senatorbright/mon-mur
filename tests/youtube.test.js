const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const context = vm.createContext({ console, URL, Intl, Date, Map, Set, Object, String, Number, RegExp, JSON, AbortController });
vm.runInContext(fs.readFileSync(path.join(root, "js/core.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "js/youtube.js"), "utf8"), context);
const run = expression => vm.runInContext(expression, context);
const json = value => JSON.parse(JSON.stringify(value));
const fixture = { contents: [
  { videoRenderer: { videoId: "abcdefghijk", title: { runs: [{ text: "NixOS: Café et Linux" }] }, ownerText: { runs: [{ text: "Chaîne test", navigationEndpoint: { browseEndpoint: { browseId: "UC123" } } }] }, publishedTimeText: { simpleText: "il y a 2 heures" }, thumbnail: { thumbnails: [{ url: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg" }] } } },
  { videoRenderer: { videoId: "lmnopqrstuv", title: { simpleText: "Guide NixOSism" }, publishedTimeText: { simpleText: "il y a 1 jour" } } },
  { videoRenderer: { videoId: "wxyzABCDEFG", title: { simpleText: "Une vidéo sur Linux" }, descriptionSnippet: { runs: [{ text: "NixOS" }] } } }
] };
fixture.contents[0].videoRenderer.detailedMetadataSnippets = [{ snippetHoverText: { runs: [{ text: "Issu de la description de la vidéo" }] }, snippetText: { runs: [{ text: "Première ligne\n\nDeuxième ligne" }] } }];
fixture.contents[0].videoRenderer.descriptionSnippet = { runs: [{ text: "Extrait court" }] };
const html = `var ytInitialData = ${JSON.stringify(fixture)};</script>`;
const parsed = json(run(`MMPY.parseSearch(${JSON.stringify(html)}, "nixos", 10000000)`));
assert.equal(parsed.length, 1, "matches title only and respects word boundaries");
assert.equal(parsed[0].title, "NixOS: Café et Linux");
assert.equal(parsed[0].channelName, "Chaîne test");
assert.equal(parsed[0].summary, "Première ligne\n\nDeuxième ligne", "keeps YouTube description snippets and line breaks");
assert.equal(parsed[0].publishedAt, 10000000 - 2 * 3600000);
assert.equal(run(`MMPY.parseRelativeDate("il y a 1 a", 10000000)`), 10000000 - 365 * 86400000, "parses YouTube's French year abbreviation");
assert.equal(run(`MMPY.parseRelativeDate("Diffusé il y a 6 m.", 10000000)`), 10000000 - 6 * 2592000000, "parses YouTube's French month abbreviation");
assert.equal(run(`MMP.matchTerm("Café WordPress", "cafe")`), true, "accent-insensitive matching");
assert.equal(run(`MMP.matchTerm("NixOSism", "NixOS")`), false, "does not match within another word");
const peerTubeStats = { received: 0, titleRejected: 0, languageRejected: 0, invalidRejected: 0 };
context.peerTubeStats = peerTubeStats;
const peerTubeRows = { data: [
  { uuid: "fr-video", language: { id: "fr" }, name: "NixOS en français", publishedAt: "2026-10-22T10:00:00Z", url: "https://video.example/videos/watch/fr-video" },
  { uuid: "en-video", language: { id: "en" }, name: "NixOS in English", publishedAt: "2026-10-22T10:00:00Z", url: "https://video.example/videos/watch/en-video" },
  { uuid: "missing-language", name: "NixOS sans langue", publishedAt: "2026-10-22T10:00:00Z", url: "https://video.example/videos/watch/missing-language" }
] };
peerTubeRows.data[0].description = "Présentation\n\nDétails supplémentaires";
const peerTubeParsed = json(run(`MMPY.parsePeerTubeSearch(${JSON.stringify(peerTubeRows)}, "nixos", peerTubeStats)`));
assert.deepEqual(peerTubeParsed.map(video => video.id), ["fr-video"], "PeerTube results must explicitly declare French");
assert.equal(peerTubeParsed[0].summary, "Présentation\n\nDétails supplémentaires", "keeps PeerTube descriptions and paragraph breaks");
assert.equal(peerTubeStats.languageRejected, 2);
assert.deepEqual(json(run(`MMPY.keywordsFromWalls([{id:"a"},{id:"b"}], {a:{priorities:[{term:"IA",level:"high"},"NixOS"]},b:{priorities:[{term:"ia",level:"low"},"WordPress"]}})`)), ["IA", "NixOS", "WordPress"]);
const old = { id: "oldvideo123", publishedAt: 900, publishedLabel: "il y a 1 jour" }, fresh = { id: "freshvideo1", publishedAt: 1100, publishedLabel: "il y a 1 heure" };
let tracked = run(`MMPY.trackResults(null, ${JSON.stringify([old])}, "NixOS", 1000, false)`);
assert.equal(json(tracked.articles).length, 0, "first collection records a baseline without importing history");
tracked = run(`MMPY.trackResults(${JSON.stringify(json(tracked.state))}, ${JSON.stringify([old, fresh])}, "NixOS", 1200, true)`);
assert.deepEqual(json(tracked.articles).map(video => video.id), ["freshvideo1"], "old items are excluded and newly published items are retained");
const migratedState = { referenceAt: 1000, initializedAt: 1000, seen: {} };
tracked = run(`MMPY.trackResults(${JSON.stringify(migratedState)}, ${JSON.stringify([fresh])}, "NixOS", 1200, true)`);
assert.deepEqual(json(tracked.articles).map(video => video.id), ["freshvideo1"], "a fresh install imports videos newer than its shared reference date");
tracked = run(`MMPY.trackResults(${JSON.stringify(json(tracked.state))}, ${JSON.stringify([fresh])}, "NixOS", 1500, true)`);
assert.equal(json(tracked.articles).length, 0, "repeat refresh and overlapping keywords do not duplicate a video");
const lateOld = { id: "lateoldvid1", publishedAt: 800, publishedLabel: "il y a 2 jours" };
tracked = run(`MMPY.trackResults(${JSON.stringify(json(tracked.state))}, ${JSON.stringify([lateOld])}, "NixOS", 1600, true)`);
assert.equal(json(tracked.articles).length, 0, "an old video discovered late is not imported");
const unknownDate = { id: "unknownvid01", publishedAt: 0, publishedLabel: "date inconnue" };
tracked = run(`MMPY.trackResults(${JSON.stringify(json(tracked.state))}, ${JSON.stringify([unknownDate])}, "NixOS", 1700, true)`);
assert.equal(json(tracked.state.seen)[unknownDate.id], undefined, "an unparseable date remains eligible for a later refresh");
console.log("YouTube keyword wall tests passed.");
