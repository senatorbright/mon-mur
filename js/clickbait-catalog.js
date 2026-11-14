"use strict";
(() => {
  const entries = window.MMClickbait?.catalog || [];
  const nav = document.querySelector("#catalogNav"), root = document.querySelector("#catalog");
  document.querySelector("#catalogCount").textContent = `${entries.length} procédés actuellement reconnus`;
  function highlighted(text, phrase) {
    const fragment = document.createDocumentFragment(), at = text.toLocaleLowerCase("fr").indexOf(phrase.toLocaleLowerCase("fr"));
    if (at < 0) { fragment.append(document.createTextNode(text)); return fragment; }
    fragment.append(document.createTextNode(text.slice(0, at)));
    const mark = document.createElement("mark"); mark.textContent = text.slice(at, at + phrase.length); fragment.append(mark);
    fragment.append(document.createTextNode(text.slice(at + phrase.length))); return fragment;
  }
  for (const entry of entries) {
    const link = document.createElement("a"); link.href = `#${entry.id}`; link.textContent = entry.name; nav.append(link);
    const card = document.createElement("article"); card.className = "technique-card"; card.id = entry.id;
    const header = document.createElement("header"), family = document.createElement("span"), title = document.createElement("h2");
    family.className = "family-tag"; family.textContent = entry.family; title.textContent = entry.name; header.append(family, title);
    const definition = document.createElement("p"); definition.textContent = entry.definition;
    const exampleLabel = document.createElement("h3"); exampleLabel.textContent = "Exemple";
    const example = document.createElement("blockquote"); example.append(highlighted(entry.example, entry.highlight));
    const details = document.createElement("dl");
    for (const [term, value] of [["Mécanisme repéré", entry.mechanism], ["Effet possible", entry.effect], ["Limites d’interprétation", entry.limits]]) {
      const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = term; dd.textContent = value; details.append(dt, dd);
    }
    card.append(header, definition, exampleLabel, example, details); root.append(card);
  }
})();
