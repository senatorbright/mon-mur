const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL("../js/persuasion-detection.js", `file://${__filename}`), "utf8"), sandbox);
const analyze = sandbox.window.MMPersuasion.analyze;
const annotationSandbox = { window: sandbox.window, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 } };
vm.runInNewContext(fs.readFileSync(new URL("../js/persuasion-annotations.js", `file://${__filename}`), "utf8"), annotationSandbox);

test("detects repeated sentence openings and returns explicit, bounded findings", () => {
  const text = "Nous voulons comprendre les faits. Nous voulons comparer les sources. Nous voulons garder notre liberté de choix.";
  const result = analyze(text);
  assert.equal(result.version, 2);
  assert.equal(result.analyzedCharacters, text.length);
  assert.equal(result.findings[0].ruleId, "anaphora-opening");
  assert.equal(result.findings[0].certainty, "observation");
  assert.equal(result.findings[0].passage, text);
  assert.ok(result.findings[0].explanation);
  assert.ok(result.findings[0].possibleEffect);
  assert.equal(result.findings[0].start, 0);
  assert.equal(result.findings[0].end, text.length);
});

test("recognizes corrective opposition and concession while suppressing a plain list", () => {
  const result = analyze("Ce choix n’est pas une facilité, mais une nécessité. Certes le délai est court, mais le résultat reste utile. Le plan prévoit des écoles, des routes, des hôpitaux et des logements.");
  const ids = new Set(result.findings.map(item => item.ruleId));
  assert.ok(ids.has("corrective-opposition"));
  assert.ok(ids.has("concession"));
  assert.equal(ids.has("rhetorical-accumulation"), false);
  assert.equal(result.candidates.enumerations.length, 1);
  assert.equal(result.candidates.enumerations[0].eligibleForDisplay, false);
});

test("recognizes the six requested structural constructions with restrained triggers", () => {
  const positives = [
    ["Ce n’est pas une erreur, c’est une faute.", "corrective-opposition"],
    ["Ce n’est ni un oubli ni un hasard, mais un choix.", "double-negation-correction"],
    ["Certes, le trajet est long, mais il est direct.", "concession"],
    ["Non seulement le trajet est long, mais il est aussi coûteux.", "cumulative-reinforcement"],
    ["Je ne voudrais pas dire qu’il ment, mais ses propos changent.", "explicit-preterition"],
    ["Nous voulons agir. Nous voulons réussir. Nous voulons avancer.", "anaphora-opening"]
  ];
  for (const [text, ruleId] of positives) assert.ok(analyze(text).findings.some(item => item.ruleId === ruleId), `${ruleId}: ${text}`);

  const negatives = [
    "Ce n’est pas une erreur de frappe.",
    "Il n’y a ni pluie ni vent aujourd’hui.",
    "Certes, le trajet est long.",
    "Non seulement le trajet est long.",
    "Je ne veux pas dire bonjour.",
    "La séance commence tôt. Le train arrive ensuite. Le magasin ferme tard."
  ];
  for (const text of negatives) assert.equal(analyze(text).findings.length, 0, text);
});

test("publishes one pedagogical card per supported figure from detector metadata", () => {
  const catalog = sandbox.window.MMPersuasion.catalog;
  assert.equal(catalog.length, 29);
  assert.equal(new Set(catalog.map(item => item.id)).size, catalog.length);
  assert.deepEqual(new Set(catalog.flatMap(item => [...item.ruleIds])), new Set([
    "anaphora-opening", "parallel-cest-infinitive", "corrective-opposition", "double-negation-correction",
    "concession", "cumulative-reinforcement", "explicit-preterition", "rhetorical-accumulation",
    "repeated-reduplicated-formula", "promotional-simplicity", "presupposed-debate-frame", "readiness-pressure",
    "unmissable-opportunity", "near-term-urgency", "contrastive-role-model", "hypothetical-scenario",
    "experience-based-credibility", "flattering-altruistic-appeal", "minimized-effort", "positive-outcome-presupposition",
    "message-perception-gap", "knowledge-needed-for-choice", "forced-choice", "warning-list", "suspense-reversal",
    "accusatory-causal-frame", "scale-then-challenge", "worsening-reversal", "contrastive-reframing", "nuance-counterclaim"
  ]));
  assert.ok(catalog.every(item => item.name && item.family && item.definition && item.example && item.highlight && item.mechanism && item.effect && item.limits));
  const read = path => fs.readFileSync(new URL(path, `file://${__filename}`), "utf8");
  assert.match(read("../settings.html"), /Catalogue des techniques/u);
  assert.match(read("../persuasion-catalog.html"), /js\/persuasion-detection\.js/u);
  assert.match(read("../persuasion-catalog.html"), /js\/persuasion-catalog\.js/u);
});

