"use strict";

(() => {
  const entries = window.MMPersuasion?.catalog || [];
  const nav = document.querySelector("#catalogNav"), root = document.querySelector("#catalog");
  const count = document.querySelector("#catalogCount");
  count.textContent = `${entries.length} techniques actuellement reconnues`;

  const exampleWithHighlight = (text, phrase) => {
    const fragment = document.createDocumentFragment();
    if (!phrase) { fragment.append(document.createTextNode(text)); return fragment; }
    const ranges = [];
    let from = 0, index;
    while ((index = text.indexOf(phrase, from)) !== -1) { ranges.push([index, index + phrase.length]); from = index + phrase.length; }
    if (!ranges.length) { fragment.append(document.createTextNode(text)); return fragment; }
    let cursor = 0;
    for (const [start, end] of ranges) {
      fragment.append(document.createTextNode(text.slice(cursor, start)));
      const mark = document.createElement("mark"); mark.textContent = text.slice(start, end); fragment.append(mark);
      cursor = end;
    }
    fragment.append(document.createTextNode(text.slice(cursor)));
    return fragment;
  };

  for (const [index, entry] of entries.entries()) {
    const link = document.createElement("a"); link.href = `#${entry.id}`; link.textContent = entry.name; nav.append(link);
    const card = document.createElement("article"); card.className = "technique-card"; card.id = entry.id;
    const header = document.createElement("header"), family = document.createElement("span"), title = document.createElement("h2");
    family.className = "family-tag"; family.textContent = entry.family; title.textContent = entry.name;
    header.append(family, title);
    const definition = document.createElement("p"); definition.className = "definition"; definition.textContent = entry.definition;
    const exampleLabel = document.createElement("h3"); exampleLabel.textContent = "Exemple";
    const example = document.createElement("blockquote"); example.append(exampleWithHighlight(entry.example, entry.highlight));
    const details = document.createElement("dl");
    for (const [label, value] of [["Comment ça fonctionne ?", entry.mechanism], ["Effet possible", entry.effect], ["Limites d’interprétation", entry.limits]]) {
      const term = document.createElement("dt"), description = document.createElement("dd"); term.textContent = label; description.textContent = value; details.append(term, description);
    }
    card.append(header, definition, exampleLabel, example, details); root.append(card);
  }
  if (!entries.length) root.textContent = "Aucune technique n’est actuellement déclarée dans le moteur.";
})();
