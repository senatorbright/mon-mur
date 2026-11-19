const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("Bluesky collects priorities from all walls when the active wall has none", () => {
  const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const functions = source.slice(source.indexOf("function blueskyTopics("), source.indexOf("function blueskyExternalLink("));
  const context = vm.createContext({
    MMP: { normalizeText: value => String(value).toLowerCase() }
  });
  vm.runInContext(functions, context);
  const topics = vm.runInContext(`blueskyTopics({
    settings: { priorities: [] },
    wallSettings: { "wall-with-priorities": { priorities: [{ term: "IA", level: "high" }] } }
  })`, context);
  assert.equal(topics.length, 1);
  assert.equal(topics[0].term, "IA");
});

test("Bluesky stores an eligible post with its external-card title", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const functions = source.slice(source.indexOf("function blueskyTopics("), source.indexOf("function iaField("));
  const saved = [];
  const data = { blueskySearchState: { lastSuccessfulByTopic: { nixos: Date.parse("2026-10-27T00:00:00Z") } } };
  const post = {
    uri: "at://did:plc:abc/app.bsky.feed.post/post1",
    record: { text: "NixOS en français", langs: ["fr"], createdAt: "2026-10-28T10:00:00Z" },
    author: { handle: "auteur.example", displayName: "Auteur" },
    embed: { external: { uri: "https://example.test/article", title: "Article lié" } }
  };
  const posts = [post,
    { uri: "at://did:plc:untagged/app.bsky.feed.post/p7", record: { text: "NixOS est un sujet français sans langue déclarée", createdAt: new Date("2026-10-28T10:00:00Z").toISOString() }, author: { handle: "sans-langue.example" } },
    { uri: "at://did:plc:language/app.bsky.feed.post/p2", record: { text: "NixOS in English", langs: ["en"], createdAt: "2026-10-28T10:00:00Z" } },
    { uri: "at://did:plc:subject/app.bsky.feed.post/p3", record: { text: "Autre sujet en français", langs: ["fr"], createdAt: "2026-10-28T10:00:00Z" } },
    { uri: "not-an-at-uri", record: { text: "NixOS en français", langs: ["fr"], createdAt: "2026-10-28T10:00:00Z" } },
    { uri: "at://did:plc:reply/app.bsky.feed.post/p4", record: { text: "NixOS, réponse en français", langs: ["fr"], createdAt: "2026-10-28T10:00:00Z", reply: { root: { uri: "at://did:plc:root/app.bsky.feed.post/root1" }, parent: { uri: "at://did:plc:root/app.bsky.feed.post/root1" } } } },
    { uri: "at://did:plc:adult/app.bsky.feed.post/p5", record: { text: "NixOS", langs: ["fr"], createdAt: "2026-10-28T10:00:00Z" }, labels: [{ val: "porn" }] }
  ];
  const context = vm.createContext({
    hasSearchTermsConsent: async () => true,
    AbortController,
    AbortSignal,
    BLUESKY_SOURCE_ID: "bluesky-keyword-search",
    automaticHistoryMetadata: () => ({}),
    recordAutomaticHistory: async () => {},
    saveAutomaticSocialSnapshots: async () => {},
    Date,
    Map,
    Set,
    URL,
    encodeURIComponent,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ posts }) }),
    browser: { storage: { local: { get: async () => data, set: async value => Object.assign(data, value) } } },
    state: async () => ({
      automaticWalls: { bluesky: true }, socialProviders: { bluesky: true }, blueskyRequireImage: false, blueskyFrenchOnly: true,
      walls: [{ id: "wall-a" }], wallSettings: { "wall-a": { priorities: [{ term: "NixOS", level: "high" }] } }
    }),
    MMP: {
      normalizeText: value => String(value).toLowerCase(),
      matchTerm: (text, term) => text.toLowerCase().includes(term.toLowerCase()),
      stableId: value => value
    },
    MMPDB: { all: async () => [], putMany: async rows => saved.push(...rows) }
  });
  vm.runInContext(functions, context);
  const result = await vm.runInContext("refreshBluesky()", context);
  assert.equal(result.topicCount, 1);
  assert.equal(result.successCount, 1);
  assert.equal(result.addedCount, 2);
  assert.equal(result.diagnostics.returned, 7);
  assert.equal(result.diagnostics.stored, 2);
  assert.equal(result.diagnostics.languageUnknownAccepted, 1);
  assert.equal(result.diagnostics.languageRejected, 1);
  assert.equal(result.diagnostics.subjectRejected, 1);
  assert.equal(result.diagnostics.invalidUriRejected, 1);
  assert.equal(result.diagnostics.replyRejected, 1);
  assert.equal(result.diagnostics.adultRejected, 1);
  assert.equal(result.diagnostics.attempted, true);
  assert.equal(result.diagnostics.automaticEnabled, true);
  assert.equal(result.diagnostics.providerEnabled, true);
  assert.equal(result.diagnostics.imageRequired, false);
  assert.equal(result.diagnostics.topics[0].requests[0].status, 200);
  assert.equal(result.addedCount, 2);
  assert.equal(saved.length, 2);
  assert.equal(saved[0].blueskyLinkTitle, "Article lié");
  assert.equal(saved[0].canonicalUrl, "https://bsky.app/profile/auteur.example/post/post1");
});

