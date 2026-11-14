"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
global.window = {};
require("../js/clickbait-detection.js");
const detector = window.MMClickbait;
const ids = title => detector.analyze(title).map(item => item.id);

test("repère les révélations différées et leurs variantes", () => {
  assert.ok(ids("Voici pourquoi cette mesure fait débat").includes("delayed-revelation"));
  assert.ok(ids("Découvrez comment la réforme va évoluer").includes("delayed-revelation"));
});
test("repère suspense, information retenue, dramatisation et secret", () => {
  assert.ok(ids("Vous ne devinerez jamais ce qui suit").includes("explicit-suspense"));
  assert.ok(ids("Voici combien coûtera cette mesure").includes("withheld-information"));
  assert.ok(ids("Une annonce absolument incroyable secoue le secteur").includes("dramatic-wording"));
  assert.ok(ids("Ce que les professionnels ne vous disent pas sur ce produit").includes("claimed-secret"));
});
test("repère les questions vagues, promesses et listes à révélation", () => {
  assert.ok(ids("C'est quoi cette nouvelle application qui fait parler d'elle ?").includes("vague-reference-question"));
  assert.ok(ids("Cette découverte va tout changer").includes("spectacular-promise"));
  assert.ok(ids("Les cinq erreurs que vous commettez sans le savoir").includes("revealing-list"));
});
test("ne signale pas question, chiffre, superlatif ou ponctuation seuls", () => {
  assert.deepEqual(ids("Combien coûte cette application ?"), []);
  assert.deepEqual(ids("Les 5 mesures du budget !"), []);
  assert.deepEqual(ids("Le plus grand musée de la région"), []);
  assert.deepEqual(ids("Une annonce incroyable !"), []);
});
test("chaque fiche pédagogique correspond à un identifiant effectivement analysé", () => {
  const recognized = new Set(detector.catalog.map(item => item.id));
  for (const title of ["Voici pourquoi", "Vous ne devinerez jamais", "Voici combien", "C'est quoi cette nouvelle application ?", "va tout changer", "absolument incroyable", "ne vous disent pas", "Les cinq erreurs que vous commettez sans le savoir"]) {
    for (const finding of detector.analyze(title)) assert.ok(recognized.has(finding.id));
  }
  assert.equal(detector.catalog.length, 14);
});

test("six formulations de presse fournies sont reconnues et les trois titres informatifs restent neutres", () => {
  const cases = [
    ["ChatGPT bientôt connecté à Google Health : l'IA s'attaque à vos données les plus intimes", "personal-stakes-dramatization"],
    ["Apple préparerait un grand renouvellement de ses iPad en 2027, mais tous n'auront pas droit aux mêmes nouveautés", "unequal-reveal"],
    ["L'armée française vient de recevoir un Rafale pas comme les autres, qui va préparer le futur Rafale F5", "unspecified-exception"],
    ["Toujours plus loin, GTA 6 s'affiche jusqu'au Stade de France, et ce n'est qu'une partie de sa campagne marketing XXL", "partial-revelation"],
    ["Windows 11 : Microsoft ne veut pas que vous déplaciez la barre des tâches à la souris, et pas seulement pour de bonnes raisons", "implied-improper-motive"],
    ["Google, OpenAI et Microsoft s'accordent enfin sur une règle pour protéger les contenus du Web, mais il y a un piège", "promised-catch"]
  ];
  for (const [title, expected] of cases) assert.ok(ids(title).includes(expected), `${expected}: ${title}`);
  for (const title of [
    "Snapdragon X2 Elite : un bug du pilote Adreno ralentit l'IA locale",
    "Le Canada obtient un siège au conseil des supercalculateurs d'EuroHPC",
    "La taxe au gigaoctet a été votée à une voix près : deux députés LFI disent s'être trompés de bouton",
    "La mise à jour est déjà publiée, mais sa disponibilité varie selon les régions",
    "Les tests continuent encore cette semaine"
  ]) assert.deepEqual(ids(title), [], title);
});

test("le réglage est persistant, restaurable et relié aux titres des cartes", () => {
  const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const defaults = read("js/core.js"), background = read("js/background.js"), settings = read("js/settings.js"), wall = read("js/wall.js");
  assert.match(defaults, /clickbaitDetectionEnabled:\s*false/);
  assert.match(background, /"clickbaitDetectionEnabled"/);
  assert.match(settings, /function persistSmartFilterSettings\(patch\)\{return sendSettingsSave\(\{type:"saveSmartFilterSettings",settings:patch\}\);\}/);
  assert.match(settings, /persistSmartFilterSettings\(\{persuasionDetectionEnabled:enabled,clickbaitDetectionEnabled:enabled\}\)/);
  assert.match(settings, /clickbaitDetectionEnabled:backup\.clickbaitDetectionEnabled===true/);
  assert.match(settings, /clickbaitDetectionEnabled:stored\.settings\.clickbaitDetectionEnabled===true/);
  assert.match(wall, /MMClickbaitAnnotations\?\.annotate\(clickbaitTarget,clickbaitText,readInlineArticle,clickbaitSourceLink\)/);
  assert.match(wall, /changes\.settings\.newValue\?\.clickbaitDetectionEnabled[^;]*node\.refreshClickbait\?\.\(\)/);
  assert.match(wall, /blueskyPostText\|\|link/);
  assert.match(wall, /renderPersuasionFindings\(articleBody,content\)/);
  assert.match(wall, /analysisRoot=content\.querySelector\("\.bluesky-full-text,\.bluesky-linked-content,\.video-description"\)\|\|content/);
});

test("le clic simple explique, les commandes alternatives naviguent et Escape ferme", () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "../js/clickbait-annotations.js"), "utf8");
  assert.match(source, /event\.metaKey\s*\|\|\s*event\.ctrlKey\s*\|\|\s*event\.shiftKey/);
  assert.match(source, /event\.preventDefault\(\);\s*show\(title, findings, readInWall, sourceLink\)/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /title\.after\(box\)/);
  assert.match(source, /Lire l’article/);
  assert.match(source, /Ouvrir sur le site d’origine/);
  assert.match(source, /await readInWall\?\.\(\)/);
  assert.match(source, /role", "dialog"/);
});