test("detects persuasion structures across case and punctuation variants", () => {
  const cases = [
    ["ACCEPTEZ notre IA ou renoncez à votre moteur de recherche.", "forced-choice"],
    ["Faites attention à ces 5 red flags avant de vous engager.", "warning-list"],
    ["Tout fonctionne. C'est exactement là que le problème commence.", "suspense-reversal"],
    ["Il a trouvé le coupable idéal : les moteurs IA.", "accusatory-causal-frame"],
    ["25 applications, 100 agents en production. Où est le cash-flow ?", "scale-then-challenge"],
    ["L’IA ne réglera pas ce problème. Elle risque même de l’aggraver.", "worsening-reversal"],
    ["On regarde l’outil. Moi, je regarde le travail.", "contrastive-reframing"],
    ["Je lis partout qu’une personne fait le travail de cinq. La vérité est plus nuancée.", "nuance-counterclaim"]
  ];
  for (const [text, ruleId] of cases) assert.ok(analyze(text).findings.some(item => item.ruleId === ruleId), `${ruleId}: ${text}`);
});

test("separates corrective opposition from concession and allows an explicit two-sentence correction", () => {
  const correction = analyze("Je ne parlerais pas d’échec. Il s’agit plutôt d’une transition.");
  assert.ok(correction.findings.some(item => item.ruleId === "corrective-opposition"));
  assert.equal(correction.findings.some(item => item.ruleId === "concession"), false);
  const crossLine = "🙂 Je ne parlerais pas d’échec.\nIl s’agit plutôt d’une transition.";
  const crossLineFinding = analyze(crossLine).findings.find(item => item.ruleId === "corrective-opposition");
  assert.ok(crossLineFinding);
  assert.equal(crossLine.slice(crossLineFinding.start, crossLineFinding.end).replace(/\s+/gu, " ").trim(), crossLineFinding.passage);
  assert.equal(analyze("Ce n’est pas facile, mais nous y arriverons.").findings.some(item => item.ruleId === "corrective-opposition"), false);
  assert.ok(analyze("Ce n’est pas une erreur, mais un choix.").findings.some(item => item.ruleId === "corrective-opposition"));
  assert.equal(analyze("Ce n’est pas une erreur. Mais le calendrier reste serré.").findings.some(item => item.ruleId === "corrective-opposition"), false);
});

test("handles additional list markers and accent-sensitive starters without shifting highlights", () => {
  const accumulation = analyze("Cette mesure concerne les écoles, les routes et les services publics, à plus forte raison les hôpitaux.");
  assert.ok(accumulation.findings.some(item => item.ruleId === "rhetorical-accumulation"));
  const urgency = analyze("Un rendez-vous à ne pas manquer.");
  const finding = urgency.findings.find(item => item.ruleId === "unmissable-opportunity");
  assert.ok(finding);
  assert.equal("Un rendez-vous à ne pas manquer.".slice(finding.highlightRanges[0].start, finding.highlightRanges[0].end), "à ne pas manquer");
  const readinessText = "Un changement s’annonce. Êtes-vous prêts à vous adapter ?";
  const readiness = analyze(readinessText).findings.find(item => item.ruleId === "readiness-pressure");
  assert.ok(readiness);
  assert.equal(readinessText.slice(readiness.highlightRanges[0].start, readiness.highlightRanges[0].end), "Êtes-vous prêts à vous adapter ?");
});

