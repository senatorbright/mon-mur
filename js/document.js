"use strict";

const documents = {
  changelog: {
    title: "Suivi des évolutions",
    description: "Historique cumulatif des versions et des changements de Mon Mur.",
    file: "v5.6.0.txt",
    sourceLabel: "Télécharger le fichier source ↧",
    language: "fr",
    eyebrow: "DOCUMENTATION",
    backLabel: "Retour aux préférences"
  },
  notices: {
    title: "Third Party Notices",
    description: "Third-party software, models, platforms, and visual assets used by Mon Mur.",
    file: "THIRD_PARTY_NOTICES.md",
    sourceLabel: "Télécharger le fichier source ↧",
    language: "en",
    eyebrow: "LEGAL AND ATTRIBUTION NOTES",
    backLabel: "Back to settings"
  }
};

const documentConfig = documents[new URLSearchParams(location.search).get("doc")];
const content = document.querySelector("#markdownContent");
const escapeHtml = value => value.replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);

function renderInline(source) {
  const code = [];
  let result = escapeHtml(source).replace(/`([^`]+)`/g, (_, value) => {
    const token = `\u0000${code.length}\u0000`;
    code.push(`<code>${value}</code>`);
    return token;
  });
  result = result
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/&lt;(https?:\/\/[^\s&<>]+)&gt;/g, (_, href) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>`);
  return result.replace(/\u0000(\d+)\u0000/g, (_, index) => code[Number(index)]);
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  let html = "", paragraph = [], listOpen = false, introOpen = false, sectionOpen = false;
  const flushParagraph = () => {
    if (paragraph.length) html += `<p>${renderInline(paragraph.join(" "))}</p>`;
    paragraph = [];
  };
  const closeList = () => { if (listOpen) html += "</ul>"; listOpen = false; };
  const closeIntro = () => { if (introOpen) html += "</div>"; introOpen = false; };
  const closeSection = () => { if (sectionOpen) html += "</section>"; sectionOpen = false; };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { flushParagraph(); closeList(); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph(); closeList();
      const level = heading[1].length;
      if (level === 1) {
        closeIntro(); closeSection();
        html += `<div class="changelog-intro"><h2>${renderInline(heading[2])}</h2>`;
        introOpen = true;
      } else if (level === 2) {
        closeIntro(); closeSection();
        html += `<section class="release"><h2>${renderInline(heading[2])}</h2>`;
        sectionOpen = true;
      } else {
        html += `<h3>${renderInline(heading[2])}</h3>`;
      }
      continue;
    }
    const item = line.match(/^[-*]\s+(.+)$/);
    if (item) {
      flushParagraph();
      if (!listOpen) { html += "<ul>"; listOpen = true; }
      html += `<li>${renderInline(item[1])}</li>`;
      continue;
    }
    closeList(); paragraph.push(line);
  }
  flushParagraph(); closeList(); closeIntro(); closeSection();
  return html;
}

async function loadDocument() {
  if (!documentConfig) {
    document.querySelector("#pageTitle").textContent = "Document introuvable";
    content.innerHTML = '<p class="document-error" role="alert">Choisissez un document depuis les préférences.</p>';
    content.setAttribute("aria-busy", "false");
    return;
  }
  document.documentElement.lang = documentConfig.language;
  document.title = `Mon Mur · ${documentConfig.title}`;
  document.querySelector("#pageTitle").textContent = documentConfig.title;
  document.querySelector("#pageDescription").textContent = documentConfig.description;
  document.querySelector("#pageEyebrow").textContent = documentConfig.eyebrow;
  document.querySelector("#backLink").textContent = documentConfig.backLabel;
  const sourceLink = document.querySelector("#downloadSource");
  sourceLink.href = documentConfig.file;
  sourceLink.download = documentConfig.file;
  sourceLink.textContent = documentConfig.sourceLabel;
  sourceLink.hidden = false;
  if (documentConfig.language === "fr") {
    const version = document.querySelector("#pageVersion");
    version.textContent = `Version installée ${browser.runtime.getManifest().version}`;
    version.hidden = false;
  }
  try {
    const response = await fetch(browser.runtime.getURL(documentConfig.file));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    content.innerHTML = renderMarkdown(await response.text());
  } catch {
    content.innerHTML = '<p class="document-error" role="alert">Le document n’a pas pu être chargé. Vous pouvez télécharger le fichier source ci-dessus.</p>';
  }
  content.setAttribute("aria-busy", "false");
}

loadDocument();
