const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const dbSource = fs.readFileSync(path.join(root, "js/db.js"), "utf8");
const backgroundSource = fs.readFileSync(path.join(root, "js/background.js"), "utf8");
const sourceRowsStart = backgroundSource.indexOf("async function sourceRowsToPersist(");
const sourceRowsEnd = backgroundSource.indexOf("function sourceHistoryMetadata(", sourceRowsStart);
assert.ok(sourceRowsStart >= 0 && sourceRowsEnd > sourceRowsStart);

function makeIndexedDB() {
  let database;
  const keyFor = (store, value) => store.name === "sourceHistory" ? `${value.sourceId}\u0000${value.canonicalUrl}` : value.canonicalUrl || value.id || value.sourceId;
  function makeStore(name, rows = new Map()) {
    const indexes = new Set();
    const store = {
      name, rows, indexNames: { contains: value => indexes.has(value) },
      createIndex(value) { indexes.add(value); },
      deleteIndex(value) { indexes.delete(value); },
      put(value) { rows.set(keyFor(store, value), structuredClone(value)); },
      delete(key) { rows.delete(Array.isArray(key) ? key.join("\u0000") : key); },
      get(key, tx) {
        const request = {};
        tx?._schedule(() => { request.result = structuredClone(rows.get(Array.isArray(key) ? key.join("\u0000") : key)); request.onsuccess?.(); });
        return request;
      },
      getAll(tx) {
        const request = {};
        tx?._schedule(() => { request.result = [...rows.values()].map(value => structuredClone(value)); request.onsuccess?.(); });
        return request;
      },
      index(indexName) {
        return { openCursor(range, tx) { return cursorRequest(store, indexName, range, tx); } };
      },
      openCursor(tx) { return cursorRequest(store, "", null, tx); }
    };
    return store;
  }
  function cursorRequest(store, indexName, range, tx) {
    const request = {};
    const schedule = callback => tx ? tx._schedule(callback) : setTimeout(callback, 0);
    schedule(() => {
      let values = [...store.rows.values()];
      if (indexName) values.sort((a, b) => Number(a[indexName] || 0) - Number(b[indexName] || 0));
      if (range) values = values.filter(value => Number(value[indexName] || 0) <= range.upper);
      let position = 0;
      const advance = () => {
        const value = values[position];
        if (!value) { request.result = null; request.onsuccess?.(); return; }
        request.result = {
          value: structuredClone(value),
          update(updated) { store.put(updated); },
          delete() { store.delete(keyFor(store, value)); },
          continue() { position++; schedule(advance); }
        };
        request.onsuccess?.();
      };
      advance();
    });
    return request;
  }
  function makeDatabase() {
    const stores = new Map();
    const db = {
      objectStoreNames: { contains: name => stores.has(name) },
      createObjectStore(name) { const store = makeStore(name); stores.set(name, store); return store; },
      transaction(names) {
        const selected = Array.isArray(names) ? names : [names];
        let pending = 0, completeHandler = null, completed = false;
        const tx = {
          _schedule(callback) {
            pending++;
            setTimeout(() => {
              callback(); pending--;
              if (!pending && completeHandler && !completed) { completed = true; setTimeout(() => completeHandler(), 0); }
            }, 0);
          },
          set oncomplete(handler) { completeHandler = handler; if (!pending && !completed) { completed = true; setTimeout(() => completeHandler(), 0); } },
          get oncomplete() { return completeHandler; },
          objectStore(name) {
            assert.ok(selected.includes(name));
            const base = stores.get(name);
            return {
              ...base,
              get: key => base.get(key, tx),
              getAll: () => base.getAll(tx),
              openCursor: () => base.openCursor(tx),
              index: indexName => ({ openCursor: range => base.index(indexName).openCursor(range, tx) })
            };
          }
        };
        return tx;
      }
    };
    return db;
  }
  return {
    open(_name, version) {
      const request = {};
      setTimeout(() => {
        if (!database) {
          database = makeDatabase();
          const upgradeTx = { objectStore: name => database.transaction(name).objectStore(name) };
          request.result = database;
          request.onupgradeneeded?.({ target: { transaction: upgradeTx } });
        }
        request.result = database;
        request.onsuccess?.();
      }, version ? 0 : 0);
      return request;
    }
  };
}

