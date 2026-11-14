const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const wall = fs.readFileSync(path.join(__dirname, "../js/wall.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../css/expand.css"), "utf8");
const modelSource = wall.match(/function affiliateIndicatorModel\(findings\)\s*\{[\s\S]*?\n\}/)?.[0];
assert.ok(modelSource, "the wall exposes a presentation model for affiliate cocardes");
const context = vm.createContext({});
vm.runInContext(`${modelSource}; this.model=affiliateIndicatorModel;`, context);

test("cocarde count includes confirmed links only when mixed with suspects", () => {
  const result = context.model([
    { status: "recognized" }, { status: "recognized" }, { status: "suspected" }
  ]);
  assert.equal(result.label, "Affiliation · 2");
  assert.equal(result.tone, "recognized");
  assert.equal(result.recognized.length, 2);
  assert.equal(result.suspected.length, 1);
});

test("suspect-only and clean cards have distinct presentation states", () => {
  const suspectOnly = context.model([{ status: "suspected" }, { status: "suspected" }]);
  assert.equal(suspectOnly.label, "À vérifier · 2");
  assert.equal(suspectOnly.tone, "suspected");
  assert.equal(context.model([]).tone, "none");
});

test("network failures have a distinct non-verified presentation and cannot look like a clean result", () => {
  const result = context.model([{ status: "unverified" }]);
  assert.equal(result.tone, "unverified");
  assert.equal(result.label, "Non vérifié · 1");
  assert.match(result.ariaLabel, /Vérification réseau impossible/);
  assert.match(wall, /Liens non vérifiés/);
  assert.match(css, /\.affiliate-notice\.unverified-only/);
});

test("the cocarde overlays a cover when present and anchors to the card without one", () => {
  assert.match(wall, /frame\.append\(trigger\)/);
  assert.match(wall, /trigger\.classList\.add\("no-cover"\)/);
  assert.match(css, /\.affiliate-cocarde\.on-cover\{top:/);
  assert.match(css, /\.affiliate-cocarde\.no-cover\{top:/);
  assert.match(wall, /removeCardCover\(article, image\)/);
});

test("keyboard-operable cocarde toggles the existing explanatory panel", () => {
  assert.match(wall, /trigger\.type="button"/);
  assert.match(wall, /trigger\.setAttribute\("aria-expanded","false"\)/);
  assert.match(wall, /trigger\.addEventListener\("click",\(\)=>\{const opening=panel\.hidden;panel\.hidden=!opening;trigger\.setAttribute\("aria-expanded",String\(opening\)\);\}\)/);
  assert.match(css, /\.affiliate-cocarde:hover,\.affiliate-cocarde:focus-visible/);
  assert.match(wall, /toggleArticle=async\(\)=>/);
});

test("affiliate rendering receives the card element separately from article data", () => {
  assert.match(wall, /function renderAffiliateNotice\(article, articleData, articleBody, detected=affiliateFindings\(articleData\)\)/);
  assert.match(wall, /renderAffiliateNotice\(article,a,articleBody\)/);
  assert.match(wall, /renderAffiliateNotice\(article,a,articleBody,affiliateFindingsInContent\(a,content\)\)/);
  assert.match(wall, /renderAffiliateNotice\(cardNode,articleData,articleBody\)/);
});

test("recognized and suspected panel entries use separate red and orange styles", () => {
  assert.match(wall, /affiliate-result \$\{kind\}/);
  assert.match(wall, /kind=finding\.status==="recognized"\?"recognized":finding\.status==="unverified"\?"unverified":"suspected"/);
  assert.match(css, /\.affiliate-result\.suspected/);
  assert.match(css, /\.affiliate-result\.unverified/);
  assert.match(css, /\.affiliate-notice\.suspected-only/);
});

test("cocarde remains compact at mobile widths", () => {
  const mobile = css.indexOf("@media(max-width:620px)");
  assert.notEqual(mobile, -1);
  assert.ok(css.indexOf(".affiliate-cocarde{", mobile) > mobile);
});

test("flagged links require an explicit confirmation and support keyboard and alternate navigation paths", () => {
  const start = wall.indexOf("function configureAffiliateLinkGuard("), end = wall.indexOf("function loadVideoMetadata(", start);
  const guard = wall.slice(start, end);
  assert.notEqual(start, -1);
  assert.match(guard, /a\.affiliate-link-highlight,a\.affiliate-link-suspected/u, "only marked links enter the confirmation flow");
  assert.match(guard, /event\.preventDefault\(\);show\(anchor\)/u, "ordinary click does not navigate before the warning");
  assert.match(guard, /addEventListener\("auxclick"/u, "middle click is intercepted");
  assert.match(guard, /addEventListener\("contextmenu"/u, "open-in-new-tab context actions cannot bypass confirmation");
  assert.match(guard, /event\.key==="Escape"&&activePanel\).*close\(true\)/u, "Escape closes and restores focus");
  assert.match(guard, /approvedClicks\.add\(source\);try\{source\.click\(\);\}finally\{approvedClicks\.delete\(source\);\}/u, "confirmation reuses the original anchor exactly once without reopening the warning");
  assert.doesNotMatch(guard, /fetch\(|sendMessage\(/u, "displaying the explanation adds no network request");
  assert.match(wall, /Lien d’affiliation détecté/u);
  assert.match(wall, /Lien d’affiliation suspecté/u);
  assert.match(wall, /Indice observé : \$\{finding\.reason\}/u, "the warning exposes the detector's actual reason");
  assert.match(wall, /resolved\?\.status==="recognized"\|\|resolved\?\.status==="unverified"\?resolved/u, "confirmed and unverified network findings take precedence over initial suspicion");
  assert.match(css, /\.affiliate-link-check\.suspected/);
  assert.match(css, /@media\(prefers-color-scheme:dark\)\{\.affiliate-link-check\.recognized/);
});
