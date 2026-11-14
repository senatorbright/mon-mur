const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ URL, Intl, Date, Map, Set, Object, String, Number, RegExp, JSON });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8"), context);

test("short acronym priorities match whole tokens, not letter pairs inside words", () => {
  assert.equal(vm.runInContext('MMP.matchTerm("social", "IA")', context), false);
  assert.equal(vm.runInContext('MMP.matchTerm("sociabilité", "IA")', context), false);
  assert.equal(vm.runInContext('MMP.matchTerm("IA", "IA")', context), true);
  assert.equal(vm.runInContext('MMP.matchTerm("actualité : IA, demain", "IA")', context), true);
  assert.equal(vm.runInContext('MMP.matchTerm("I A", "IA")', context), false);
});

test("internal cinema phrase signals keep their original exact-phrase behavior", () => {
  assert.equal(vm.runInContext('MMP.isCinemaSignal("TV shows")', context), true);
  assert.equal(vm.runInContext('MMP.isCinemaSignal("TV news and shows")', context), false);
});

test("multi-word terms require every whole word, regardless of order or distance", () => {
  const matches = (title, term) => vm.runInContext(`MMP.matchTerm(${JSON.stringify(title)}, ${JSON.stringify(term)})`, context);
  assert.equal(matches("L'IA révolutionne WordPress", "IA WordPress"), true);
  assert.equal(matches("WordPress adopte de nouveaux outils d'IA", "IA WordPress"), true);
  assert.equal(matches("Comment utiliser l'IA générative avec WordPress", "IA WordPress"), true);
  assert.equal(matches("WordPress multisite intègre une nouvelle IA", "IA multisite WordPress"), true);
  assert.equal(matches("WordPress intègre une nouvelle IA", "IA multisite WordPress"), false);
  assert.equal(matches("WordPress s'améliore", "IA WordPress"), false);
  assert.equal(matches("Les dernières nouveautés de l'IA", "IA WordPress"), false);
  assert.equal(matches("Les meilleures extensions WordPress", "IA WordPress"), false);
});

test("multi-word matching ignores case and accents and preserves whole-word boundaries", () => {
  const matches = (title, term) => vm.runInContext(`MMP.matchTerm(${JSON.stringify(title)}, ${JSON.stringify(term)})`, context);
  assert.equal(matches("L'INTELLIGENCE ARTIFICIELLE et WordPress", "intelligence artificielle wordpress"), true);
  assert.equal(matches("Le résumé est déjà publié sur WordPress", "resume wordpress"), true);
  assert.equal(matches("IA WordPresses", "IA WordPress"), false);
  assert.equal(matches("WordPress IAmazing", "IA WordPress"), false);
  assert.equal(matches("L'IA : WordPress", "IA WordPress"), true);
  assert.equal(matches("", "   "), false);
});

test("single-word filters retain the same matching behavior across shared consumers", () => {
  const matchTerm = vm.runInContext("MMP.matchTerm", context);
  const article = { title: "L'IA révolutionne WordPress", summary: "Nouveaux outils", categories: ["Technologie"] };
  const automaticWallFilter = terms => terms.some(term => matchTerm(`${article.title} ${article.summary}`, term));
  const priorityFilter = terms => terms.some(term => matchTerm([article.title, article.summary, ...article.categories].join(" "), term));
  assert.equal(automaticWallFilter(["WordPress IA"]), true);
  assert.equal(priorityFilter(["WordPress IA"]), true);
  assert.equal(automaticWallFilter(['"révolutionne WordPress"']), true);
  assert.equal(priorityFilter(['"révolutionne WordPress"']), true);
  assert.equal(automaticWallFilter(["révolutionne"]), true);
  assert.equal(priorityFilter(["technologie"]), true);
  assert.equal(automaticWallFilter(["inconnu", '"révolutionne WordPress"']), true);
  assert.equal(priorityFilter(["inconnu", '"révolutionne WordPress"']), true);
});

test("quoted phrases match in order and consecutively", () => {
  const matches = (title, term) => vm.runInContext(`MMP.matchTerm(${JSON.stringify(title)}, ${JSON.stringify(term)})`, context);
  assert.equal(matches("Créer un site web vitrine", "site vitrine"), true);
  assert.equal(matches("Créer un site web vitrine", '"site vitrine"'), false);
  assert.equal(matches("Créer un site vitrine", '"site vitrine"'), true);
  assert.equal(matches("Découvrez IA WordPress aujourd'hui", '"IA WordPress"'), true);
  assert.equal(matches("IA générative pour WordPress", '"IA WordPress"'), false);
  assert.equal(matches("WordPress adopte IA", '"IA WordPress"'), false);
  assert.equal(matches("IA   WordPress", '"IA WordPress"'), true);
});

test("mixed and multiple quoted phrases require every phrase and free word", () => {
  const matches = (title, term) => vm.runInContext(`MMP.matchTerm(${JSON.stringify(title)}, ${JSON.stringify(term)})`, context);
  assert.equal(matches("IA WordPress : sécurité renforcée", '"IA WordPress" sécurité'), true);
  assert.equal(matches("IA WordPress", '"IA WordPress" sécurité'), false);
  assert.equal(matches("IA pour WordPress et sécurité renforcée", '"IA WordPress" sécurité'), false);
  assert.equal(matches("IA WordPress, sécurité et cloud privé", '"IA WordPress" "sécurité cloud"'), false);
  assert.equal(matches("IA WordPress, sécurité du cloud", '"IA WordPress" "sécurité du cloud"'), true);
  assert.equal(matches("IA WordPress sécurité", '"" IA WordPress'), true);
});

test("unclosed quotes act as separators; empty quoted queries do not match", () => {
  const matches = (title, term) => vm.runInContext(`MMP.matchTerm(${JSON.stringify(title)}, ${JSON.stringify(term)})`, context);
  assert.equal(matches("WordPress parle d'IA", '"IA WordPress'), true);
  assert.equal(matches("IA WordPress", '""'), false);
  assert.equal(matches("IA WordPress", '"  "'), false);
});

test("quoted phrases normalize case and accents while preserving word boundaries", () => {
  const matches = (title, term) => vm.runInContext(`MMP.matchTerm(${JSON.stringify(title)}, ${JSON.stringify(term)})`, context);
  assert.equal(matches("RÉSUMÉ déjà publié", '"resume deja"'), true);
  assert.equal(matches("Résumé déjàpublié", '"resume deja"'), false);
});