test("generalizes ultimatum and suspense structures beyond their original wording", () => {
  const positives = [
    ["Refusez notre IA et vous perdrez l’accès au moteur de recherche.", "forced-choice"],
    ["Sans activation de notre IA, votre accès au moteur sera suspendu.", "forced-choice"],
    ["Tout semblait fonctionner. C’est alors que les ennuis ont commencé.", "suspense-reversal"],
    ["Tout paraissait normal. C’est précisément ici que les difficultés commencent.", "suspense-reversal"],
    ["La situation semblait sous contrôle. Le véritable risque apparaît ensuite.", "suspense-reversal"],
    ["La situation semblait sous contrôle. Les difficultés sont apparues ensuite.", "suspense-reversal"]
  ];
  for (const [text, ruleId] of positives) assert.ok(analyze(text).findings.some(item => item.ruleId === ruleId), `${ruleId}: ${text}`);

  const neutral = [
    "Vous pouvez choisir l’IA ou conserver votre moteur de recherche.",
    "L’accès au moteur sera suspendu mardi pour maintenance.",
    "Tout semblait fonctionner. Les ennuis ont commencé mardi après la panne."
  ];
  for (const text of neutral) assert.equal(analyze(text).findings.some(item => ["forced-choice", "suspense-reversal"].includes(item.ruleId)), false, text);
});

test("covers every registered rule with an independent positive and a near-miss negative", () => {
  const cases = [
    ["anaphora-opening", "Ils promettent la vitesse. Ils promettent la simplicité. Ils promettent le succès.", "Ils promettent la vitesse. Nous visons la simplicité. Ils décrivent le succès."],
    ["parallel-cest-infinitive", "C’est réduire les délais. C’est simplifier le parcours.", "C’est réduire les délais. C’est une priorité."],
    ["corrective-opposition", "Ce n’est pas une erreur, mais un choix.", "Ce n’est pas facile, mais nous y arriverons."],
    ["double-negation-correction", "Ce n’est ni un oubli ni un hasard, mais une décision.", "Il n’y a ni pluie ni vent aujourd’hui."],
    ["concession", "Même si le trajet est long, il reste direct.", "Certes, le trajet est long."],
    ["cumulative-reinforcement", "Non seulement le délai est court, mais il est aussi coûteux.", "Le délai est court et le tarif est connu."],
    ["explicit-preterition", "Je ne voudrais pas rappeler qu’il a changé trois fois d’avis.", "Je ne veux pas dire bonjour."],
    ["rhetorical-accumulation", "La mesure concerne les écoles, les routes et même les hôpitaux.", "La mesure concerne les écoles, les routes et les hôpitaux."],
    ["repeated-reduplicated-formula", "Un accord gagnant-gagnant. Puis un projet gagnant-gagnant.", "Un accord gagnant-gagnant."],
    ["promotional-simplicity", "Le tout en un seul clic.", "L’opération nécessite deux clics."],
    ["presupposed-debate-frame", "La question n’est plus de savoir si l’outil va évoluer, mais comment.", "La question est de savoir si l’outil va évoluer."],
    ["readiness-pressure", "Êtes-vous prêts à vous adapter à cette évolution ?", "Êtes-vous prêts pour la réunion ?"],
    ["unmissable-opportunity", "Une rencontre à ne pas manquer.", "Je ne manque jamais le train."],
    ["near-term-urgency", "Dans tout juste une semaine, la décision sera prise.", "La décision sera prise dans une semaine."],
    ["contrastive-role-model", "Pendant que certains hésitent, elle a choisi d’avancer.", "Certains hésitent tandis que d’autres attendent."],
    ["hypothetical-scenario", "Imaginez un graphiste qui découvre le résultat.", "Un graphiste découvre le résultat."],
    ["experience-based-credibility", "Nous avons récemment accompagné un grand groupe.", "Le groupe a récemment publié ses résultats."],
    ["flattering-altruistic-appeal", "Je recherche de généreuses personnes pour nous aider.", "De généreuses personnes ont répondu à l’enquête."],
    ["minimized-effort", "Vous pouvez réussir juste en suivant une règle simple.", "Une règle simple est décrite dans le rapport."],
    ["positive-outcome-presupposition", "Comment cette méthode peut-elle devenir un levier de création de valeur ?", "Comment la valeur est-elle calculée dans ce rapport ?"],
    ["message-perception-gap", "Ce que vous dites de votre marque n’est plus forcément ce que vos clients perçoivent.", "Ce que vous dites de votre marque est repris dans le rapport."],
    ["knowledge-needed-for-choice", "Pour faire les bons choix, encore faut-il comprendre les enjeux.", "Le rapport explique les choix effectués."],
    ["forced-choice", "Acceptez notre outil ou renoncez à ce service.", "Vous pouvez choisir l’outil ou conserver le service."],
    ["warning-list", "Attention à ces cinq erreurs avant de signer.", "Attention, le bureau ferme à dix-huit heures."],
    ["suspense-reversal", "Tout semblait aller bien. C’est alors que les difficultés ont commencé.", "Tout semblait aller bien. Les difficultés ont commencé mardi après la panne."],
    ["accusatory-causal-frame", "Il a trouvé le coupable idéal : les nouveaux outils.", "L’enquête cherche les causes des retards."],
    ["scale-then-challenge", "25 outils, 100 projets, des millions investis. Où sont les résultats ?", "25 outils. 100 projets. Les résultats sont publiés dans le rapport."],
    ["worsening-reversal", "Cela ne réglera pas le problème. Cela pourrait même l’aggraver.", "Cela ne réglera pas le problème. Une autre équipe le prendra en charge."],
    ["contrastive-reframing", "On regarde l’outil. Moi, je regarde le travail.", "On regarde l’outil. Moi, je regarde l’outil."],
    ["nuance-counterclaim", "On entend que l’IA remplace cinq personnes. La réalité est plus nuancée.", "La réalité est nuancée par plusieurs facteurs."]
  ];
  const registered = new Set(sandbox.window.MMPersuasion.catalog.flatMap(item => [...item.ruleIds]));
  assert.deepEqual(new Set(cases.map(([id]) => id)), registered, "the independent matrix covers every detector rule exactly once");
  const auditDoc = fs.readFileSync(new URL("../docs/persuasion-detection.fr.md", `file://${__filename}`), "utf8");
  for (const ruleId of registered) assert.ok(auditDoc.includes(`| \`${ruleId}\` —`), `audit table includes ${ruleId}`);
  for (const [ruleId, positive, negative] of cases) {
    const findings = analyze(positive).findings.filter(item => item.ruleId === ruleId);
    assert.ok(findings.length, `positive ${ruleId}: ${positive}`);
    for (const finding of findings) {
      assert.ok(finding.start >= 0 && finding.end <= positive.length && finding.start < finding.end, `bounded passage ${ruleId}`);
      assert.ok(finding.highlightRanges.length, `highlight present ${ruleId}`);
      for (const range of finding.highlightRanges) assert.ok(range.start >= 0 && range.end <= positive.length && range.start < range.end, `bounded highlight ${ruleId}`);
    }
    assert.equal(analyze(negative).findings.some(item => item.ruleId === ruleId), false, `negative ${ruleId}: ${negative}`);
  }
});