test("source URL history refreshes lastSeenAt and prunes from that indexed timestamp", () => {
  assert.match(dbSource, /NAME = "mon-mur-presse", VERSION = 8/u);
  assert.match(dbSource, /createIndex\("lastSeenAt", "lastSeenAt"\)/u);
  assert.match(dbSource, /lastSeenAt: Number\(cursor\.value\.lastSeenAt\) \|\| firstSeenAt/u,
    "existing history gets a last-seen timestamp without extending its current lifetime");
  assert.match(dbSource, /firstSeenAt: Number\(old\.firstSeenAt\) \|\| firstSeenAt, lastSeenAt: firstSeenAt/u,
    "every successful encounter refreshes the expiry timestamp while preserving firstSeenAt");
  assert.match(dbSource, /index\("lastSeenAt"\)\.openCursor\(IDBKeyRange\.upperBound\(cutoff\)\)/u,
    "expiry uses an index range rather than scanning the full URL history");
});

test("canonical URLs drop UTM variants but preserve content parameters", () => {
  const context = vm.createContext({ URL, URLSearchParams, Date, Map, Set, String, Number, RegExp });
  vm.runInContext(fs.readFileSync(path.join(root, "js/core.js"), "utf8"), context);
  const clean = url => vm.runInContext(`MMP.cleanUrl(${JSON.stringify(url)})`, context);
  assert.equal(clean("https://example.test/story?UTM_Source=news&id=42#section"), "https://example.test/story?id=42");
  assert.equal(clean("https://example.test/story?id=42&edition=fr"), "https://example.test/story?id=42&edition=fr");
});

test("a repeatedly returned unread URL stays deduplicated past seven days and survives a runtime restart", async () => {
  let now = 1_800_000_000_000;
  class ClockDate extends Date { static now() { return now; } }
  const indexedDB = makeIndexedDB();
  const loadDb = () => {
    const context = vm.createContext({ indexedDB, IDBKeyRange: { upperBound: upper => ({ upper }) }, Date: ClockDate, Set, Number, Map, Promise, structuredClone });
    vm.runInContext(dbSource, context);
    return context;
  };
  let context = loadDb();
  const url = "https://example.test/story?article=42";
  await vm.runInContext(`MMPDB.rememberSourceArticles("source", [{canonicalUrl:${JSON.stringify(url)}, title:"Story"}], {})`, context);
  now += 6 * 86400000;
  await vm.runInContext(`MMPDB.rememberSourceArticles("source", [{canonicalUrl:${JSON.stringify(url)}, title:"Story", publishedAt:Date.now(), readingState:null}], {})`, context);
  now += 2 * 86400000;
  context = loadDb(); // New extension runtime, same IndexedDB profile.
  await vm.runInContext(`MMPDB.pruneSourceHistory(Date.now() - 7 * 86400000)`, context);
  assert.equal(await vm.runInContext(`MMPDB.sourceHistory("source", [${JSON.stringify(url)}]).then(rows => rows.has(${JSON.stringify(url)}))`, context), true);
  now += 8 * 86400000;
  await vm.runInContext(`MMPDB.pruneSourceHistory(Date.now() - 7 * 86400000)`, context);
  assert.equal(await vm.runInContext(`MMPDB.sourceHistory("source", [${JSON.stringify(url)}]).then(rows => rows.has(${JSON.stringify(url)}))`, context), false);
});

