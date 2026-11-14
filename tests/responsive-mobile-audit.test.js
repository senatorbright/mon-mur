const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../css/app.css"), "utf8");
const history = fs.readFileSync(path.join(__dirname, "../url-history.html"), "utf8");
const catalogCss = fs.readFileSync(path.join(__dirname, "../css/persuasion-catalog.css"), "utf8");
const clickbaitCatalog = fs.readFileSync(path.join(__dirname, "../clickbait-catalog.html"), "utf8");
const persuasionCatalog = fs.readFileSync(path.join(__dirname, "../persuasion-catalog.html"), "utf8");
const wall = fs.readFileSync(path.join(__dirname, "../js/wall.js"), "utf8");

test("the acquisition history explains horizontal table scrolling only on narrow screens", () => {
  assert.match(history, /class="history-scroll-hint"[^>]*>Faites défiler horizontalement/u);
  assert.match(css, /\.history-scroll-hint\{display:none\}/u);
  assert.match(css, /@media\(max-width:620px\)\{\.history-scroll-hint\{display:block/u);
});

test("both technique catalogues explain horizontal navigation on narrow screens", () => {
  for (const page of [clickbaitCatalog, persuasionCatalog]) {
    assert.match(page, /class="catalog-scroll-hint"[^>]*>Faites défiler horizontalement/u);
  }
  assert.match(catalogCss, /\.catalog-scroll-hint\{display:none\}/u);
  assert.match(catalogCss, /@media\(max-width:560px\)[\s\S]*?\.catalog-scroll-hint\{display:block/u);
});

test("short viewports reduce the source wall-heading reservation without changing desktop defaults", () => {
  assert.match(css, /\.sources-table th\.wall-column-heading\{width:46px;min-width:46px;height:132px/u);
  assert.match(css, /@media\(max-height:650px\)\{\.sources-table th\.wall-column-heading\{height:96px\}\.wall-column-heading \.sort-button\{height:76px\}\}/u);
});

test("the mobile wall selector keeps every wall in a horizontally scrollable strip", () => {
  assert.match(wall, /let visiblePersonal=personal\.slice\(0,7\)/u);
  assert.match(wall, /overflow\.forEach\(wall=>makePersonalTab\(wall,tabs,true,true\)\)/u);
  assert.match(wall, /automatic\.filter\(wall=>wall\.kind==="youtube"\|\|wall\.kind==="bluesky"\|\|wall\.kind==="documents"\)/u);
  assert.match(css, /body\.wall-layout \.wall-sticky \.wall-navigation \.wall-tabs\{overflow-x:auto;overflow-y:hidden\}/u);
  assert.match(css, /\.wall-navigation \.wall-tab\.wall-mobile-overflow-tab\{display:none\}/u);
  assert.match(css, /@media\(max-width:620px\)\{\.wall-navigation \.wall-tab\.wall-mobile-overflow-tab\{display:inline-flex\}\}/u);
  assert.match(css, /@media\(max-width:620px\)\{\.wall-navigation \.wall-tab-auto-wrap\{align-self:center\}\.wall-navigation \.wall-tab-auto-wrap \.wall-tab\{flex:0 0 auto;min-height:46px\}\}/u);
  assert.match(css, /@media\(max-width:620px\)\{\.wall-navigation \.wall-tab\{height:44px;min-height:44px;max-height:44px;flex-wrap:nowrap;overflow:hidden\}/u);
  assert.match(css, /@media\(max-width:620px\)\{\.wall-navigation \.wall-tabs\{justify-content:flex-start\}\}/u);
  assert.match(css, /@media\(max-width:620px\)\{\.wall-sticky \.wall-navigation\{min-height:38px\}\.wall-sticky \.wall-navigation \.wall-tabs\{margin-top:0;padding-top:0;padding-bottom:3px;gap:5px\}\.wall-sticky \.wall-navigation \.wall-tab\{height:36px;min-height:36px;max-height:36px;padding:4px 8px\}\.wall-sticky \.wall-navigation \.wall-tab-auto-wrap\{gap:0\}\.wall-sticky \.wall-navigation \.wall-tab-auto-label\{display:none\}\}/u);
  assert.match(css, /\.wall-navigation \.wall-tab\{flex:0 0 clamp\(116px,23vw,126px\)/u);
  assert.match(css, /\.wall-navigation \.wall-tabs \.wall-family-icon\{display:none\}/u);
  assert.match(css, /@media\(max-width:620px\)\{\.wall-sticky \.feedhead\{display:flex;align-items:stretch;flex-direction:column;gap:4px;margin:0 auto;padding:3px 0 6px\}\.wall-sticky \.wall-summary\{display:flex;align-items:baseline;gap:6px;width:100%;min-width:0!important;white-space:nowrap;overflow:hidden\}/u);
  assert.match(css, /\.wall-sticky \.wall-summary #status\{flex:1;min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:1\.2\}/u);
});
