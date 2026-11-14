const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "../settings.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../css/app.css"), "utf8");
const settings = fs.readFileSync(path.join(__dirname, "../js/settings.js"), "utf8");

test("all four smart filters display the shared local-analysis badge", () => {
  assert.equal((html.match(/class="analysis-badge"/gu) || []).length, 4);
  assert.match(html, /Les règles sont évaluées localement ; la vérification de certaines destinations de liens peut effectuer une requête réseau depuis Firefox/u);
});

test("persuasion and language preferences use the existing segmented state controls", () => {
  assert.match(html, /id="smartTechniqueDetectionState"[\s\S]*?id="smartTechniqueDetectionEnabled" type="radio"[\s\S]*?id="smartTechniqueDetectionDisabled" type="radio"/u);
  assert.match(html, /id="languageFilterState"[\s\S]*?id="languageFilterEnabled" type="radio"[\s\S]*?id="languageFilterDisabled" type="radio"/u);
  assert.doesNotMatch(html, /id="smartTechniqueDetectionEnabled" type="checkbox"|id="languageFilterEnabled" type="checkbox"/u);
  assert.match(settings, /persuasionDetectionEnabled:enabled,clickbaitDetectionEnabled:enabled/u);
  assert.match(settings, /saveLanguageSettings\(\{languageFilterEnabled:enabled\}\)/u);
  assert.match(settings, /paintPersuasionControl\(\)/u);
  assert.match(settings, /languageFilterDisabled.*checked=settings\.languageFilterEnabled!==true/u);
});

test("the two cards share an equal-width responsive grid without fixed heights", () => {
  const gridStart = html.indexOf('<div class="coming-soon-grid">', html.indexOf('id="panel-smart"'));
  const gridEnd = html.indexOf('<section id="panel-data"', gridStart);
  assert.ok(gridStart >= 0 && gridEnd > gridStart);
  const twoCards = html.slice(gridStart, gridEnd);
  assert.ok(twoCards.indexOf("persuasion-setting-card") < twoCards.indexOf("language-setting-card"));
  assert.match(css, /\.coming-soon-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);align-items:start/u);
  assert.match(css, /@media\(max-width:1050px\)\{\.coming-soon-grid\{grid-template-columns:minmax\(0,1fr\)\}\}/u);
  assert.doesNotMatch(css, /\.coming-soon-card[^\n{}]*height\s*:/u);
});
