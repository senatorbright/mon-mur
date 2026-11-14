const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("language filter preferences are exported and restored from backups", () => {
  const settings = fs.readFileSync(path.join(__dirname, "../js/settings.js"), "utf8");
  assert.match(settings, /languageFilterEnabled:stored\.settings\.languageFilterEnabled===true/u);
  assert.match(settings, /languageFilterLanguages:Array\.isArray\(stored\.settings\.languageFilterLanguages\)/u);
  assert.match(settings, /languageFilterKeepUnknown:stored\.settings\.languageFilterKeepUnknown===true/u);
  assert.match(settings, /languageFilterEnabled:typeof backup\.languageFilterEnabled==="boolean"\?backup\.languageFilterEnabled:old\.settings\.languageFilterEnabled===true/u);
  assert.match(settings, /languageFilterLanguages:Array\.isArray\(backup\.languageFilterLanguages\)/u);
  assert.match(settings, /languageFilterKeepUnknown:typeof backup\.languageFilterKeepUnknown==="boolean"\?backup\.languageFilterKeepUnknown:old\.settings\.languageFilterKeepUnknown===true/u);
  assert.match(settings, /\["fr","en","es","it","pt","de","nl","pl"\]\.includes\(language\)/u);
});
