const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const dbSource = fs.readFileSync(path.join(root, "js/db.js"), "utf8");

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
