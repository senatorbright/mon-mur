"use strict";

window.MMPersuasionAnnotations = (() => {
  const BLOCKS = new Set(["ADDRESS", "ARTICLE", "BLOCKQUOTE", "DD", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "LI", "OL", "P", "PRE", "SECTION", "TABLE", "TBODY", "TD", "TH", "THEAD", "TR", "UL"]);
  const SKIP = new Set(["BUTTON", "SCRIPT", "STYLE", "NOSCRIPT", "VIDEO", "AUDIO", "IFRAME"]);
  let dialogSequence = 0;

  function collectTextMap(root) {
    const text = [], map = [];
    const newline = () => {
      if (text.length && text[text.length - 1] !== "\n") { text.push("\n"); map.push(null); }
    };
    const visit = node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = node.nodeValue || "";
        for (let offset = 0; offset < value.length; offset++) { text.push(value[offset]); map.push({ node, offset }); }
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.hidden || node.getAttribute("aria-hidden") === "true" || node.matches(".affiliate-link-badge,.persuasion-explanation") || SKIP.has(node.tagName)) return;
      const block = BLOCKS.has(node.tagName);
      if (block) newline();
      if (node.tagName === "BR") newline();
      else for (const child of node.childNodes) visit(child);
      if (block) newline();
    };
    for (const child of root.childNodes) visit(child);
    while (text[text.length - 1] === "\n") { text.pop(); map.pop(); }
    return { text: text.join(""), map };
  }

  function unwrap(root) {
    for (const mark of root.querySelectorAll("mark.persuasion-highlight")) mark.replaceWith(...mark.childNodes);
    root.normalize();
  }

  function highlightSegments(map, findings) {
    const events = new Map();
    const eventAt = index => { if (!events.has(index)) events.set(index, []); return events.get(index); };
    findings.forEach((finding, findingIndex) => {
      for (const range of finding.highlightRanges || [{ start: finding.start, end: finding.end }]) {
        const start = Math.max(0, Number(range.start) || 0), end = Math.min(map.length, Number(range.end) || 0);
        if (end > start) { eventAt(start).push({ findingIndex, delta: 1 }); eventAt(end).push({ findingIndex, delta: -1 }); }
      }
    });
    const byNode = new Map();
    let active = null;
    const activeIds = new Map();
    const flush = () => { if (active) { if (!byNode.has(active.node)) byNode.set(active.node, []); byNode.get(active.node).push(active); active = null; } };
    for (let index = 0; index < map.length; index++) {
      for (const event of events.get(index) || []) { const next = (activeIds.get(event.findingIndex) || 0) + event.delta; if (next) activeIds.set(event.findingIndex, next); else activeIds.delete(event.findingIndex); }
      const entry = map[index];
      if (!entry) { flush(); continue; }
      if (!activeIds.size) { flush(); continue; }
      const distinctIds = [...activeIds.keys()].sort((a, b) => a - b);
      const same = active && active.node === entry.node && active.end === entry.offset && active.ids.join(",") === distinctIds.join(",");
      if (same) active.end++;
      else { flush(); active = { node: entry.node, start: entry.offset, end: entry.offset + 1, ids: distinctIds }; }
    }
    flush();
    return byNode;
  }

  function render(articleBody, content, enabled) {
    articleBody._persuasionController?.destroy();
    articleBody._persuasionController = null;
    unwrap(content);
    articleBody.querySelector(".persuasion-summary-toggle")?.remove();
    articleBody.querySelector(".persuasion-summary")?.remove();
    articleBody.querySelector(".persuasion-explanation")?.remove();
    if (!enabled || !window.MMPersuasion?.analyze) return null;

    const { text, map } = collectTextMap(content);
    const result = window.MMPersuasion.analyze(text), findings = result.findings;
    if (!findings.length) return result;
    const idsByMark = new WeakMap(), byNode = highlightSegments(map, findings);
    for (const [node, segments] of byNode) {
      segments.sort((a, b) => b.start - a.start);
      for (const segment of segments) {
        const selected = node.splitText(segment.start);
        selected.splitText(segment.end - segment.start);
        const mark = document.createElement("mark");
        mark.className = "persuasion-highlight";
        mark.setAttribute("role", "mark");
        mark.tabIndex = 0;
        const label = segment.ids.map(id => findings[id].category).join("; ");
        mark.setAttribute("aria-label", `${label}. Passage annoté; appuyez sur Entrée pour afficher l’explication.`);
        mark.setAttribute("aria-haspopup", "dialog");
        selected.parentNode.replaceChild(mark, selected);
        mark.appendChild(selected);
        idsByMark.set(mark, segment.ids);
      }
    }

    const toolbar = articleBody.querySelector(".expanded-toolbar");
    const marks = [...content.querySelectorAll("mark.persuasion-highlight")];
    if (!toolbar || !marks.length) return result;
    const passageGroups = [];
    findings.flatMap((finding, id) => (finding.highlightRanges || [{ start: finding.start, end: finding.end }]).map(range => ({ start: range.start, end: range.end, id }))).sort((a, b) => a.start - b.start || a.end - b.end).forEach(item => {
      const prior = passageGroups[passageGroups.length - 1];
      if (prior && item.start < prior.end) { prior.end = Math.max(prior.end, item.end); if (!prior.ids.includes(item.id)) prior.ids.push(item.id); }
      else passageGroups.push({ start: item.start, end: item.end, ids: [item.id] });
    });
    const groupForFinding = new Map();
    passageGroups.forEach((group, groupIndex) => group.ids.forEach(id => groupForFinding.set(id, groupIndex)));
    const categories = new Map();
    findings.forEach((finding, id) => {
      if (!categories.has(finding.category)) categories.set(finding.category, []);
      categories.get(finding.category).push(id);
    });
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "persuasion-summary-toggle";
    toggle.textContent = `${passageGroups.length} passage${passageGroups.length === 1 ? "" : "s"} · ${categories.size} technique${categories.size === 1 ? "" : "s"}`;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", `persuasion-summary-${++dialogSequence}`);
    const summary = document.createElement("section");
    summary.className = "persuasion-summary";
    summary.id = toggle.getAttribute("aria-controls");
    summary.hidden = true;
    const summaryTitle = document.createElement("h3");
    summaryTitle.textContent = "Repères dans cet article";
    const summaryText = document.createElement("p");
    summaryText.textContent = `${passageGroups.length} passages présentant ${categories.size} techniques distinctes. Ces repères décrivent des constructions du texte, sans conclure à une intention de manipulation.`;
    const paragraphBlocks = [...content.querySelectorAll("p,li,blockquote,h1,h2,h3,h4,h5,h6")].filter(block => block.textContent.trim());
    const annotatedBlocks = new Set(marks.map(mark => mark.closest("p,li,blockquote,h1,h2,h3,h4,h5,h6") || content));
    const spread = document.createElement("p");
    spread.className = "persuasion-spread";
    spread.textContent = `Répartition : repères dans ${annotatedBlocks.size} bloc${annotatedBlocks.size === 1 ? "" : "s"} de texte sur ${Math.max(paragraphBlocks.length, annotatedBlocks.size)} contenant du texte.`;
    const typeHeading = document.createElement("h4");
    typeHeading.textContent = "Techniques repérées";
    const typeList = document.createElement("ul");
    for (const [category, ids] of categories) {
      const item = document.createElement("li"), jump = document.createElement("button");
      jump.type = "button";
      jump.textContent = `${category} · ${new Set(ids.map(id => groupForFinding.get(id))).size} passage${new Set(ids.map(id => groupForFinding.get(id))).size === 1 ? "" : "s"}`;
      jump.addEventListener("click", () => { summary.hidden = true; toggle.setAttribute("aria-expanded", "false"); focusFinding(ids[0]); });
      item.append(jump); typeList.append(item);
    }
    summary.append(summaryTitle, summaryText, spread, typeHeading, typeList);
    toolbar.append(toggle);
    toolbar.insertAdjacentElement("afterend", summary);

    const dialog = document.createElement("aside");
    dialog.className = "persuasion-explanation";
    dialog.hidden = true;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "false");
    dialog.tabIndex = -1;
    const headingId = `persuasion-explanation-${++dialogSequence}`;
    dialog.setAttribute("aria-labelledby", headingId);
    articleBody.append(dialog);

    let focusedMark = null;
    const positionDialog = () => {
      if (dialog.hidden || !focusedMark?.isConnected) return;
      const margin = 12, width = Math.min(620, window.innerWidth - margin * 2), rect = focusedMark.getBoundingClientRect();
      dialog.style.width = `${width}px`;
      dialog.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`;
      const height = dialog.offsetHeight;
      let top = rect.bottom + 8;
      if (top + height > window.innerHeight - margin) top = rect.top - height - 8;
      dialog.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - height - margin))}px`;
    };
    const onViewportChange = () => positionDialog();
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    const close = (restoreFocus = false) => {
      dialog.hidden = true;
      if (restoreFocus && focusedMark?.isConnected) focusedMark.focus();
    };
    const show = (mark, link = null) => {
      focusedMark = mark;
      dialog.replaceChildren();
      const heading = document.createElement("h3");
      heading.id = headingId;
      heading.textContent = "Techniques de persuasion — Repère détecté";
      dialog.append(heading);
      for (const id of idsByMark.get(mark) || []) {
        const finding = findings[id], item = document.createElement("section"), title = document.createElement("h4"), certainty = document.createElement("span"), reason = document.createElement("p"), effect = document.createElement("p");
        title.className = "persuasion-finding-title";
        title.textContent = finding.category;
        certainty.className = "persuasion-certainty";
        certainty.textContent = finding.certainty === "observation" ? "Construction observée" : "Indice à interpréter";
        reason.textContent = finding.explanation;
        effect.className = "persuasion-possible-effect";
        effect.textContent = finding.possibleEffect;
        item.append(title, certainty, reason, effect);
        dialog.append(item);
      }
      if (link?.href) {
        const openLink = document.createElement("a");
        openLink.href = link.href;
        openLink.target = link.target || "_blank";
        openLink.rel = "noopener noreferrer";
        openLink.textContent = "Ouvrir le lien associé ↗";
        dialog.append(openLink);
      }
      dialog.hidden = false;
      positionDialog();
      dialog.focus();
    };
    const focusFinding = id => {
      const mark = marks.find(candidate => idsByMark.get(candidate)?.includes(id));
      if (!mark) return;
      mark.scrollIntoView({ block: "center", behavior: "smooth" });
      mark.focus({ preventScroll: true });
      show(mark, mark.closest("a"));
    };
    const onClick = event => {
      if (dialog.contains(event.target)) { close(); return; }
      const mark = event.target.closest?.("mark.persuasion-highlight");
      if (mark && content.contains(mark)) {
        if (window.getSelection?.()?.toString()) return;
        const link = mark.closest("a");
        if (link) event.preventDefault();
        if (!dialog.hidden && focusedMark === mark) { close(true); return; }
        show(mark, link);
      } else close();
    };
    const onKeyDown = event => {
      if (event.key === "Escape" && !dialog.hidden) { event.preventDefault(); close(true); return; }
      if (event.key === "Escape" && !summary.hidden) { event.preventDefault(); summary.hidden = true; toggle.setAttribute("aria-expanded", "false"); toggle.focus(); return; }
      const mark = event.target.closest?.("mark.persuasion-highlight");
      if (mark && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); show(mark, mark.closest("a")); }
    };
    articleBody.addEventListener("click", onClick);
    articleBody.addEventListener("keydown", onKeyDown);
    toggle.addEventListener("click", () => { const open = summary.hidden; summary.hidden = !open; toggle.setAttribute("aria-expanded", String(open)); if (open) summary.querySelector("button")?.focus(); });
    articleBody._persuasionController = { destroy() { articleBody.removeEventListener("click", onClick); articleBody.removeEventListener("keydown", onKeyDown); window.removeEventListener("scroll", onViewportChange, true); window.removeEventListener("resize", onViewportChange); toggle.remove(); summary.remove(); dialog.remove(); unwrap(content); } };
    return result;
  }

  return Object.freeze({ render, collectTextMap, planHighlights: highlightSegments });
})();