test("a non-acquired URL keeps the original acquisition cutoff for later date re-evaluation", async () => {
  let now = 1_800_000_000_000;
  class ClockDate extends Date { static now() { return now; } }
  const indexedDB = makeIndexedDB();
  const context = vm.createContext({ indexedDB, IDBKeyRange: { upperBound: upper => ({ upper }) }, Date: ClockDate, Set, Number, Map, Promise, structuredClone });
  vm.runInContext(dbSource, context);
  const url = "https://example.test/unacquired";
  const firstSeenAt = now, lookbackMs = 15 * 60000;
  await vm.runInContext(`MMPDB.rememberSourceArticles("source", [{canonicalUrl:${JSON.stringify(url)}, title:"Story"}], { acquiredCanonicalUrls: [] })`, context);
  now += 60000;
  await vm.runInContext(`MMPDB.rememberSourceArticles("source", [{canonicalUrl:${JSON.stringify(url)}, title:"Story"}], { acquiredCanonicalUrls: [], acquisitionCutoffAt:${firstSeenAt - lookbackMs - 60000}, acquisitionLookbackMs:${lookbackMs} })`, context);
  const entry = await vm.runInContext(`MMPDB.sourceHistoryEntries("source", [${JSON.stringify(url)}]).then(rows => rows.get(${JSON.stringify(url)}))`, context);
  assert.equal(entry.acquired, false);
  assert.equal(entry.firstSeenAt, firstSeenAt);
  assert.equal(entry.acquisitionCutoffAt, firstSeenAt - lookbackMs);
});

test("a new refusal stores the filter decision and later refusals do not overwrite it", async () => {
  let now = 1_800_000_000_000;
  class ClockDate extends Date { static now() { return now; } }
  const indexedDB = makeIndexedDB();
  const context = vm.createContext({ indexedDB, IDBKeyRange: { upperBound: upper => ({ upper }) }, Date: ClockDate, Set, Number, Map, Promise, structuredClone, refreshInterval: async () => 15 });
  vm.runInContext(dbSource, context);
  vm.runInContext(backgroundSource.slice(sourceRowsStart, sourceRowsEnd), context);
  const url = "https://example.test/refused", firstCutoff = now - 60000;
  context.testRows = [{ canonicalUrl: url, title: "Story", publishedAt: now - 120000, datePrecision: "instant", dateIsFallback: false }];
  context.rejectionDecisions = {};
  const firstSelection = await vm.runInContext(`sourceRowsToPersist("source", testRows, ${firstCutoff}, 0, null, {}, false, rejectionDecisions)`, context);
  assert.equal(firstSelection.length, 0);
  const first = JSON.parse(JSON.stringify(context.rejectionDecisions[url]));
  assert.deepEqual({ rejectionReason: first.rejectionReason, cutoffAtDecision: first.cutoffAtDecision, evaluatedAt: first.evaluatedAt, publishedAt: first.publishedAt }, {
    rejectionReason: "olderThanLastSync", cutoffAtDecision: firstCutoff, evaluatedAt: now, publishedAt: now - 120000
  });
  await vm.runInContext(`MMPDB.rememberSourceArticles("source", testRows, { rejectionDecisions, acquisitionCutoffAt:${firstCutoff}, acquiredCanonicalUrls: [] })`, context);
  const original = await vm.runInContext(`MMPDB.sourceHistoryEntries("source", [${JSON.stringify(url)}]).then(rows => rows.get(${JSON.stringify(url)}).firstRejection)`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(original)), first);

  now += 60000;
  context.testRows = [{ canonicalUrl: url, title: "Story updated", publishedAt: now - 180000, datePrecision: "instant", dateIsFallback: false }];
  context.rejectionDecisions = {};
  const repeatedSelection = await vm.runInContext(`sourceRowsToPersist("source", testRows, ${firstCutoff}, 0, null, {}, false, rejectionDecisions)`, context);
  assert.equal(repeatedSelection.length, 0);
  assert.equal(context.rejectionDecisions[url].rejectionReason, "olderThanLastSync");
  await vm.runInContext(`MMPDB.rememberSourceArticles("source", testRows, { rejectionDecisions, acquiredCanonicalUrls: [] })`, context);
  const afterRepeat = await vm.runInContext(`MMPDB.sourceHistoryEntries("source", [${JSON.stringify(url)}]).then(rows => rows.get(${JSON.stringify(url)}).firstRejection)`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(afterRepeat)), first);
});

