const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("Internet Archive reports received results, rejection reasons, and saved PDFs", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const functions = source.slice(source.indexOf("function iaField("), source.indexOf("async function refreshAllImpl("));
  const store = {}, saved = [];
  const docs = [
    { identifier: "no-pdf", title: "IA étude", mediatype: "texts", language: "fr", publicdate: "2026-10-28" },
    { identifier: "english", title: "IA report", mediatype: "texts", language: "en", publicdate: "2026-10-28" },
    { identifier: "valid-pdf", title: "IA rapport", mediatype: "texts", language: "fr", publicdate: "2026-10-28", creator: "Auteur" },
    { identifier: "not-text", title: "IA page web", mediatype: "web", language: "fr" }
  ];
  const context = vm.createContext({
    AbortController,
    hasSearchTermsConsent: async () => true,
    AbortSignal,
    Date,
    Map,
    Set,
    URL,
    encodeURIComponent,
    fetch: async (input, options = {}) => {
      const url = String(input);
      if (url.includes("advancedsearch.php")) return { ok: true, status: 200, json: async () => ({ response: { docs } }) };
      if (url.includes("/metadata/no-pdf")) return { ok: true, json: async () => ({ metadata: { language: "fr" }, files: [{ name: "cover.jpg" }] }) };
      if (url.includes("/metadata/english")) return { ok: true, json: async () => ({ metadata: { language: "en" }, files: [{ name: "report.pdf" }] }) };
      if (url.includes("/metadata/valid-pdf")) return { ok: true, json: async () => ({ metadata: { language: "fr", creator: "Auteur" }, files: [{ name: "report.pdf" }] }) };
      if (options.method === "HEAD") return { ok: true, headers: { get: name => name === "content-type" ? "application/pdf" : "" } };
      throw new Error(`Unexpected URL ${url}`);
    },
    browser: {
      permissions: { contains: async () => true },
      storage: { local: {
        get: async () => ({ internetArchiveState: { seen: {} } }),
        set: async value => Object.assign(store, value)
      } }
    },
    state: async () => ({
      automaticWalls: { internetArchive: true },
      walls: [{ id: "wall-a" }],
      wallSettings: { "wall-a": { priorities: [{ term: "IA", level: "high" }] } }
    }),
    MMP: {
      normalizeText: value => String(value).toLowerCase(),
      matchTerm: (text, term) => String(text).toLowerCase().includes(term.toLowerCase()),
      stableId: value => value
    },
    MMPDB: { putMany: async rows => saved.push(...rows) },
    automaticHistoryMetadata: () => ({}),
    recordAutomaticHistory: async () => {},
    INTERNET_ARCHIVE_SOURCE_PREFIX: "internet-archive:"
  });
  vm.runInContext(functions, context);
  const result = await vm.runInContext("refreshInternetArchive()", context);
  assert.equal(result.searches, 1);
  assert.equal(result.results, 4);
  assert.equal(result.invalidResultRejected, 1);
  assert.equal(result.languageRejected, 1);
  assert.equal(result.noPdfRejected, 1);
  assert.equal(result.stored, 1);
  assert.equal(result.requests[0].keyword, "IA");
  assert.equal(saved[0].documentKind, "pdf");
  assert.equal(store.internetArchiveCollectionDiagnostics.results, 4);
});

test("Internet Archive performs no topic request without search consent", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const functions = source.slice(source.indexOf("function iaField("), source.indexOf("async function refreshAllImpl("));
  let requests = 0;
  const context = vm.createContext({
    AbortController,
    hasSearchTermsConsent: async () => false,
    browser: { storage: { local: { set: async () => {} } } },
    fetch: async () => { requests++; }
  });
  vm.runInContext(functions, context);
  const result = await vm.runInContext("refreshInternetArchive()", context);
  assert.equal(result.skippedReason, "search-consent-missing");
  assert.equal(requests, 0);
});

test("revoking search consent aborts an in-flight Internet Archive search", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const listenerSource = source.slice(source.indexOf("let blueskyRefreshController"), source.indexOf("const VIDEO_REFERENCE_ISO"));
  const functions = source.slice(source.indexOf("function iaField("), source.indexOf("async function refreshAllImpl("));
  let granted = true, onRemoved, requests = 0, started;
  const fetchStarted = new Promise(resolve => { started = resolve; });
  const store = {};
  const context = vm.createContext({
    AbortController,
    AbortSignal,
    Date,
    Map,
    Set,
    URL,
    encodeURIComponent,
    hasSearchTermsConsent: async () => granted,
    fetch: async (_input, options = {}) => {
      requests++;
      started();
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("The operation was aborted.");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    },
    browser: {
      permissions: {
        onRemoved: { addListener: listener => { onRemoved = listener; } },
        contains: async () => true
      },
      storage: { local: {
        get: async () => ({ internetArchiveState: { seen: {} } }),
        set: async value => Object.assign(store, value)
      } }
    },
    state: async () => ({
      automaticWalls: { internetArchive: true },
      walls: [{ id: "wall-a" }],
      wallSettings: { "wall-a": { priorities: [{ term: "IA" }, { term: "Firefox" }] } }
    }),
    MMP: { normalizeText: value => String(value).toLowerCase(), matchTerm: () => false },
    MMPDB: { putMany: async () => {} },
    automaticHistoryMetadata: () => ({}),
    recordAutomaticHistory: async () => {},
    INTERNET_ARCHIVE_SOURCE_PREFIX: "internet-archive:"
  });
  vm.runInContext(listenerSource, context);
  vm.runInContext(functions, context);

  const collection = vm.runInContext("refreshInternetArchive()", context);
  await fetchStarted;
  granted = false;
  onRemoved({ data_collection: ["searchTerms"] });
  const result = await collection;

  assert.equal(requests, 1, "revocation aborts the active query before the next topic is sent");
  assert.equal(result.searches, 1);
  assert.equal(result.requests.length, 0, "an aborted query is not recorded as a completed response");
  assert.equal(store.internetArchiveCollectionDiagnostics.searches, 1);
});
