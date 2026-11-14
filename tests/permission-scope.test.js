const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/sources.js"), "utf8");
const start = source.indexOf("function domainPermission(");
const end = source.indexOf("\nfunction friendlyError", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);

test("adding a source requests the exact host and port only when global access is absent", async () => {
  const requested = [];
  const context = vm.createContext({
    URL,
    globalSiteAccess: false,
    browser: { permissions: { request: async request => { requested.push(request); return true; } } }
  });
  vm.runInContext(source.slice(start, end), context);

  assert.equal(await vm.runInContext('domainPermission("https://feeds.example.org/rss.xml")', context), true);
  assert.deepEqual(JSON.parse(JSON.stringify(requested)), [{ origins: ["https://feeds.example.org/*"] }]);

  assert.equal(await vm.runInContext('domainPermission("http://127.0.0.1:8765/feed.xml")', context), true);
  assert.deepEqual(JSON.parse(JSON.stringify(requested.at(-1))), { origins: ["http://127.0.0.1:8765/*"] });

  requested.length = 0;
  context.globalSiteAccess = true;
  assert.equal(await vm.runInContext('domainPermission("https://feeds.example.org/rss.xml")', context), true);
  assert.equal(await vm.runInContext('domainPermission("http://127.0.0.1:8765/feed.xml")', context), true);
  assert.deepEqual(requested, []);
});

test("toolbar source permissions keep non-default ports for initial and retry requests", async () => {
  const popup = fs.readFileSync(path.join(__dirname, "../js/popup.js"), "utf8");
  const start = popup.indexOf("function permissionOriginPattern(");
  const end = popup.indexOf("\nfunction friendlyError", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const context = vm.createContext({ URL, Promise, globalSiteAccess: false });
  vm.runInContext(popup.slice(start, end), context);

  assert.equal(await vm.runInContext('permissionOriginPattern("https://feeds.example.org/rss.xml")', context), "https://feeds.example.org/*");
  assert.equal(await vm.runInContext('permissionOriginPattern("http://127.0.0.1:8765/feed.xml")', context), "http://127.0.0.1:8765/*");
  assert.match(popup, /permissions\.request\(\{origins:\[permissionOriginPattern\(origin\)\]\}\)/);
});
