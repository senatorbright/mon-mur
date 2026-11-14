"use strict";

window.MMClickbaitAnnotations = (() => {
  const closeCurrent = (restoreFocus = false) => {
    const box = document.querySelector(".clickbait-explanation");
    if (!box) return;
    const title = box._title;
    box.remove();
    title?.removeAttribute("aria-expanded");
    if (restoreFocus && title?.isConnected) title.focus();
  };
  const clear = title => {
    if (!title) return;
    const open = document.querySelector(".clickbait-explanation");
    if (open?._title === title) closeCurrent();
    if (title._clickbaitClick) title.removeEventListener("click", title._clickbaitClick);
    if (title._clickbaitKeydown) title.removeEventListener("keydown", title._clickbaitKeydown);
    delete title._clickbaitClick; delete title._clickbaitKeydown;
    for (const mark of title.querySelectorAll("mark.clickbait-highlight")) mark.replaceWith(...mark.childNodes);
    title.normalize?.();
    title.classList.remove("has-clickbait");
    for (const name of ["aria-haspopup", "aria-label", "data-clickbait-findings", "aria-expanded"]) title.removeAttribute(name);
    if (title.getAttribute("role") === "button") title.removeAttribute("role");
    if (title.tagName !== "A") title.removeAttribute("tabindex");
  };
  const annotate = (title, text, readInWall, sourceLink = title) => {
    clear(title);
    const titleFindings = window.MMClickbait?.analyze(text) || [];
    const persuasionFindings = window.MMPersuasion?.analyze(text)?.findings || [];
    const findings = [...titleFindings, ...persuasionFindings.map(finding => ({
      name: finding.category,
      ranges: (finding.highlightRanges || [{ start: finding.start, end: finding.end }]).map(range => ({ ...range, passage: text.slice(range.start, range.end) })),
      effect: finding.possibleEffect
    }))];
    if (!findings.length) return;
    const ranges = findings.flatMap(finding => finding.ranges).sort((a, b) => a.start - b.start || a.end - b.end).reduce((merged, range) => {
      const previous = merged[merged.length - 1];
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
      else merged.push({ ...range });
      return merged;
    }, []);
    for (const range of ranges.sort((a, b) => b.start - a.start)) {
      if (range.end <= range.start || range.end > title.textContent.length) continue;
      const node = title.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) continue;
      const selected = node.splitText(range.start);
      selected.splitText(range.end - range.start);
      const mark = document.createElement("mark");
      mark.className = "clickbait-highlight";
      mark.setAttribute("aria-hidden", "true");
      selected.replaceWith(mark);
      mark.append(selected);
    }
    title.classList.add("has-clickbait");
    title.setAttribute("aria-haspopup", "dialog");
    const isLink = title.tagName === "A";
    if (!isLink) { title.tabIndex = 0; title.setAttribute("role", "button"); }
    title.setAttribute("aria-label", `${title.textContent}. Analyse du titre disponible. Entrée ou clic pour afficher l’explication${isLink?"; Ctrl, Cmd ou clic molette pour ouvrir directement l’article dans un nouvel onglet":""}.`);
    title.dataset.clickbaitFindings = JSON.stringify(findings);
    title._clickbaitClick = event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      show(title, findings, readInWall, sourceLink);
    };
    title.addEventListener("click", title._clickbaitClick);
    if (!isLink) {
      title._clickbaitKeydown = event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault(); show(title, findings, readInWall, sourceLink);
      };
      title.addEventListener("keydown", title._clickbaitKeydown);
    }
  };
  const show = (title, findings, readInWall = null, sourceLink = title) => {
    closeCurrent();
    const box = document.createElement("aside");
    box.className = "clickbait-explanation";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Filtre intelligent — Techniques de persuasion dans le titre");
    box._title = title;
    box.addEventListener("click", event => { if (!event.target.closest("button,a")) closeCurrent(); });
    const header = document.createElement("header"), heading = document.createElement("h3"), close = document.createElement("button");
    heading.textContent = "Filtre intelligent — Techniques de persuasion dans le titre";
    close.type = "button"; close.className = "clickbait-close"; close.textContent = "Fermer"; close.setAttribute("aria-label", "Fermer l’explication");
    close.addEventListener("click", () => closeCurrent(true));
    header.append(heading, close); box.append(header);
    for (const item of findings) {
      const section = document.createElement("section"), name = document.createElement("strong"), passage = document.createElement("p"), effect = document.createElement("p");
      name.textContent = item.name; passage.className = "clickbait-trigger";
      passage.textContent = `Repère : « ${item.ranges.map(range => range.passage).join("…")} »`;
      effect.textContent = item.effect;
      section.append(name, passage, effect); box.append(section);
    }
    const actions = document.createElement("div");
    actions.className = "clickbait-actions";
    const read = document.createElement("button");
    read.type = "button"; read.className = "clickbait-read"; read.textContent = "Lire l’article";
    read.addEventListener("click", async () => {
      closeCurrent();
      try { await readInWall?.(); }
      catch (error) { title.dispatchEvent(new CustomEvent("clickbait-read-error", { detail: error })); }
    });
    const open = document.createElement("a");
    open.className = "clickbait-original"; open.href = sourceLink?.href || title.href || ""; open.target = sourceLink?.target || title.target || "_blank"; open.rel = sourceLink?.rel || title.rel || "noopener noreferrer";
    open.textContent = "Ouvrir sur le site d’origine ↗";
    if (open.href) actions.append(read, open); else actions.append(read);
    box.append(actions);
    title.after(box); title.setAttribute("aria-expanded", "true");
    close.focus();
  };
  document.addEventListener("keydown", event => { if (event.key === "Escape" && document.querySelector(".clickbait-explanation")) { event.preventDefault(); closeCurrent(true); } });
  document.addEventListener("click", event => { const box = document.querySelector(".clickbait-explanation"); if (box && !box.contains(event.target) && !box._title.contains(event.target)) closeCurrent(); });
  return Object.freeze({ annotate, clear, show, close: closeCurrent });
})();
