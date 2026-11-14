const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
const start = source.indexOf("function sourceAcquisitionDiagnostic(");
const end = source.indexOf("async function recordAutomaticHistory", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const context = vm.createContext({ Date, Set });
vm.runInContext(source.slice(start, end), context);

test("source diagnostics distinguish received, newly stored, known, and excluded URLs", () => {
  const diagnostic = vm.runInContext(`sourceAcquisitionDiagnostic({
    attemptedAt: 100, finishedAt: 200, outcome: "success", method: "rss", storageCompleted: true,
    result: { status: 200, articles: [
      { canonicalUrl: "https://example.test/new" },
      { canonicalUrl: "https://example.test/known" },
      { canonicalUrl: "https://example.test/filtered" }
    ] },
    selectedRows: [{ canonicalUrl: "https://example.test/new" }, { canonicalUrl: "https://example.test/known" }],
    knownSourceUrls: ["https://example.test/known"]
  })`, context);
  assert.equal(diagnostic.receivedArticleCount, 3);
  assert.equal(diagnostic.receivedUrlCount, 3);
  assert.equal(diagnostic.newlyStoredUrlCount, 1);
  assert.equal(diagnostic.alreadyKnownUrlCount, 1);
  assert.equal(diagnostic.excludedUrlCount, 1);
  assert.equal(diagnostic.httpStatus, 200);
});

test("failed fetch diagnostics leave received counts unknown instead of reporting zero", () => {
  const diagnostic = vm.runInContext(`sourceAcquisitionDiagnostic({
    attemptedAt: 100, finishedAt: 200, outcome: "error", method: "rss",
    result: { status: 503, error: "HTTP 503" }, stage: "réception ou analyse"
  })`, context);
  assert.equal(diagnostic.receivedArticleCount, null);
  assert.equal(diagnostic.receivedUrlCount, null);
  assert.equal(diagnostic.httpStatus, 503);
});