test("Bluesky performs no topic request without search consent", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const functions = source.slice(source.indexOf("function blueskyTopics("), source.indexOf("function iaField("));
  let requests = 0;
  const context = vm.createContext({
    hasSearchTermsConsent: async () => false,
    browser: { storage: { local: { set: async () => {} } } },
    fetch: async () => { requests++; }
  });
  vm.runInContext(functions, context);
  const result = await vm.runInContext("refreshBluesky()", context);
  assert.equal(result.disabledReason, "search-consent-missing");
  assert.equal(requests, 0);
});

test("Bluesky retries its public search endpoint with the documented case-sensitive method name", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const functions = source.slice(source.indexOf("function blueskyTopics("), source.indexOf("function iaField("));
  const urls = [], saved = [];
  const data = { blueskySearchState: { lastSuccessfulByTopic: { nixos: Date.now() - 60000 } } };
  const post = { uri: "at://did:plc:abc/app.bsky.feed.post/post1", record: { text: "NixOS en français", langs: ["fr"], createdAt: new Date().toISOString() }, author: { handle: "auteur.example" } };
  const context = vm.createContext({
    hasSearchTermsConsent: async () => true, AbortController, AbortSignal, BLUESKY_SOURCE_ID: "bluesky-keyword-search", automaticHistoryMetadata: () => ({}), recordAutomaticHistory: async () => {}, saveAutomaticSocialSnapshots: async () => {}, Date, Map, Set, URL, encodeURIComponent,
    fetch: async url => { urls.push(String(url)); return urls.length === 1 ? { ok: false, status: 403 } : { ok: true, status: 200, json: async () => ({ posts: [post] }) }; },
    browser: { storage: { local: { get: async () => data, set: async value => Object.assign(data, value) } } },
    state: async () => ({ automaticWalls: { bluesky: true }, socialProviders: { bluesky: true }, blueskyRequireImage: false, settings: { priorities: [{ term: "NixOS", level: "high" }] } }),
    MMP: { normalizeText: value => String(value).toLowerCase(), matchTerm: (text, term) => text.toLowerCase().includes(term.toLowerCase()), stableId: value => value },
    MMPDB: { all: async () => [], putMany: async rows => saved.push(...rows) }
  });
  vm.runInContext(functions, context);
  const result = await vm.runInContext("refreshBluesky()", context);
  assert.equal(result.successCount, 1);
  assert.equal(result.addedCount, 1);
  assert.match(urls[0], /^https:\/\/public\.api\.bsky\.app\/xrpc\/app\.bsky\.feed\.searchPosts/);
  assert.match(urls[1], /^https:\/\/api\.bsky\.app\/xrpc\/app\.bsky\.feed\.searchPosts/);
  assert.equal(saved.length, 1);
});

test("Bluesky refreshes ignore legacy history cursors and reject posts at or before the last refresh", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const functions = source.slice(source.indexOf("function blueskyTopics("), source.indexOf("function iaField("));
  const previous = Date.now() - 60 * 60 * 1000, urls = [], saved = [];
  const data = {
    blueskySearchState: { lastSuccessfulByTopic: {}, cursorByTopic: { nixos: "legacy-history-cursor" } },
    blueskyCollectionDiagnostics: { at: previous, successCount: 1 }
  };
  const post = (rkey, createdAt) => ({
    uri: `at://did:plc:${rkey}/app.bsky.feed.post/${rkey}`,
    record: { text: "NixOS en français", langs: ["fr"], createdAt },
    author: { handle: `${rkey}.example` }
  });
  const context = vm.createContext({
    hasSearchTermsConsent: async () => true, AbortController, AbortSignal, Date, Map, Set, URL, encodeURIComponent,
    BLUESKY_SOURCE_ID: "bluesky-keyword-search", automaticHistoryMetadata: () => ({}), recordAutomaticHistory: async () => {}, saveAutomaticSocialSnapshots: async () => {},
    fetch: async url => {
      urls.push(String(url));
      return { ok: true, status: 200, json: async () => ({ posts: [post("old", new Date(previous - 1000).toISOString()), post("new", new Date(previous + 1000).toISOString())] }) };
    },
    browser: { storage: { local: { get: async () => data, set: async value => Object.assign(data, value) } } },
    state: async () => ({ automaticWalls: { bluesky: true }, socialProviders: { bluesky: true }, blueskyRequireImage: false, settings: { priorities: [{ term: "NixOS", level: "high" }] } }),
    MMP: { normalizeText: value => String(value).toLowerCase(), matchTerm: (text, term) => text.toLowerCase().includes(term.toLowerCase()), stableId: value => value },
    MMPDB: { all: async () => [], putMany: async rows => saved.push(...rows) }
  });
  vm.runInContext(functions, context);
  const result = await vm.runInContext("refreshBluesky()", context);
  const request = new URL(urls[0]);
  assert.equal(request.searchParams.get("cursor"), null);
  assert.equal(request.searchParams.get("since"), new Date(previous - 5 * 60 * 1000).toISOString());
  assert.equal(result.diagnostics.olderDateRejected, 1);
  assert.equal(result.addedCount, 1);
  assert.equal(saved.length, 1);
  assert.ok(data.blueskySearchState.lastSuccessfulByTopic.nixos > previous);
  assert.equal(data.blueskySearchState.cursorByTopic.nixos, undefined);
});
