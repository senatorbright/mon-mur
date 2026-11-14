const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/wall.js"), "utf8");
const start = source.indexOf("function publishedDateLabel(");
const end = source.indexOf("\nconst SUMMARY_PREVIEW_LIMIT", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const context = vm.createContext({ Date, Intl, Number });
vm.runInContext(source.slice(start, end), context);

test("day precision dates do not display an invented publication time", () => {
  const label = vm.runInContext(`publishedDateLabel({publishedAt:${Date.UTC(2026, 9, 27)},datePrecision:"day"})`, context);
  assert.match(label, /Publié le 27 oct\. 2026 · heure inconnue/);
  assert.doesNotMatch(label, /\d{1,2}:\d{2}/);
});

test("precise publication dates and discovery fallbacks keep their labels", () => {
  const exact = vm.runInContext(`publishedDateLabel({publishedAt:${Date.UTC(2026, 9, 27, 20, 14)}})`, context);
  const fallback = vm.runInContext(`publishedDateLabel({publishedAt:${Date.UTC(2026, 9, 27)},dateIsFallback:true})`, context);
  assert.match(exact, /27 oct\. 2026/);
  assert.match(exact, /\d{1,2}:\d{2}/);
  assert.match(fallback, /date de découverte/);
});
