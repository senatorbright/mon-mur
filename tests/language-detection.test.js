const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function detectorWith(api) {
  const context = vm.createContext({ window: {}, browser: { i18n: { detectLanguage: api } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/language-detection.js"), "utf8"), context);
  return context.window.MMLanguageDetection;
}

test("normalizes Firefox language codes, preserves accents, and removes URLs", async () => {
  let calls = 0;
  const detector = detectorWith(async text => { calls++; assert.equal(text, "Café français WordPress"); return { isReliable: true, languages: [{ language: "fr-FR", percentage: 98 }] }; });
  assert.equal(await detector.detect("Café français WordPress https://example.test/page"), "fr");
  assert.equal(await detector.detect("Café français WordPress https://example.test/page"), "fr");
  assert.equal(calls, 1);
});

test("uses only a reliable dominant language and treats API failures as und", async () => {
  const replies = [
    { isReliable: false, languages: [{ language: "es", percentage: 100 }] },
    { isReliable: true, languages: [{ language: "en-US", percentage: 55 }, { language: "fr", percentage: 45 }] }
  ];
  const detector = detectorWith(async () => replies.shift());
  assert.equal(await detector.detect("Un texte français avec quelques words techniques"), "und");
  assert.equal(await detector.detect("How to build a website with WordPress and AI"), "en");
  assert.equal(await detector.detect("Texte suffisamment long pour déclencher une erreur"), "und");
  assert.equal(await detector.detect("   "), "und");
});

test("returns und when Firefox rejects detection", async () => {
  const detector = detectorWith(async () => { throw new Error("API indisponible"); });
  assert.equal(await detector.detect("Comment utiliser l’IA pour créer un site WordPress"), "und");
});

test("loads the detector before wall rendering and includes language preferences by default", () => {
  const html = fs.readFileSync(path.join(__dirname, "../wall.html"), "utf8");
  assert.ok(html.indexOf('src="js/language-detection.js"') < html.indexOf('src="js/wall.js"'));
  const core = fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8");
  assert.match(core, /languageFilterEnabled: false/);
  assert.match(core, /languageFilterLanguages: \["fr", "en"\]/);
});