test("does not treat isolated fear words, numbers, questions, or warnings as persuasion structures", () => {
  const neutral = [
    "Attention, le bureau ferme à dix-huit heures.",
    "Le risque mesuré est de 12 %.",
    "25 applications sont disponibles.",
    "Où se trouve le bureau ?",
    "Le problème commence après la mise à jour."
  ];
  for (const text of neutral) assert.equal(analyze(text).findings.length, 0, text);
});

test("treats timestamped YouTube chapters as structure without suppressing numeric arguments elsewhere", () => {
  const chapters = [
    "08:44 — Configurer Elementor pour l’IA",
    "09:27 — Activer Elementor MCP",
    "09:53 — Télécharger Codex et ChatGPT Astra",
    "11:13 — Codex ou Claude pour WordPress ?",
    "12:14 — Prix et forfaits de ChatGPT Astra",
    "13:02 — Qu’est-ce qu’Elementor MCP ?"
  ].join("\n");
  assert.deepEqual(JSON.parse(JSON.stringify(analyze(chapters).findings)), [], "chapter labels and timestamps are excluded from persuasion analysis");

  const withArgument = `${chapters}\n\n25 outils, 100 projets et des millions investis. Où sont les résultats ?`;
  assert.ok(analyze(withArgument).findings.some(item => item.ruleId === "scale-then-challenge"), "real quantitative prose after a chapter list remains eligible");
});

test("keeps ordinary action and product lists as hidden candidates without reporting them", () => {
  const text = "Avant Noël, il faut réparer, peindre, nettoyer et améliorer la maison. Le marché propose décoration, créations artisanales, bijoux, accessoires, produits alimentaires…";
  const result = analyze(text);
  assert.equal(result.findings.length, 0);
  assert.equal(result.candidates.enumerations.length, 2);
  assert.ok(result.candidates.enumerations.every(item => item.eligibleForDisplay === false));
});

