const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const settings = fs.readFileSync(path.join(__dirname, "../js/settings.js"), "utf8");
const helpersStart = settings.indexOf("const SEMANTIC_FILTER_BACKUP_KEYS=");
const helpersEnd = settings.indexOf("\nfunction wallSettings()", helpersStart);
assert.notEqual(helpersStart, -1);
assert.notEqual(helpersEnd, -1);
const context = vm.createContext({ structuredClone });
vm.runInContext(`${settings.slice(helpersStart, helpersEnd)}
  this.exportFilters = semanticFiltersForBackup;
  this.importFilters = semanticFiltersFromBackup;
  this.warning = semanticFilterBackupWarning;
`, context);

test("semantic filter export includes categories, excluded terms, and priorities as independent arrays", () => {
  const source = {
    excludedCategories: ["Culture"],
    excludedKeywords: ["rumeur", "intelligence artificielle"],
    priorities: [{ term: "climat", level: "high" }]
  };
  const backup = context.exportFilters(source);

  assert.deepEqual(JSON.parse(JSON.stringify(backup)), source);
  backup.excludedCategories.push("Autre");
  backup.priorities[0].term = "modifié";
  assert.deepEqual(source.excludedCategories, ["Culture"]);
  assert.equal(source.priorities[0].term, "climat");
});

test("semantic filter import restores all supported arrays from a v6 backup", () => {
  const backup = {
    format: "mon-mur-preferences",
    version: 6,
    excludedCategories: ["Culture"],
    excludedKeywords: ["rumeur"],
    priorities: [{ term: "climat", level: "high" }]
  };

  assert.deepEqual(JSON.parse(JSON.stringify(context.importFilters(backup))), {
    excludedCategories: ["Culture"],
    excludedKeywords: ["rumeur"],
    priorities: [{ term: "climat", level: "high" }]
  });
});

test("legacy backups without semantic fields leave current filters untouched and are identified", () => {
  const backup = { format: "mon-mur-preferences", version: 6, walls: [], wallSettings: {} };
  const current = {
    excludedCategories: ["Déjà présent"],
    excludedKeywords: ["terme courant"],
    priorities: [{ term: "priorité courante", level: "medium" }]
  };
  const restored = { ...current, ...context.importFilters(backup) };

  assert.deepEqual(restored, current);
  assert.match(context.warning(backup), /catégories exclues/u);
  assert.match(context.warning(backup), /mots et expressions exclus/u);
  assert.match(context.warning(backup), /priorités/u);
});

test("export and import preserve processed history but omit temporary pending discoveries", () => {
  assert.match(settings, /wallSettings:current\.wallSettings,\.\.\.semanticFiltersForBackup\(stored\.settings\)/u);
  assert.match(settings, /restoredSemanticFilters=semanticFiltersFromBackup\(backup\)/u);
  assert.match(settings, /settings:\{\.\.\.old\.settings,\.\.\.restoredSemanticFilters,/u);
  assert.match(settings, /format:"mon-mur-preferences",version:9/u);
  assert.match(settings, /processedSources:normalizeBackupProcessedSources/u);
  assert.match(settings, /Array\.isArray\(backup\.refusedSources\)/u);
  assert.doesNotMatch(settings, /pendingDiscoveries:stored\.pendingDiscoveries/u);
  assert.doesNotMatch(settings, /Array\.isArray\(backup\.pendingDiscoveries\)\?\{pendingDiscoveries/u);
  assert.match(settings, /\$\{semanticFilterBackupWarning\(backup\)\}/u);
});


test("v9 discovery backup normalization keeps feed-specific identities and validates visit URLs", () => {
  const source = fs.readFileSync(path.join(__dirname, "../js/settings.js"), "utf8");
  const start = source.indexOf("function normalizeDiscoveryIdentity(");
  const end = source.indexOf("function normalizeBackupSources(", start);
  const sandbox = vm.createContext({ URL, Date });
  vm.runInContext(`${source.slice(start, end)}; this.normalizeRows = normalizeBackupDiscoveryRows;`, sandbox);
  const [row] = sandbox.normalizeRows([{ feedUrl: "https://Feeds.Example/rss.xml?utm_source=x", pageUrl: "javascript:alert(1)", name: "Feed", method: "atom", recentTitles: ["titre"], discoveredAt: 123 }]);
  assert.equal(row.identity, "https://feeds.example/rss.xml");
  assert.equal(row.pageUrl, row.identity);
  assert.equal(row.method, "atom");
  assert.equal(row.status, undefined);
  assert.equal(row.recentTitles[0], "titre");
  assert.equal(sandbox.normalizeRows([{ feedUrl: "https://feeds.example/rss.xml?utm_source=y" }, { feedUrl: "https://FEEDS.example/rss.xml" }]).length, 1);
});
