const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fetchTextContext(fetch) {
  const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const start = background.indexOf("function diagnosticUrl(");
  const end = background.indexOf("async function fetchYouTubeVideoDetails(", start);
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({ URL, AbortController, setTimeout, clearTimeout, fetch });
  vm.runInContext(background.slice(start, end), context);
  return context;
}

test("HTTP errors retain the validation phase, status, content type, and sanitized URL", async () => {
  const context = fetchTextContext(async () => ({
    ok: false, status: 403, url: "https://publisher.example/news?token=private",
    headers: { get: name => name === "content-type" ? "text/html" : "" }
  }));
  let error;
  try { await vm.runInContext('fetchText("https://publisher.example/news?token=private", 1000, "lecture de la liste")', context); }
  catch (caught) { error = caught; }
  assert.ok(error);
  assert.match(error.message, /HTTP 403/);
  assert.equal(error.diagnostics.phase, "lecture de la liste");
  assert.equal(error.diagnostics.status, 403);
  assert.equal(error.diagnostics.contentType, "text/html");
  assert.match(error.diagnostics.url, /token=%5Bmasqu%C3%A9%5D/);
  assert.doesNotMatch(error.diagnostics.url, /private/);
});

test("network fetch errors preserve Firefox's original name and message", async () => {
  const context = fetchTextContext(async () => { throw new TypeError("NetworkError when attempting to fetch resource."); });
  let error;
  try { await vm.runInContext('fetchText("https://publisher.example/news", 1000, "lecture de la liste HTML")', context); }
  catch (caught) { error = caught; }
  assert.ok(error);
  assert.equal(error.diagnostics.phase, "lecture de la liste HTML");
  assert.equal(error.diagnostics.networkError, "network");
  assert.equal(error.diagnostics.errorName, "TypeError");
  assert.match(error.diagnostics.errorMessage, /NetworkError/);
  assert.match(error.message, /lecture de la liste HTML/);
});