test("shows an explicitly amplified accumulation with its observable marker", () => {
  const result = analyze("La crise menace les emplois, les services publics et même les libertés fondamentales.");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].ruleId, "rhetorical-accumulation");
  assert.match(result.findings[0].explanation, /et même/u);
  assert.match(result.findings[0].possibleEffect, /sans permettre d’inférer l’intention/u);
  assert.equal(result.candidates.enumerations[0].eligibleForDisplay, true);
});

test("the three article excerpts balance suppressions with structural and promotional coverage", () => {
  const noel = "Avant Noël, il faut réparer, peindre, nettoyer et améliorer la maison. Le marché propose décoration, créations artisanales, bijoux, accessoires, produits alimentaires…";
  const roubaix = "L’exposition présente des œuvres, des broderies autour de la poésie, voire des performances. Le petit bijou art déco se trouve à mille lieues des objets manufacturés. La peinture révèle la matière, la broderie donne une forme, le poème excède le cadre.";
  const vibreizh = "C’est regrouper toutes les informations au même endroit. C’est faciliter la vie des Bretons et des touristes. Le tout en un seul clic. Une formule gagnant gagnant. C’est donc une application gagnant gagnant entre consommateurs et professionnels.";
  assert.equal(analyze(noel).findings.length, 0, "ordinary Christmas preparations should stay quiet");
  assert.equal(analyze(roubaix).findings.length, 0, "isolated ‘voire’ and literary/artistic language should stay quiet");
  const findings = analyze(vibreizh).findings;
  assert.deepEqual(new Set(findings.map(item => item.ruleId)), new Set([
    "parallel-cest-infinitive", "promotional-simplicity", "repeated-reduplicated-formula"
  ]));
  assert.equal(findings.length, 3, "each report is tied to one explicit, explainable cue");
  const formula = findings.find(item => item.ruleId === "repeated-reduplicated-formula");
  assert.equal(formula.highlightRanges.length, 2);
  assert.ok(formula.highlightRanges.every(range => vibreizh.slice(range.start, range.end).toLowerCase().includes("gagnant")));
});

test("a single reduplicated expression is not reported as an article-level repeated formula", () => {
  assert.equal(analyze("Une formule gagnant gagnant entre deux partenaires.").findings.length, 0);
});

test("formats already quoted passages without doubling the French quotation marks", () => {
  assert.equal(sandbox.window.MMPersuasion.formatPassage("réparer, peindre et nettoyer"), "« réparer, peindre et nettoyer »");
  assert.equal(sandbox.window.MMPersuasion.formatPassage("« une formule déjà citée »"), "« une formule déjà citée »");
  assert.equal(sandbox.window.MMPersuasion.formatPassage("« une citation tronquée"), "« une citation tronquée »");
  assert.equal(sandbox.window.MMPersuasion.formatPassage("“quoted already”"), "« quoted already »");
});

test("maps text across formatted elements and links without flattening their DOM structure", () => {
  const text = value => ({ nodeType: 3, nodeValue: value });
  const element = (tagName, children = [], className = "") => ({
    nodeType: 1, tagName, childNodes: children, hidden: false, className,
    getAttribute: () => null,
    matches: selector => selector.split(",").some(item => item.trim().startsWith(".") && className.split(/\s+/u).includes(item.trim().slice(1)))
  });
  const regrouper = text("regrouper"), linkText = text("informations");
  const link = element("A", [linkText]);
  const root = element("DIV", [element("P", [text("C’est "), element("STRONG", [regrouper]), text(" toutes les "), link, text(" au même endroit.")]), element("P", [text("C’est faciliter la vie.")])]);
  const mapped = annotationSandbox.window.MMPersuasionAnnotations.collectTextMap(root);
  assert.equal(mapped.text, "C’est regrouper toutes les informations au même endroit.\nC’est faciliter la vie.");
  const verbPosition = mapped.text.indexOf("regrouper");
  assert.equal(mapped.map[verbPosition].node, regrouper);
  assert.equal(mapped.map[verbPosition].offset, 0);
  const linkPosition = mapped.text.indexOf("informations");
  assert.equal(mapped.map[linkPosition].node, linkText);
  assert.equal(mapped.map[linkPosition].offset, 0);
});

