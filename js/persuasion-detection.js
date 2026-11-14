"use strict";

// Local, rule-based observations only. This module never evaluates truth,
// ideology, author intent, or the persuasive success of a passage.
window.MMPersuasion = (() => {
  const VERSION = 2;
  const CATALOG = Object.freeze([
    { id: "anaphora", ruleIds: ["anaphora-opening", "parallel-cest-infinitive"], name: "Anaphore et parallélisme", family: "construction rhétorique", definition: "Des mots ou une structure reviennent au début de propositions successives.", example: "Nous voulons agir. Nous voulons réussir. Nous voulons avancer.", highlight: "Nous voulons", mechanism: "La reprise en tête relie plusieurs propositions et leur donne un rythme commun.", effect: "Elle peut rendre les idées plus mémorables et accentuer leur parallélisme.", limits: "Le détecteur repère trois phrases partageant leurs deux premiers mots, ou deux phrases construites avec « C’est + infinitif »." },
    { id: "corrective-opposition", ruleIds: ["corrective-opposition"], name: "Opposition corrective", family: "construction rhétorique", definition: "Une première formulation est écartée au profit d’une seconde.", example: "Ce n’est pas une erreur, c’est une faute.", highlight: "Ce n’est pas une erreur, c’est une faute", mechanism: "La négation prépare une reformulation présentée comme plus juste ou plus forte.", effect: "La seconde interprétation peut prendre le dessus dans la lecture.", limits: "Une opposition de forme ne prouve pas que la reformulation soit plus exacte." },
    { id: "double-negation", ruleIds: ["double-negation-correction"], name: "Négations successives suivies d’une affirmation", family: "construction rhétorique", definition: "Plusieurs possibilités sont écartées avant qu’une autre soit affirmée.", example: "Ce n’est ni un oubli ni un hasard, mais un choix.", highlight: "ni un oubli ni un hasard, mais un choix", mechanism: "Les négations encadrent et préparent l’affirmation finale.", effect: "La conclusion peut sembler plus nette par contraste avec les options rejetées.", limits: "La règle cible la structure explicite « ni… ni…, mais… »; elle n’évalue pas la validité de la conclusion." },
    { id: "concession", ruleIds: ["concession"], name: "Concession et réfutation", family: "construction rhétorique", definition: "Une réserve est reconnue avant qu’un contraste ou une réponse soit mis en avant.", example: "Certes, le trajet est long, mais il est direct.", highlight: "Certes, le trajet est long, mais il est direct", mechanism: "Un marqueur de concession est rapproché d’un marqueur de contraste.", effect: "La seconde proposition peut orienter la façon dont la réserve est pesée.", limits: "Les marqueurs peuvent apparaître sans relation argumentative réelle; le contexte reste nécessaire." },
    { id: "cumulative-reinforcement", ruleIds: ["cumulative-reinforcement"], name: "Renforcement cumulatif", family: "construction rhétorique", definition: "Un second élément s’ajoute à un premier avec une formule de renforcement.", example: "Non seulement le trajet est long, mais il est aussi coûteux.", highlight: "Non seulement le trajet est long, mais il est aussi coûteux", mechanism: "La formule annonce une addition et relie les deux propositions comme des arguments convergents.", effect: "L’accumulation peut renforcer l’impression créée par l’affirmation.", limits: "La structure indique un ajout; elle ne permet pas de juger si les arguments sont justes ou importants." },
    { id: "preterition", ruleIds: ["explicit-preterition"], name: "Prétérition explicite", family: "construction rhétorique", definition: "Le locuteur dit qu’il ne va pas évoquer une idée, tout en la faisant apparaître.", example: "Je ne voudrais pas dire qu’il ment, mais ses propos changent.", highlight: "Je ne voudrais pas dire qu’il ment", mechanism: "La réserve verbale attire l’attention sur le contenu qu’elle prétend laisser de côté.", effect: "L’idée peut être suggérée tout en étant présentée comme retenue.", limits: "La règle reconnaît quelques formules explicites; une négation ordinaire ne suffit pas." },
    { id: "rhetorical-accumulation", ruleIds: ["rhetorical-accumulation"], name: "Accumulation avec amplification explicite", family: "construction rhétorique", definition: "Une liste est prolongée par un marqueur qui ajoute ou étend ses éléments.", example: "La mesure touche les écoles, les routes et même les hôpitaux.", highlight: "les écoles, les routes et même les hôpitaux", mechanism: "Un marqueur comme « et même » signale un élément ajouté à une énumération.", effect: "L’ajout peut donner une impression d’extension ou de montée en intensité.", limits: "Les listes ordinaires restent masquées; « voire » isolé ne déclenche pas cette règle." },
    { id: "repeated-reduplicated-formula", ruleIds: ["repeated-reduplicated-formula"], name: "Formule redoublée réemployée", family: "indice de persuasion", definition: "Une expression redoublée telle que « gagnant gagnant » réapparaît dans plusieurs phrases.", example: "Un accord gagnant gagnant. Puis un projet gagnant gagnant.", highlight: "gagnant gagnant", mechanism: "La répétition remet en circulation la même formule valorisante.", effect: "Elle peut maintenir un cadrage positif dans le texte.", limits: "Une seule occurrence n’est pas signalée; la répétition ne valide pas la promesse." },
    { id: "promotional-simplicity", ruleIds: ["promotional-simplicity"], name: "Formulation promotionnelle de simplicité", family: "indice de persuasion", definition: "Une action ou un service est présenté comme réalisable en une seule étape.", example: "Le tout en un seul clic.", highlight: "en un seul clic", mechanism: "La formule résume l’usage à une action unique.", effect: "Elle peut réduire la complexité perçue.", limits: "Elle ne suffit pas à établir que la promesse soit exagérée ou trompeuse." },
    { id: "presupposed-debate-frame", ruleIds: ["presupposed-debate-frame"], name: "Présupposition et cadrage du débat", family: "cadrage argumentatif", definition: "La formulation écarte une question de principe et présente la suite comme le seul débat restant.", example: "La question n’est plus de savoir si l’IA va transformer les entreprises, mais comment.", highlight: "La question n’est plus de savoir si… mais comment", mechanism: "La structure « la question n’est plus de savoir si…, mais comment… » traite l’événement comme acquis.", effect: "Elle peut rendre moins visibles les positions qui contestent la prémisse.", limits: "La règle porte sur cette structure explicite; elle ne vérifie pas si la prémisse est vraie." },
    { id: "readiness-pressure", ruleIds: ["readiness-pressure"], name: "Interpellation et pression à l’adaptation", family: "pression à l’action", definition: "Une question directe associe la préparation du lecteur à un changement ou à une adaptation présentés comme nécessaires.", example: "L’IA change les métiers. Êtes-vous prêts à changer avec eux ?", highlight: "Êtes-vous prêts à changer", mechanism: "La question s’adresse au lecteur et relie son état de préparation à une transformation annoncée.", effect: "Elle peut faire ressentir une pression à suivre le changement.", limits: "Une question directe ordinaire n’est pas signalée sans cette association." },
    { id: "unmissable-opportunity", ruleIds: ["unmissable-opportunity"], name: "Occasion présentée comme incontournable", family: "urgence et rareté", definition: "Une occasion est formulée comme quelque chose qu’il ne faudrait pas manquer.", example: "Une rencontre à ne pas manquer.", highlight: "à ne pas manquer", mechanism: "La tournure présente l’absence à l’événement comme une perte possible.", effect: "Elle peut créer une crainte de manquer une occasion ou un bénéfice.", limits: "Le repère ne mesure ni l’importance réelle de l’événement ni la disponibilité des places." },
    { id: "near-term-urgency", ruleIds: ["near-term-urgency"], name: "Échéance rapprochée mise en avant", family: "urgence et rareté", definition: "Une échéance très proche est soulignée par une formule temporelle insistante.", example: "Dans tout juste une semaine.", highlight: "tout juste une semaine", mechanism: "L’expression « tout juste » insiste sur le faible délai avant l’événement.", effect: "Elle peut accélérer la décision ou l’inscription.", limits: "Une date proche seule ne démontre pas une urgence artificielle." },
    { id: "contrastive-role-model", ruleIds: ["contrastive-role-model"], name: "Opposition valorisante", family: "contraste et comparaison", definition: "Un personnage est mis en valeur par contraste avec un groupe présenté comme hésitant ou inquiet.", example: "Pendant que certains redoutent l’IA, lui a choisi de la maîtriser.", highlight: "Pendant que certains… lui a choisi", mechanism: "La construction oppose deux attitudes et associe l’une d’elles à un choix présenté comme actif ou avantageux.", effect: "Elle peut valoriser le comportement proposé par comparaison.", limits: "Le contraste ne suffit pas à établir que les groupes soient réellement opposés ni que le choix mène au succès." },
    { id: "hypothetical-scenario", ruleIds: ["hypothetical-scenario"], name: "Mise en situation", family: "scénarisation", definition: "Le lecteur est invité à se représenter une scène ou un personnage hypothétique.", example: "Imaginez un graphiste qui déclare fièrement…", highlight: "Imaginez un graphiste", mechanism: "L’impératif « imaginez » ouvre une scène illustrative plutôt qu’un fait établi par le titre.", effect: "La scène peut rendre une idée plus concrète et plus facile à se représenter.", limits: "Une mise en situation est une forme d’illustration, pas en elle-même une preuve ou une manipulation." },
    { id: "experience-based-credibility", ruleIds: ["experience-based-credibility"], name: "Crédibilité appuyée sur une expérience revendiquée", family: "crédibilité et preuve sociale", definition: "Le locuteur met en avant une expérience auprès d’une organisation importante pour soutenir son propos.", example: "Nous avons récemment accompagné un grand groupe.", highlight: "accompagné un grand groupe", mechanism: "Une expérience professionnelle est utilisée comme signal de proximité avec le sujet ou de crédibilité.", effect: "Elle peut renforcer la confiance accordée au propos qui suit.", limits: "La référence à un client ou à une marque n’est pas, à elle seule, un argument abusif; le détecteur ne vérifie ni le mandat ni les résultats." },
    { id: "flattering-altruistic-appeal", ruleIds: ["flattering-altruistic-appeal"], name: "Flatterie et appel à l’altruisme", family: "valorisation du lecteur", definition: "Une sollicitation qualifie favorablement les personnes qui accepteraient d’aider.", example: "Je recherche de très généreuses personnes pour nous faire des retours.", highlight: "très généreuses personnes", mechanism: "L’aide demandée est associée à une qualité morale valorisante.", effect: "La personne sollicitée peut être encouragée à accepter pour être à la hauteur de cette qualité.", limits: "La formule peut être sincère; elle ne démontre pas une intention de pression." },
    { id: "minimized-effort", ruleIds: ["minimized-effort"], name: "Effort présenté comme minimal", family: "promesse de simplicité", definition: "Une tâche est présentée comme facile ou peu exigeante au moyen d’une formule de simplicité.", example: "Juste en suivant une règle simple.", highlight: "juste en suivant une règle simple", mechanism: "« Juste » et « simple » réduisent verbalement la difficulté attribuée à l’action.", effect: "La tâche peut sembler plus accessible et moins coûteuse en effort.", limits: "Le repère ne mesure pas la difficulté réelle de la tâche." },
    { id: "positive-outcome-presupposition", ruleIds: ["positive-outcome-presupposition"], name: "Bénéfice présupposé dans une question", family: "cadrage argumentatif", definition: "Une question demande comment obtenir un bénéfice, en présupposant que le résultat positif est possible.", example: "Comment l’IA peut-elle devenir un moteur de création de valeur ?", highlight: "Comment l’IA peut-elle devenir un moteur de création de valeur", mechanism: "La question porte sur la manière d’obtenir le bénéfice plutôt que sur son existence ou ses conditions.", effect: "Elle peut orienter la réflexion vers un résultat favorable déjà posé comme accessible.", limits: "La question n’affirme pas que le bénéfice est démontré; le contexte peut précisément chercher à l’évaluer." },
    { id: "message-perception-gap", ruleIds: ["message-perception-gap"], name: "Écart entre image voulue et perception", family: "cadrage et inquiétude", definition: "Le titre oppose l’image communiquée par une organisation à celle que ses publics perçoivent.", example: "Ce que vous dites de votre marque n’est plus forcément ce que vos publics voient.", highlight: "n’est plus forcément ce que vos publics voient", mechanism: "La formulation met en contraste le message contrôlé et la perception extérieure.", effect: "Elle peut faire craindre une perte de maîtrise de l’image.", limits: "Le titre seul ne démontre ni l’existence ni l’ampleur de cet écart." },
    { id: "knowledge-needed-for-choice", ruleIds: ["knowledge-needed-for-choice"], name: "Connaissance présentée comme nécessaire au bon choix", family: "promesse de connaissance utile", definition: "La compréhension d’un sujet est reliée à la capacité de prendre une bonne décision.", example: "Pour faire les bons choix, encore faut-il comprendre.", highlight: "encore faut-il comprendre", mechanism: "La formule présente une connaissance comme une condition préalable à une décision jugée bonne.", effect: "Elle peut donner envie de lire pour se sentir mieux préparé à choisir.", limits: "Le repère ne vérifie pas si l’information proposée aide réellement à prendre cette décision." },
    { id: "forced-choice", ruleIds: ["forced-choice"], name: "Choix présenté comme un ultimatum", family: "cadrage argumentatif", definition: "Deux options sont opposées, dont l’une est formulée comme une perte ou un renoncement.", example: "Acceptez notre outil ou renoncez à ce service.", highlight: "Acceptez notre outil ou renoncez à ce service", mechanism: "La structure « X ou renoncer à Y » réduit le choix à une alternative contraignante.", effect: "Elle peut rendre le refus plus coûteux en apparence.", limits: "Le passage signale une alternative formulée comme binaire; le contexte seul permet de savoir si d’autres options existent." },
    { id: "warning-list", ruleIds: ["warning-list"], name: "Avertissement suivi d’une liste", family: "captation de l’attention", definition: "Une mise en garde annonce une liste de risques ou de critères à découvrir.", example: "Attention à ces cinq erreurs avant de signer.", highlight: "Attention à ces cinq erreurs avant de signer", mechanism: "L’avertissement donne un enjeu à une liste annoncée et invite à poursuivre la lecture.", effect: "Il peut susciter l’inquiétude et la curiosité sur les éléments qui suivent.", limits: "Une mise en garde peut être utile et fondée; cette structure ne juge pas sa pertinence." },
    { id: "suspense-reversal", ruleIds: ["suspense-reversal"], name: "Renversement inquiétant après une situation normale", family: "scénarisation et inquiétude", definition: "Une situation présentée comme normale ou maîtrisée est retournée en point de départ d’un problème.", example: "Tout fonctionne. C’est exactement là que le problème commence.", highlight: "C’est exactement là que le problème commence", mechanism: "La phrase contredit l’attente créée par la situation précédente et ouvre une menace à découvrir.", effect: "Le renversement peut créer du suspense et rendre le risque plus saillant.", limits: "Le procédé narratif ne permet pas de mesurer la probabilité du risque décrit." },
    { id: "accusatory-causal-frame", ruleIds: ["accusatory-causal-frame"], name: "Désignation d’un coupable", family: "cadrage causal", definition: "Une personne, une organisation ou un phénomène est présenté comme responsable d’un problème.", example: "Il a trouvé le coupable idéal : les nouveaux outils.", highlight: "le coupable idéal : les nouveaux outils", mechanism: "La formulation attribue un rôle de responsable avant que le lien causal soit nécessairement exposé.", effect: "Elle peut simplifier une situation complexe et orienter l’attribution de responsabilité.", limits: "Le détecteur repère le cadrage accusatoire; il ne vérifie ni la causalité ni les faits." },
    { id: "scale-then-challenge", ruleIds: ["scale-then-challenge"], name: "Accumulation de chiffres suivie d’une mise en doute", family: "cadrage et contraste", definition: "Plusieurs quantités ou ordres de grandeur sont suivis d’une question qui met en doute leur valeur ou leur résultat.", example: "25 outils, 100 projets, des millions de données. Où est le résultat ?", highlight: "25 outils, 100 projets, des millions de données. Où est le résultat ?", mechanism: "Une montée en échelle crée une impression d’ampleur, puis la question déplace l’attention vers un critère manquant.", effect: "La rupture peut rendre le contraste mémorable et susciter le doute.", limits: "Les chiffres peuvent être exacts; la question ne prouve pas à elle seule l’absence de résultat." },
    { id: "worsening-reversal", ruleIds: ["worsening-reversal"], name: "Solution présentée comme risque d’aggravation", family: "renversement et inquiétude", definition: "Une solution est d’abord écartée, puis présentée comme susceptible d’aggraver le problème.", example: "Cela ne réglera pas le problème. Cela pourrait même l’aggraver.", highlight: "ne réglera pas le problème. Cela pourrait même l’aggraver", mechanism: "La seconde proposition renverse l’attente d’une amélioration et ajoute une conséquence négative.", effect: "Le retournement peut renforcer l’inquiétude liée au problème.", limits: "Le procédé ne permet pas d’évaluer si le risque d’aggravation est fondé." },
    { id: "contrastive-reframing", ruleIds: ["contrastive-reframing"], name: "Antithèse de regard ou de méthode", family: "contraste et positionnement", definition: "Deux sujets sont opposés en indiquant qu’ils portent leur attention sur des objets différents.", example: "On regarde l’outil. Moi, je regarde le travail.", highlight: "On regarde l’outil. Moi, je regarde le travail.", mechanism: "L’opposition entre un regard collectif et un regard personnel présente la seconde approche comme distincte.", effect: "Elle peut valoriser le point de vue du locuteur par contraste.", limits: "Le contraste de formulation ne prouve pas que les approches soient réellement incompatibles." },
    { id: "nuance-counterclaim", ruleIds: ["nuance-counterclaim"], name: "Contre-discours annoncé comme plus nuancé", family: "cadrage argumentatif", definition: "Une affirmation présentée comme répandue est suivie d’une réserve ou d’une annonce de nuance.", example: "On entend que l’IA remplace cinq personnes. La réalité est plus nuancée.", highlight: "La réalité est plus nuancée.", mechanism: "La structure oppose une thèse courante à une posture de rectification ou de nuance.", effect: "Elle peut présenter la suite comme une mise au point plus équilibrée.", limits: "La formule de nuance n’établit pas à elle seule que l’analyse qui suit soit effectivement équilibrée." }
  ]);
  const clean = value => String(value || "").replace(/\s+/gu, " ").trim();
  const fold = value => clean(value).replace(/[’‘ʼ]/gu, "'").normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("fr-FR");
  const unquote = value => {
    let text = clean(value);
    const pairs = [["«", "»"], ["“", "”"], ["\"", "\""], ["‘", "’"]];
    for (const [open, close] of pairs) {
      if (text.startsWith(open)) text = text.slice(open.length);
      if (text.endsWith(close)) text = text.slice(0, -close.length);
    }
    return clean(text);
  };
  const formatPassage = value => `« ${unquote(value)} »`;
  const sentenceParts = text => {
    const parts = [];
    const re = /[^.!?;\n]+[.!?;…]?/gu;
    for (const match of text.matchAll(re)) {
      const value = clean(match[0]);
      if (value.length >= 18) parts.push({ text: value, start: match.index, end: match.index + match[0].length });
    }
    return parts;
  };
  const isTimestampedChapter = value => /^\s*(?:(?:\d{1,2}:)?\d{1,2}:\d{2})\s*[—–-]\s*\S/u.test(value);
  function analyze(input) {
    const text = String(input || "").slice(0, 300000);
    const sentences = sentenceParts(text), findings = [], enumerationCandidates = [], seen = new Set();
    const add = (ruleId, category, certainty, part, explanation, possibleEffect, highlightRanges = null) => {
      const passage = clean(part.text);
      const key = `${ruleId}:${fold(passage)}`;
      if (seen.has(key)) return;
      seen.add(key);
      findings.push({ ruleId, category, certainty, passage: passage.slice(0, 600), explanation, possibleEffect, start: part.start, end: part.end, highlightRanges: highlightRanges || [{ start: part.start, end: part.end }] });
    };
    const pairParts = (first, second, fullText) => ({ start: first.start, end: second.end, text: fullText.slice(first.start, second.end) });

    // Same opening of at least two meaningful words across three sentences.
    for (let i = 0; i < sentences.length;) {
      const opening = s => fold(s.text).match(/^[\p{L}’'-]+\s+[\p{L}’'-]+/u)?.[0] || "";
      const start = opening(sentences[i]);
      if (!start) { i++; continue; }
      let j = i + 1;
      while (j < sentences.length && opening(sentences[j]) === start) j++;
      if (j - i >= 3) {
        const part = { start: sentences[i].start, end: sentences[j - 1].end, text: text.slice(sentences[i].start, sentences[j - 1].end) };
        add("anaphora-opening", "Anaphore (reprise en tête)", "observation", part,
          `Les ${j - i} phrases commencent par les mêmes deux mots (« ${sentences[i].text.match(/^[\p{L}’'-]+\s+[\p{L}’'-]+/u)?.[0]} »).`,
          "Cette reprise peut donner du rythme et mettre plusieurs affirmations en parallèle.");
      }
      i = Math.max(i + 1, j);
    }

    // A two-clause parallel frame can be distinctive even when the changing
    // infinitive means the first two words are not literally identical.
    const startsWithCestInfinitive = sentence => /^c'est\s+[\p{L}]+(?:er|ir|re|oir)\b/u.test(fold(sentence.text));
    for (let i = 0; i + 1 < sentences.length; i++) {
      if (!startsWithCestInfinitive(sentences[i]) || !startsWithCestInfinitive(sentences[i + 1])) continue;
      const part = { start: sentences[i].start, end: sentences[i + 1].end, text: text.slice(sentences[i].start, sentences[i + 1].end) };
      add("parallel-cest-infinitive", "Anaphore et parallélisme (C’est + infinitif)", "observation", part,
        "Deux propositions successives reprennent la structure « C’est + infinitif », avec un verbe différent.",
        "La répétition de ce cadre met les deux actions en parallèle; elle ne permet pas d’inférer une intention.");
    }

    // Reused reduplicated expressions are reported only when they recur in
    // separate sentences, making repetition an article-level observation.
    const repeatedFormula = new Map();
    for (const match of text.matchAll(/\b([\p{L}]{3,})(?:[-\s]+)\1\b/giu)) {
      const sentence = sentences.find(item => match.index >= item.start && match.index < item.end);
      if (!sentence) continue;
      const key = fold(match[0]);
      if (!repeatedFormula.has(key)) repeatedFormula.set(key, { phrase: match[0], sentences: new Map() });
      const group = repeatedFormula.get(key);
      if (!group.sentences.has(sentence.start)) group.sentences.set(sentence.start, { sentence, ranges: [] });
      group.sentences.get(sentence.start).ranges.push({ start: match.index, end: match.index + match[0].length });
    }
    for (const { phrase, sentences: matches } of repeatedFormula.values()) {
      if (matches.size < 2) continue;
      const occurrences = [...matches.values()];
      const passages = occurrences.map(item => item.sentence);
      const part = { start: passages[0].start, end: passages.at(-1).end, text: passages.map(item => item.text).join(" […] ") };
      add("repeated-reduplicated-formula", "Formule redoublée réemployée", "observation", part,
        `La formule redoublée « ${phrase} » apparaît dans ${passages.length} phrases distinctes.`,
        "Sa reprise remet le même cadrage lexical en avant, sans établir que l’affirmation soit vraie ou que l’auteur cherche à manipuler.",
        occurrences.flatMap(item => item.ranges));
    }

    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i], f = fold(s.text);
      const corrective = /\b(?:non pas|n'est pas|n'etait pas)\b.{0,180}\b(?:mais\s+(?:(?:un|une|le|la|les)\b|l'|plutot\b|c'est\b|il s'agit de\b)|c'est\b|il s'agit de\b)\b/u.test(f);
      if (corrective) {
        add("corrective-opposition", "Opposition corrective", "observation", s,
          "La négation écarte explicitement une première formulation, puis un marqueur introduit une reformulation de substitution.",
          "Cette construction déplace l’attention vers la seconde formulation.");
      }
      if (!corrective && i + 1 < sentences.length &&
          /\b(?:ce n'est pas|je ne parlerais pas (?:de\b|d')|je ne dirais pas que|nous ne parlerions pas (?:de\b|d'))/u.test(f) &&
          /^\s*(?:il s'agit plutot (?:de\b|d')|c'est plutot|il s'agit de)\b/u.test(fold(sentences[i + 1].text))) {
        add("corrective-opposition", "Opposition corrective", "observation", pairParts(s, sentences[i + 1], text),
          "Une première qualification est écartée, puis la phrase suivante lui substitue explicitement une autre formulation.",
          "La reformulation peut orienter la lecture vers la seconde interprétation, sans établir qu’elle soit plus exacte.");
      }
      if (/\b(?:ce n'est ni|ce n’est ni|ce n'etait ni|ce n’était ni|ce n'est pas ni)\b.{1,120}\bni\b.{1,120}\bmais\b/u.test(f)) {
        add("double-negation-correction", "Négations successives suivies d’une affirmation", "observation", s,
          "Deux possibilités sont écartées avant une affirmation introduite par « mais ».",
          "Les options rejetées peuvent renforcer le contraste avec la conclusion.");
      }
      if (/\bnon seulement\b.{1,180}\bmais\s+(?:aussi\s+)?/u.test(f)) {
        add("cumulative-reinforcement", "Renforcement cumulatif", "observation", s,
          "La formule « non seulement… mais aussi » ajoute explicitement une seconde proposition à la première.",
          "L’addition peut renforcer l’impression produite par les deux propositions, sans en établir la validité.");
      }
      if (/\b(?:je|nous|on)\s+ne\s+(?:voudrais|veux|vais|tiens)\s+pas\s+(?:dire\s+(?:que\b|qu')|affirmer\s+(?:que\b|qu')|pretendre\s+(?:que\b|qu')|rappeler\s+(?:que\b|qu')|citer\s+(?:que\b|qu'))/u.test(f)) {
        add("explicit-preterition", "Prétérition explicite", "observation", s,
          "Le locuteur annonce qu’il ne dira pas ou ne rappellera pas quelque chose, tout en l’évoquant.",
          "Cette réserve peut attirer l’attention sur l’idée qu’elle prétend laisser de côté.");
      }
      const concessionMarker = /\b(?:certes|bien que|meme si|quoique)\b/u.test(f);
      const contrastMarker = /\b(?:mais|pourtant|cependant|toutefois|neanmoins)\b/u.test(f);
      const completeConcessiveClause = /\b(?:bien que|meme si|quoique)\b[^,;]{2,},\s*[\p{L}][^.!?;]{3,}/u.test(f);
      const concession = concessionMarker && (contrastMarker || completeConcessiveClause);
      const adjacentConcession = i + 1 < sentences.length && /\b(?:certes|bien que|meme si|même si|quoique)\b/u.test(fold(s.text)) && /\b(?:mais|pourtant|cependant|toutefois|neanmoins|néanmoins)\b/u.test(fold(sentences[i + 1].text));
      if (concession || adjacentConcession) {
        const end = adjacentConcession ? sentences[i + 1].end : s.end;
        const part = { start: s.start, end, text: text.slice(s.start, end) };
        add("concession", "Concession", "observation", part,
          "Un marqueur concessif (« certes », « même si »…) est associé à un contraste explicite ou à une proposition principale complète.",
          "Le passage reconnaît une réserve avant de mettre en avant une autre proposition.");
      }
      // Keep ordinary lists as technical candidates, but display only those
      // with an explicit additive/escalatory marker that characterizes the form.
      const commas = (s.text.match(/,/gu) || []).length;
      const marker = s.text.match(/(?<![\p{L}])(?:et\s+m[eê]me\b|jusqu['’]à\b|sans\s+(?:compter|parler\s+de)\b|à\s+plus\s+forte\s+raison)/iu)?.[0] || "";
      if ((commas >= 2 || (marker && commas >= 1)) && (marker || /\b(?:et|ou|puis)\b/iu.test(s.text) || /(?:…|\.\.\.)\s*$/u.test(s.text)) && s.text.length <= 360) {
        const chunks = s.text.split(/,|\b(?:et|ou|puis)\b/iu).map(clean).filter(x => x.length >= 2);
        if (chunks.length >= 3) {
          enumerationCandidates.push({ ruleId: "enumeration", passage: clean(s.text).slice(0, 600), start: s.start, end: s.end, eligibleForDisplay: !!marker, marker: marker || null });
          if (marker) add("rhetorical-accumulation", "Accumulation avec amplification explicite", "observation", s,
            `La liste comporte le marqueur d’extension « ${marker} », qui ajoute un élément après l’énumération initiale.`,
            "Ce raccord rend visible une amplification ou un prolongement de la liste, sans permettre d’inférer l’intention de l’auteur.");
        }
      }
      const simplePromise = s.text.match(/\ben\s+(?:un|une)\s+seul(?:e)?\s+(?:clic|geste)\b/iu);
      if (simplePromise) {
        add("promotional-simplicity", "Formulation promotionnelle de simplicité", "indice", s,
          "Le service est présenté comme réalisable en une action unique (« en un seul clic »).",
          "Cette formule peut réduire la complexité perçue; elle ne suffit pas à établir une exagération ni une intention trompeuse.",
          [{ start: s.start + simplePromise.index, end: s.start + simplePromise.index + simplePromise[0].length }]);
      }
    }
    const addPattern = (pattern, ruleId, category, certainty, explanation, possibleEffect) => {
      pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern)) {
        const start = match.index, end = start + match[0].length;
        add(ruleId, category, certainty, { start, end, text: match[0] }, explanation, possibleEffect, [{ start, end }]);
      }
    };
    addPattern(/\bla question n['’]est plus de savoir si\b.{0,150}\bmais\s+(?:de\s+savoir\s+)?comment\b/giu,
      "presupposed-debate-frame", "Présupposition et cadrage du débat", "observation",
      "La formule traite la première possibilité comme acquise et déplace la question vers la manière dont elle se réalisera.",
      "Elle peut rendre moins visibles les positions qui contestent cette prémisse.");
    addPattern(/\bimaginez\s+(?:un|une)\s+[^.!?;:,]{1,100}/giu,
      "hypothetical-scenario", "Mise en situation", "observation",
      "Le titre invite à se représenter une scène ou un personnage hypothétique.",
      "Cette scène peut rendre l’idée plus concrète, sans constituer en elle-même une preuve.");
    addPattern(/\b(?:pendant que|tandis que)\s+(?:certains|certaines)\b[^.!?]{0,120},\s*(?:lui|elle)\s+(?:a choisi|a préféré|a décidé)\b[^.!?]{0,100}/giu,
      "contrastive-role-model", "Opposition valorisante", "indice",
      "Le titre oppose un groupe à une personne présentée comme ayant choisi une attitude différente.",
      "Le contraste peut valoriser le choix de cette personne par comparaison.");
    addPattern(/(?<![\p{L}])(?:êtes|etes|es|et(?:e|es))-vous\s+prêts?\s+à\s+(?:changer|vous\s+adapter|évoluer|vous\s+transformer|vous\s+former)\b[^.!?]{0,59}\S/giu,
      "readiness-pressure", "Interpellation et pression à l’adaptation", "indice",
      "La question s’adresse au lecteur et lie sa préparation à un changement ou à une adaptation.",
      "Elle peut créer une pression à suivre la transformation annoncée.");
    addPattern(/(?<![\p{L}])(?:à\s+ne\s+pas\s+manquer|ne\s+manquez\s+pas)\b/giu,
      "unmissable-opportunity", "Occasion présentée comme incontournable", "indice",
      "La tournure présente l’absence ou le renoncement comme une occasion manquée.",
      "Elle peut susciter la crainte de manquer un bénéfice ou un événement.");
    addPattern(/\bdans\s+tout\s+juste\s+(?:un|une|\d+)\s+(?:jour|semaine|mois)\b/giu,
      "near-term-urgency", "Échéance rapprochée mise en avant", "indice",
      "La formule insiste sur le faible délai avant une échéance.",
      "Elle peut accélérer la décision; une date proche ne prouve pas une urgence artificielle.");
    addPattern(/\b(?:nous\s+avons|j['’]ai)\s+récemment\s+accompagné\s+(?:un|une)\s+(?:grand|important|majeur)\s+(?:groupe|entreprise|acteur)\b/giu,
      "experience-based-credibility", "Crédibilité appuyée sur une expérience revendiquée", "indice",
      "Le locuteur met en avant une expérience auprès d’une organisation importante.",
      "Cette expérience peut renforcer la confiance accordée à la suite; elle n’est pas vérifiée par le titre.");
    addPattern(/\b(?:je\s+(?:recherche|cherche)|nous\s+recherchons|appel\s+aux|besoin\s+de)\b[^.!?]{0,80}\b(?:très\s+)?génére(?:ux|use|uses)\s+personnes\b/giu,
      "flattering-altruistic-appeal", "Flatterie et appel à l’altruisme", "indice",
      "La sollicitation associe les personnes qui aideraient à une qualité morale valorisante.",
      "Cette valorisation peut encourager l’acceptation, sans démontrer une intention de pression.");
    addPattern(/\bjuste\s+en\s+(?:suivant|appliquant|utilisant)\s+(?:une|la)\s+(?:règle|méthode|étape)\s+simple\b/giu,
      "minimized-effort", "Effort présenté comme minimal", "indice",
      "Les mots « juste » et « simple » présentent l’action comme peu exigeante.",
      "La tâche peut sembler plus accessible; sa difficulté réelle n’est pas évaluée.");
    addPattern(/\bcomment\s+[^.!?]{0,100}\bpeut[- ](?:elle|il)\s+devenir\s+(?:un|une)\s+(?:moteur|levier|source)\s+de\s+(?:création|croissance)\s+de\s+valeur\b/giu,
      "positive-outcome-presupposition", "Bénéfice présupposé dans une question", "indice",
      "La question explore comment atteindre un bénéfice plutôt que si celui-ci est établi.",
      "Elle peut orienter la réflexion vers un résultat favorable posé comme accessible.");
    addPattern(/\bce que\s+[^.!?]{1,90}\bn['’]est plus forcément ce que\s+[^.!?]{1,90}(?:voient|perçoivent)\b/giu,
      "message-perception-gap", "Inquiétude sur l’écart entre image voulue et perception", "indice",
      "Le titre oppose ce qu’une organisation dit d’elle-même à ce que ses publics en perçoivent.",
      "Cet écart peut susciter une inquiétude sur la maîtrise de son image; le titre ne démontre pas qu’il existe réellement.");
    addPattern(/\b(?:pour\s+(?:faire|prendre)\s+les\s+bons\s+(?:choix|décisions)|encore\s+faut[- ]il\s+comprendre)\b/giu,
      "knowledge-needed-for-choice", "Connaissance présentée comme nécessaire au bon choix", "indice",
      "La formulation associe la compréhension du sujet à la capacité de prendre une bonne décision.",
      "Elle peut créer un besoin de lecture en liant l’information proposée à une décision présentée comme importante.");

    // Structural combinations are preferred over isolated attention words:
    // the same cue can be alarming, informative, or neutral in other contexts.
    addPattern(/\b(?:acceptez|choisissez|adoptez|gardez)\b[^.!?;]{1,110}\bou\b[^.!?;]{0,40}\b(?:renoncez|perdez|abandonnez|dites\s+adieu)\b[^.!?;]{1,90}/giu,
      "forced-choice", "Choix présenté comme un ultimatum", "observation",
      "Une option est opposée à un renoncement ou à une perte dans la même formulation.",
      "Cette alternative peut donner l’impression que le refus entraîne nécessairement une perte; le texte seul ne permet pas de savoir si d’autres choix existent.");
    addPattern(/\b(?:si\s+vous\s+(?:refusez|rejetez|n['’]acceptez\s+pas|ne\s+(?:l['’]?)?activez\s+pas)|sans\s+(?:accepter|activation|activer)|refusez\b[^.!?;]{0,60}\bet)\b[^.!?;]{0,120}\b(?:vous\s+(?:perdrez|perdez|n['’]aurez\s+plus)|(?:votre\s+)?acc[eè]s\s+(?:sera|serait)\s+(?:suspendu|coup[eé])|(?:sera|serait)\s+suspendu)\b[^.!?;]{0,70}/giu,
      "forced-choice", "Choix présenté comme un ultimatum", "observation",
      "Une condition de refus ou de non-activation est associée à la perte ou à la suspension d’un accès.",
      "Cette formulation peut rendre le refus coûteux en apparence; le texte seul ne permet pas de savoir si cette conséquence est nécessaire ni si d’autres choix existent.");
    addPattern(/\b(?:attention|faites\s+attention|méfiez[- ]vous|mefiez[- ]vous)\b[^.!?;]{0,100}\b(?:\d+|cinq|trois|plusieurs)\s+(?:signes?|risques?|erreurs?|pièges?|pieges?|raisons?|red\s+flags?)\b/giu,
      "warning-list", "Avertissement suivi d’une liste", "indice",
      "Une mise en garde annonce une liste de risques, d’erreurs ou de critères.",
      "L’association peut éveiller l’inquiétude et la curiosité; elle ne dit pas si l’avertissement est justifié.");
    addPattern(/\bc['’]est\s+exactement\s+là\s+que\s+(?:le\s+problème|le\s+risque|tout\s+se\s+complique)\s+commence\b/giu,
      "suspense-reversal", "Renversement inquiétant après une situation normale", "observation",
      "La formulation présente un point qui semblait normal comme le début d’un problème ou d’un risque.",
      "Ce renversement peut créer du suspense et rendre un scénario de risque plus présent à l’esprit; il n’en établit pas la probabilité.");
    for (let i = 0; i + 1 < sentences.length; i++) {
      const first = sentences[i], second = sentences[i + 1];
      const firstFolded = fold(first.text), secondFolded = fold(second.text);
      if (/\b(?:tout\s+semblait\s+(?:fonctionner|aller\s+bien)|tout\s+fonctionnait|tout\s+paraissait\s+normal|la\s+situation\s+(?:semblait\s+)?sous\s+controle)\b/u.test(firstFolded) &&
          /\b(?:(?:(?:c'est\s+)?(?:alors|precisement\s+ici|a\s+ce\s+moment)\s+que\s+|ensuite[, ]+)(?:les\s+ennuis|les\s+problemes|les\s+difficultes|le\s+risque|le\s+(?:vrai|veritable)\s+(?:risque|danger)|le\s+danger|tout)\s+(?:ont\s+commence|commencent|(?:est|sont)\s+apparu(?:e|es)?|apparait|se\s+complique)|(?:les\s+ennuis|les\s+problemes|les\s+difficultes|le\s+risque|le\s+(?:vrai|veritable)\s+(?:risque|danger)|le\s+danger)\s+(?:ont\s+commence|commencent|(?:est|sont)\s+apparu(?:e|es)?|apparait)\s+ensuite)\b/u.test(secondFolded)) {
        add("suspense-reversal", "Renversement inquiétant après une situation normale", "observation", pairParts(first, second, text),
          "Une situation présentée comme maîtrisée est suivie de l’apparition d’ennuis ou d’un risque.",
          "Ce renversement peut créer du suspense; il ne permet pas d’évaluer la probabilité du problème décrit.");
      }
    }
    for (let i = 0; i + 1 < sentences.length; i++) {
      const first = sentences[i], second = sentences[i + 1];
      if (/\bne\s+(?:r[eéè]glera|r[eéè]soudra|corrigera|r[eéè]parera)\s+pas\b/iu.test(first.text) &&
          /\b(?:risque|pourrait|peut)\s+(?:m[eê]me\s+)?(?:de\s+)?(?:l['’]?)?(?:aggraver|empirer|accentuer|augmenter|faire\s+empirer)\b/iu.test(second.text)) {
        add("worsening-reversal", "Solution présentée comme risque d’aggravation", "observation", pairParts(first, second, text),
          "Une proposition écarte une solution, puis la suivante évoque une aggravation possible du problème.",
          "Cette progression peut renforcer l’inquiétude; elle ne permet pas d’évaluer la probabilité du risque.");
      }
      const firstView = first.text.match(/\b(?:on|la\s+plupart)\s+(regarde|observe|voit|choisit|analyse)\s+(.{1,90})[.!?]?$/iu);
      const secondView = second.text.match(/\bmoi[, ]+je\s+(regarde|observe|vois|choisis|analyse)\s+(.{1,90})[.!?]?$/iu);
      if (firstView && secondView && fold(firstView[1]).replace(/e?$/u, "") === fold(secondView[1]).replace(/e?$/u, "") && fold(firstView[2]) !== fold(secondView[2])) {
        add("contrastive-reframing", "Antithèse de regard ou de méthode", "observation", pairParts(first, second, text),
          "Deux phrases parallèles opposent un regard collectif à celui que revendique le locuteur.",
          "Le contraste peut valoriser le point de vue personnel sans prouver que les deux approches s’excluent.");
      }
      if (/\b(?:la|la vraie|la r[eé]alit[eé]|la v[eé]rit[eé])\s+(?:est|semble)\s+plus\s+nuanc[eé]e\b/iu.test(second.text) &&
          /\b(?:on\s+(?:entend|lit)|tout\s+le\s+monde\s+dit|beaucoup\s+disent|je\s+lis\s+partout)\b/iu.test(first.text)) {
        add("nuance-counterclaim", "Contre-discours annoncé comme plus nuancé", "indice", pairParts(first, second, text),
          "Une affirmation présentée comme répandue est suivie d’une formule annonçant une nuance.",
          "La posture de rectification peut donner à la suite un effet d’équilibre; la formule seule ne garantit pas cette nuance.");
      }
    }
    addPattern(/\b(?:le\s+)?coupable\s+idéal\b[^.!?;]{0,80}(?::|,|\bserait\b|\best\b|\s—\s)/giu,
      "accusatory-causal-frame", "Désignation d’un coupable", "observation",
      "La formulation désigne explicitement un « coupable » avant d’exposer ou de démontrer le lien causal.",
      "Ce cadrage peut orienter l’attribution de responsabilité; il ne permet pas de conclure que la cause avancée est fausse.");

    // Detect a quantitative build-up only when it is followed by a question
    // challenging a missing outcome or value. Numbers alone stay unlabelled.
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      // Timestamped chapters are navigation structure, not quantitative
      // arguments. They also break the look-back window for prose questions.
      if (isTimestampedChapter(s.text)) continue;
      if (!/\?\s*$/u.test(s.text)) continue;
      let windowStart = Math.max(0, i - 2);
      for (let j = i - 1; j >= windowStart; j--) if (isTimestampedChapter(sentences[j].text)) { windowStart = j + 1; break; }
      const previous = sentences.slice(windowStart, i + 1);
      const rawSegment = text.slice(previous[0].start, s.end);
      const leadingSpace = rawSegment.length - rawSegment.trimStart().length;
      const segment = rawSegment.trim();
      if (!/(?:^|[^\p{L}])(?:où|ou|quand|quel(?:le)?|combien)(?=\s)[^?]{0,90}\?$/iu.test(segment)) continue;
      const quantityCount = [...segment.matchAll(/\d[\d\s,.]*|\b(?:cent|mille|million|milliard)s?\b/giu)].length;
      if (quantityCount < 2) continue;
      const start = previous[0].start + leadingSpace;
      const part = { start, end: s.end, text: segment };
      add("scale-then-challenge", "Accumulation de chiffres suivie d’une mise en doute", "indice", part,
        "Plusieurs repères quantitatifs précèdent une question qui met en doute un résultat ou une valeur.",
        "L’accumulation puis la rupture peuvent produire un contraste marquant; les quantités et le résultat ne sont pas vérifiés.");
    }
    findings.sort((a, b) => a.start - b.start || a.end - b.end);
    return { version: VERSION, analyzedCharacters: text.length, findings, candidates: { enumerations: enumerationCandidates } };
  }
  const catalog = Object.freeze(CATALOG.map(item => Object.freeze({ ...item, ruleIds: Object.freeze(item.ruleIds) })));
  return Object.freeze({ VERSION, analyze, formatPassage, catalog });
})();