test("a legacy non-acquired URL records the first filter refusal observable after upgrade", async () => {
  let now = 1_800_000_000_000;
  class ClockDate extends Date { static now() { return now; } }
  const indexedDB = makeIndexedDB();
  const context = vm.createContext({ indexedDB, IDBKeyRange: { upperBound: upper => ({ upper }) }, Date: ClockDate, Set, Number, Map, Promise, structuredClone, refreshInterval: async () => 15 });
  vm.runInContext(dbSource, context);
  vm.runInContext(backgroundSource.slice(sourceRowsStart, sourceRowsEnd), context);
  const url = "https://example.test/legacy", firstSeenAt = now - 600000;
  const previousCutoff = firstSeenAt - 300000;
  context.testRows = [{ canonicalUrl: url, title: "Legacy story" }];
  await vm.runInContext(`MMPDB.rememberSourceArticles("source", testRows, { acquiredCanonicalUrls: [], acquisitionCutoffAt:${previousCutoff} })`, context);
  const prior = await vm.runInContext(`MMPDB.sourceHistoryEntries("source", [${JSON.stringify(url)}]).then(rows => rows.get(${JSON.stringify(url)}))`, context);
  assert.equal(prior.firstRejection, undefined);

  context.testRows = [{ canonicalUrl: url, title: "Legacy story", publishedAt: firstSeenAt - 600000, datePrecision: "instant", dateIsFallback: false }];
  context.rejectionDecisions = {};
  const selected = await vm.runInContext(`sourceRowsToPersist("source", testRows, ${now}, 0, null, {}, false, rejectionDecisions)`, context);
  assert.equal(selected.length, 0);
  const observed = JSON.parse(JSON.stringify(context.rejectionDecisions[url]));
  assert.deepEqual({ rejectionReason: observed.rejectionReason, cutoffAtDecision: observed.cutoffAtDecision, evaluatedAt: observed.evaluatedAt, publishedAt: observed.publishedAt }, {
    rejectionReason: "olderThanLastSync", cutoffAtDecision: previousCutoff, evaluatedAt: now, publishedAt: firstSeenAt - 600000
  });
  await vm.runInContext(`MMPDB.rememberSourceArticles("source", testRows, { rejectionDecisions, acquiredCanonicalUrls: [] })`, context);
  const recorded = await vm.runInContext(`MMPDB.sourceHistoryEntries("source", [${JSON.stringify(url)}]).then(rows => rows.get(${JSON.stringify(url)}).firstRejection)`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(recorded)), observed);
});

test("storing an acquired URL still keeps the article and deduplicates later encounters", async () => {
  let now = 1_800_000_000_000;
  class ClockDate extends Date { static now() { return now; } }
  const indexedDB = makeIndexedDB();
  const context = vm.createContext({ indexedDB, IDBKeyRange: { upperBound: upper => ({ upper }) }, Date: ClockDate, Set, Number, Map, Promise, structuredClone });
  vm.runInContext(dbSource, context);
  const url = "https://example.test/acquired";
  context.articleRows = [{ id: "article-1", sourceId: "source", canonicalUrl: url, title: "Acquired story", publishedAt: now, dateIsFallback: false, datePrecision: "instant" }];
  await vm.runInContext("MMPDB.putMany(articleRows)", context);
  await vm.runInContext(`MMPDB.rememberSourceArticles("source", articleRows, { acquiredCanonicalUrls: [${JSON.stringify(url)}] })`, context);
  const stored = await vm.runInContext("MMPDB.all()", context);
  const acquired = await vm.runInContext(`MMPDB.sourceHistory("source", [${JSON.stringify(url)}], true).then(rows => rows.has(${JSON.stringify(url)}))`, context);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].canonicalUrl, url);
  assert.equal(acquired, true);
});