test("merges overlapping annotations into stable, non-nested text segments", () => {
  const node = {};
  const map = [..."abcdefghij"].map((_, offset) => ({ node, offset }));
  const segments = annotationSandbox.window.MMPersuasionAnnotations.planHighlights(map, [
    { start: 1, end: 5 },
    { start: 3, end: 7 }
  ]).get(node);
  assert.equal(JSON.stringify(segments.map(({ start, end, ids }) => ({ start, end, ids }))), JSON.stringify([
    { start: 1, end: 3, ids: [0] },
    { start: 3, end: 5, ids: [0, 1] },
    { start: 5, end: 7, ids: [1] }
  ]));
});

test("does not flag ordinary short factual sentences", () => {
  assert.equal(analyze("La séance commence à neuf heures. Le conseil publie son compte rendu.").findings.length, 0);
});

test("caps very long input and keeps all quote ranges inside analyzed text", () => {
  const result = analyze("Nous observons les données. ".repeat(20000));
  assert.equal(result.analyzedCharacters, 300000);
  assert.ok(result.findings.every(item => item.start >= 0 && item.end <= result.analyzedCharacters));
});

test("the local detector, preference switch and backup setting are wired into the extension", () => {
  const read = path => fs.readFileSync(new URL(path, `file://${__filename}`), "utf8");
  const wall = read("../wall.html"), wallCode = read("../js/wall.js"), annotationsCode = read("../js/persuasion-annotations.js"), settings = read("../settings.html"), settingsCode = read("../js/settings.js"), background = read("../js/background.js");
  assert.ok(wall.indexOf("js/persuasion-annotations.js") < wall.indexOf("js/wall.js"));
  assert.match(wallCode, /MMPersuasionAnnotations\?\.render/);
  assert.doesNotMatch(wallCode, /persuasion-analysis/);
  assert.match(annotationsCode, /setAttribute\("role", "mark"\)/);
  assert.doesNotMatch(annotationsCode, /setAttribute\("role", "button"\)/, "speech playback removes button controls from its text clone");
  assert.match(settings, /id="smartTechniqueDetectionEnabled"/);
  assert.match(settingsCode, /persuasionDetectionEnabled:enabled,clickbaitDetectionEnabled:enabled/);
  assert.match(settingsCode, /persuasionDetectionEnabled:backup\.persuasionDetectionEnabled===true/);
  assert.match(background, /"persuasionDetectionEnabled", "clickbaitDetectionEnabled"/);
});

test("the explanation card has a clear hierarchy and click or Escape dismissal criteria", () => {
  const annotations = fs.readFileSync(new URL("../js/persuasion-annotations.js", `file://${__filename}`), "utf8");
  const styles = fs.readFileSync(new URL("../css/expand.css", `file://${__filename}`), "utf8");
  assert.match(annotations, /Techniques de persuasion — Repère détecté/u);
  assert.match(annotations, /createElement\("h3"\)/u);
  assert.match(annotations, /createElement\("h4"\)/u);
  assert.doesNotMatch(annotations, /persuasion-explanation-close|Fermer l’explication/u);
  assert.match(annotations, /if \(dialog\.contains\(event\.target\)\) \{ close\(\); return; \}/u, "a click inside the card closes it");
  assert.match(annotations, /focusedMark === mark\) \{ close\(true\); return; \}/u, "activating the open passage again closes it");
  assert.match(annotations, /event\.key === "Escape" && !dialog\.hidden\) \{ event\.preventDefault\(\); close\(true\)/u, "Escape closes and restores focus to the source passage");
  assert.match(annotations, /focusedMark\.getBoundingClientRect\(\)/u, "the explanation is positioned from the selected passage");
  assert.match(annotations, /window\.addEventListener\("scroll", onViewportChange, true\)/u, "the explanation tracks its passage while scrolling");
  assert.match(styles, /\.persuasion-explanation\{[^}]*position:fixed/u, "the explanation floats beside its passage instead of taking a later document position");
  assert.match(styles, /\.persuasion-explanation\{[^}]*background:color-mix\(in srgb,var\(--surface\) 92%,white 8%\)/u, "card background adapts to light and dark theme variables");
  assert.match(styles, /\.persuasion-explanation section\{padding:0;border:0\}/u, "avoid redundant separators around a single explanation");
});
