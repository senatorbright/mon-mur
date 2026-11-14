"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
const start = source.indexOf("// Observe only tabs explicitly opened for a LinkedIn RSS card");
const end = source.indexOf("const VIDEO_REFERENCE_ISO", start);
const lifecycle = source.slice(start, end);
const googleUrl = "https://news.google.com/rss/articles/example?oc=5";
const postUrl = "https://www.linkedin.com/posts/auteur_activity-1234567890123456789-test";

function harness({ permission = true, article = {} } = {}) {
  const stored = new Map([["article-1", { id: "article-1", sourceId: "linkedin-keyword-search", canonicalUrl: googleUrl, ...article }]]);
  for (const id of ["article-2", "article-3"]) stored.set(id, { id, sourceId: "linkedin-keyword-search", canonicalUrl: googleUrl });
  const created = [], hidden = [], removed = [], updates = new Set(), removedListeners = new Set(), timers = new Map(), writes = [];
  let timerId = 0;
  const context = vm.createContext({
    URL,
    LINKEDIN_SOURCE_ID: "linkedin-keyword-search",
    MAX_LINKEDIN_RESOLUTIONS: 2,
    MMPDB: {
      get: async id => stored.get(id),
      putMany: async rows => { for (const row of rows) { stored.set(row.id, row); writes.push(row); } }
    },
    browser: {
      tabs: {
        onUpdated: { addListener: fn => updates.add(fn) },
        onRemoved: { addListener: fn => removedListeners.add(fn), removeListener: fn => removedListeners.delete(fn) },
        create: async options => { created.push(options); return { id: 22 + created.length, url: options.url }; },
        hide: async id => { hidden.push(id); return [id]; },
        remove: async id => { removed.push(id); },
      },
      permissions: { contains: async () => permission, onRemoved: { addListener() {} } },
      runtime: { sendMessage: async () => {} }
    },
    setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval() {}
  });
  vm.runInContext(lifecycle, context);
  return { context, stored, created, hidden, removed, updates, removedListeners, timers, writes };
}

async function settle() { await new Promise(resolve => setImmediate(resolve)); }

test("automatic resolution associates a LinkedIn permalink and closes its hidden tab", async () => {
  const h = harness();
  const resultPromise = h.context.resolveLinkedInOnExpand("article-1");
  await settle();
  assert.equal(JSON.stringify(h.created), JSON.stringify([{ url: googleUrl, active: false }]));
  assert.deepEqual(h.hidden, [23]);
  for (const listener of h.updates) listener(23, { url: postUrl }, { id: 23, url: postUrl });
  const result = await resultPromise;
  assert.equal(result.article.linkedinOriginalUrl, postUrl);
  assert.equal(result.article.linkedinActivityUrn, "urn:li:activity:1234567890123456789");
  assert.deepEqual(h.removed, [23]);
  assert.equal(h.writes.length, 1);
});

test("a completed Google News page is allowed to redirect before resolving", async () => {
  const h = harness();
  const resultPromise = h.context.resolveLinkedInOnExpand("article-1");
  await settle();
  const googleArticleUrl = "https://news.google.com/rss/articles/example?oc=5";
  for (const listener of h.updates) listener(23, { status: "complete" }, { id: 23, url: googleArticleUrl });
  assert.equal(h.removed.length, 0);
  assert.equal(vm.runInContext("pendingLinkedInTabs.has(23)", h.context), true);
  for (const listener of h.updates) listener(23, { url: postUrl }, { id: 23, url: postUrl });
  const result = await resultPromise;
  assert.equal(result.article.linkedinOriginalUrl, postUrl);
  assert.deepEqual(h.removed, [23]);
});

test("a Google consent page stops automatic navigation and closes the hidden tab", async () => {
  const h = harness();
  const resultPromise = h.context.resolveLinkedInOnExpand("article-1");
  await settle();
  const consentUrl = "https://consent.google.com/m?continue=https://news.google.com/";
  for (const listener of h.updates) listener(23, { url: consentUrl }, { id: 23, url: consentUrl });
  const result = await resultPromise;
  assert.match(result.error, /Google demande une confirmation/);
  assert.deepEqual(h.removed, [23]);
});

test("the legacy manually opened tab is observed but is never closed by capture", async () => {
  const h = harness();
  vm.runInContext('pendingLinkedInTabs.set(77, { articleId: "article-1", expiresAt: Date.now() + 90000 })', h.context);
  for (const listener of h.updates) listener(77, { url: postUrl }, { id: 77, url: postUrl });
  await settle();
  assert.equal(h.stored.get("article-1").linkedinOriginalUrl, postUrl);
  assert.deepEqual(h.removed, []);
  assert.equal(vm.runInContext("pendingLinkedInTabs.has(77)", h.context), false);
});

test("collapsing a card cancels the pending operation and closes its temporary tab", async () => {
  const h = harness();
  const resultPromise = h.context.resolveLinkedInOnExpand("article-1");
  await settle();
  assert.equal(h.context.cancelLinkedInResolution("article-1"), true);
  assert.equal(JSON.stringify(await resultPromise), JSON.stringify({ cancelled: true }));
  assert.deepEqual(h.removed, [23]);
});

test("the resolver skips known links and refuses to create a visible fallback tab", async () => {
  const known = harness({ article: { linkedinOriginalUrl: postUrl } });
  const knownResult = await known.context.resolveLinkedInOnExpand("article-1");
  assert.equal(knownResult.article.linkedinOriginalUrl, postUrl);
  assert.deepEqual(known.created, []);

  const denied = harness({ permission: false });
  const deniedResult = await denied.context.resolveLinkedInOnExpand("article-1");
  assert.match(deniedResult.error, /masquage d’onglet/);
  assert.deepEqual(denied.created, []);
});

test("the 90 second timeout closes an unresolved temporary tab", async () => {
  const h = harness();
  const resultPromise = h.context.resolveLinkedInOnExpand("article-1");
  await settle();
  assert.equal(h.timers.size, 1);
  [...h.timers.values()][0]();
  const result = await resultPromise;
  assert.match(result.error, /Délai de récupération dépassé/);
  assert.deepEqual(h.removed, [23]);
});

test("at most two temporary LinkedIn lookups can run at once", async () => {
  const h = harness();
  const first = h.context.resolveLinkedInOnExpand("article-1");
  const second = h.context.resolveLinkedInOnExpand("article-2");
  await settle();
  const third = await h.context.resolveLinkedInOnExpand("article-3");
  assert.match(third.error, /Une autre récupération LinkedIn est en cours/);
  assert.equal(h.created.length, 2);
  h.context.cancelLinkedInResolution("article-1");
  h.context.cancelLinkedInResolution("article-2");
  await Promise.all([first, second]);
  assert.deepEqual(h.removed, [23, 24]);
});
