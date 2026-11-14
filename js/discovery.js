"use strict";
const byId = id => document.getElementById(id);
const discoveryForm = byId("discoveryForm"), termsInput = byId("discoveryTerms"), prioritySelect = byId("discoveryPriority");
let pendingPermissionRequest = null;
const permissionButton = byId("grantDiscoveryAccess");
let pendingRows = [], processedRows = [];
const methodLabel = method => ({ rss: "RSS", atom: "Atom", jsonfeed: "JSON Feed" }[method] || "RSS/Atom");
function makeButton(label, action, className = "") { const button = document.createElement("button"); button.type = "button"; button.textContent = label; if (className) button.className = className; button.addEventListener("click", action); return button; }
function showStatus(message) { byId("discoveryStatus").textContent = message; }
function showProgress(message, current = 0, total = 0) {
  showStatus(total ? `${message} · ${current}/${total}` : `${message}…`);
  const bar = byId("discoveryProgress"); bar.hidden = false;
  if (total > 0) { bar.max = total; bar.value = current; } else { bar.removeAttribute("value"); }
}
function explainDiscoveryResult(result) {
  const count = result.results?.length || 0, stats = result.diagnostics || {};
  if (count) return `${count} source(s) à examiner.`;
  if (!stats.searchResults) {
    if (!stats.injectedFrames) return "Firefox n’a pas pu lire l’onglet de résultats DuckDuckGo. Vérifie que l’accès à duckduckgo.com est autorisé, puis relance la recherche.";
    if (stats.frameResultType !== "object") return `Firefox n’a pas retourné les données de la page DuckDuckGo (type ${stats.frameResultType}, champs ${stats.frameKeys.join(", ") || "aucun"}).`;
    return stats.resultRows ? `DuckDuckGo a affiché ${stats.resultRows} résultat(s), mais aucun lien organique n’a pu être extrait.` : `DuckDuckGo n’a rendu aucune carte de résultat exploitable${stats.searchTitle ? ` (${stats.searchTitle})` : ""}${stats.searchUrl ? ` · ${stats.searchUrl}` : ""}.`;
  }
  if (!stats.checkedPages) return `${stats.searchResults} résultat(s) reçu(s), mais aucune page n’a pu être vérifiée.`;
  if (!stats.feedsFound) return `${stats.searchResults} résultat(s) reçu(s) et ${stats.checkedPages} page(s) vérifiée(s) : aucun flux RSS/Atom détecté.`;
  if (!stats.parsedFeeds) return `${stats.feedsFound} flux détecté(s), mais aucun n’a pu être lu comme un flux valide.`;
  if (!stats.freshnessMatches) return `${stats.parsedFeeds} flux valide(s) analysé(s), sans publication exploitable.`;
  return "Aucune nouvelle source à examiner : consulte les motifs dans les résultats de recherche.";
}
async function storageLists() { return browser.storage.local.get({ processedSources: [] }); }
function table(headers, className) {
  const wrap = document.createElement("div"); wrap.className = "discovery-table-scroll";
  const element = document.createElement("table"); element.className = `discovery-table ${className}`;
  const head = document.createElement("thead"), row = document.createElement("tr");
  for (const label of headers) { const cell = document.createElement("th"); cell.scope = "col"; cell.textContent = label; row.append(cell); }
  head.append(row); element.append(head, document.createElement("tbody")); wrap.append(element); return { wrap, body: element.tBodies[0] };
}
function addTextCell(row, text, className = "") { const cell = document.createElement("td"); if (className) cell.className = className; if (className === "discovery-preview") { const preview = document.createElement("span"); preview.className = "discovery-preview-text"; preview.textContent = text; cell.append(preview); } else cell.textContent = text; row.append(cell); return cell; }
function addFeedLink(cell, url, label = url) {
  if (!url) { cell.textContent = "Flux inconnu"; return; }
  const link = document.createElement("a"); link.href = url; link.textContent = label; link.target = "_blank"; link.rel = "noopener"; link.className = "discovery-secondary-link"; cell.append(link);
}
function dateLabel(value, fallback = "Date inconnue") { if (!value) return fallback; const date = new Date(value); return Number.isNaN(date.getTime()) ? fallback : new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(date); }
function discoverySiteIdentity(value) { try { const raw = String(value || ""), url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`); return url.hostname.toLowerCase().replace(/^www\./i, ""); } catch { return ""; } }
function renderPending(rows) {
  const root = byId("pendingDiscoveries"); root.replaceChildren();
  const filter = byId("pendingFilter").value.trim().toLocaleLowerCase("fr");
  const visibleRows = rows.filter(source => !filter || [source.name, source.domain, source.feedUrl, source.pageUrl, ...(source.recentTitles || [])].join(" ").toLocaleLowerCase("fr").includes(filter));
  byId("pendingCount").textContent = `(${visibleRows.length}${visibleRows.length !== rows.length ? `/${rows.length}` : ""})`;
  if (!visibleRows.length) { const empty = document.createElement("p"); empty.className = "empty discovery-empty"; empty.textContent = filter ? "Aucune source ne correspond au filtre." : "Aucune nouvelle source à examiner pour cette recherche."; root.append(empty); return; }
  const { wrap, body } = table(["Source", "Date / Statut", "Aperçu", "Actions"], "pending-table");
  for (const source of visibleRows) {
    const row = document.createElement("tr"), sourceCell = document.createElement("td"); sourceCell.className = "discovery-source-cell";
    const name = document.createElement("strong"); name.textContent = source.name || source.domain || "Source sans nom";
    const feed = document.createElement("span"); addFeedLink(feed, source.feedUrl, `${source.domain || "Domaine inconnu"} · ${source.feedUrl || ""}`);
    sourceCell.append(name, feed); row.append(sourceCell);
    const status = document.createElement("td"); status.className = "discovery-status-cell";
    const date = document.createElement("span"); date.textContent = dateLabel(source.lastPublishedAt, "Date inconnue");
    const state = document.createElement("small"); state.textContent = `Flux ${methodLabel(source.method)} · ${source.status === "active" ? "activité récente" : source.status === "inactive" ? "activité ancienne" : "à vérifier"}`;
    status.append(date, state); row.append(status);
    addTextCell(row, (source.recentTitles || []).slice(0, 3).join(" · ") || "Aucun titre récent", "discovery-preview");
    const controls = document.createElement("td"), actionGroup = document.createElement("div"); controls.className = "discovery-actions"; actionGroup.className = "discovery-action-group";
    actionGroup.append(makeButton("Visiter", () => browser.tabs.create({ url: source.pageUrl || source.feedUrl, active: true }), "compact-button"));
    actionGroup.append(makeButton("Traiter", async event => {
      const identity = discoverySiteIdentity(source.domain || source.pageUrl || source.feedUrl || source.identity), previous = pendingRows;
      pendingRows = pendingRows.filter(row => discoverySiteIdentity(row.domain || row.pageUrl || row.feedUrl || row.identity) !== identity);
      renderPending(pendingRows); event.currentTarget.disabled = true;
      const result = await browser.runtime.sendMessage({ type: "processDiscoveredSource", source });
      if (result?.error) { pendingRows = previous; renderPending(pendingRows); showStatus(`Traitement impossible : ${result.error}`); return; }
      await refreshLists(); showStatus("Source marquée comme traitée. Elle ne sera plus proposée.");
    }, "compact-button primary-button")); controls.append(actionGroup); row.append(controls); body.append(row);
  }
  root.append(wrap);
}
function renderExplored(rows = [], diagnostics = {}) {
  const root = byId("exploredResults"); root.replaceChildren();
  byId("exploredCount").textContent = `${rows.length} domaines · ${Number(diagnostics.parsedFeeds) || 0} flux analysés · ${rows.filter(row => row.status === "new" || row.status === "inactive").length} nouvelles sources`;
  if (!rows.length) { const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "Aucun domaine de recherche à afficher."; root.append(empty); return; }
  const { wrap, body } = table(["Domaine", "Statut", "Détail"], "explored-table");
  const labels = { new: "Flux trouvé", active: "Flux trouvé", inactive: "Flux trouvé · inactif", pending: "Déjà en attente", followed: "Déjà suivie", processed: "Déjà traitée", permission: "Autorisation requise", "no-feed": "Aucun flux validé", unavailable: "Aucun flux validé", duplicate: "Doublon", error: "Erreur", excluded: "Écarté" };
  for (const row of rows) {
    const line = document.createElement("tr"), domainCell = document.createElement("td"), domain = document.createElement("strong"); domain.textContent = row.domain || "Domaine inconnu"; domainCell.append(domain);
    const pageLink = document.createElement("a"); pageLink.href = row.url; pageLink.textContent = row.title || row.url; pageLink.target = "_blank"; pageLink.rel = "noopener"; pageLink.className = "discovery-secondary-link"; domainCell.append(pageLink); line.append(domainCell);
    addTextCell(line, labels[row.status] || row.status || "Inconnu", "discovery-status-cell");
    const detail = document.createElement("td"), detailText = document.createElement("span"), diagnostics = document.createElement("details"); detail.className = "explored-detail-cell"; detailText.className = "explored-detail-summary"; detailText.textContent = row.reason || row.snippet || "Aucun détail."; detail.append(detailText);
    const diagnosticsSummary = document.createElement("summary"); diagnosticsSummary.textContent = `${row.feeds?.length || 0} URL testée${row.feeds?.length === 1 ? "" : "s"} · Détails`; diagnostics.append(diagnosticsSummary);
    const diagnosticBody = document.createElement("div"); diagnosticBody.className = "explored-diagnostics";
    const pageInfo = document.createElement("p"); pageInfo.textContent = `Page : ${row.url || "URL inconnue"}`; diagnosticBody.append(pageInfo);
    if (row.snippet) { const snippet = document.createElement("p"); snippet.textContent = `Extrait : ${row.snippet}`; diagnosticBody.append(snippet); }
    const fullReason = document.createElement("p"); fullReason.textContent = `Diagnostic : ${row.reason || "Aucun détail."}`; diagnosticBody.append(fullReason);
    for (const feed of row.feeds || []) { const info = document.createElement("p"), link = document.createElement("a"); link.href = feed.url; link.textContent = feed.url; link.target = "_blank"; link.rel = "noopener"; info.append(link, document.createTextNode(` · ${feed.status}${feed.lastPublishedAt ? ` · ${dateLabel(feed.lastPublishedAt)}` : ""}${feed.reason ? ` · ${feed.reason}` : ""}`)); diagnosticBody.append(info); }
    diagnostics.append(diagnosticBody); detail.append(diagnostics);
    line.append(detail); body.append(line);
  }
  root.append(wrap);
}
function renderProcessed(rows) {
  const root = byId("processedSources"); root.replaceChildren();
  const filter = byId("processedFilter").value.trim().toLocaleLowerCase("fr");
  const visibleRows = rows.filter(source => !filter || [source.name, source.domain, source.feedUrl, ...(source.feedUrls || [])].join(" ").toLocaleLowerCase("fr").includes(filter));
  byId("processedCount").textContent = `(${rows.length})`;
  if (!visibleRows.length) { const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = rows.length ? "Aucune source ne correspond au filtre." : "Aucune source traitée."; root.append(empty); return; }
  const { wrap, body } = table(["Source", "Statut", "Action"], "processed-table");
  for (const source of visibleRows) {
    const row = document.createElement("tr"), sourceCell = document.createElement("td"), heading = document.createElement("strong"); heading.textContent = source.name || source.domain || "Source sans nom"; sourceCell.append(heading);
    const feeds = source.feedUrls?.length ? source.feedUrls : [source.feedUrl].filter(Boolean);
    const feedLine = document.createElement("span"); addFeedLink(feedLine, feeds[0], `${source.domain || "Domaine inconnu"} · ${feeds[0] || ""}`); sourceCell.append(feedLine); row.append(sourceCell);
    addTextCell(row, `${source.followed ? "Déjà suivie" : "Traitée"} le ${dateLabel(source.processedAt)}`, "discovery-status-cell");
    const actions = document.createElement("td"); actions.className = "discovery-actions";
    if (!source.followed) {
      const reconsider = makeButton("Réexaminer", async () => { const result = await browser.runtime.sendMessage({ type: "reconsiderProcessedSource", domain: source.domain }); if (result?.error) { showStatus(`Réexamen impossible : ${result.error}`); return; } await refreshLists(); showStatus("Source retirée de la mémoire. Une prochaine recherche pourra la proposer."); });
      reconsider.className = "compact-button"; actions.append(reconsider);
    }
    row.append(actions); body.append(row);
  }
  root.append(wrap);
}
async function refreshLists() { const { processedSources } = await storageLists(); processedRows = Array.isArray(processedSources) ? processedSources : []; const processedIds = new Set(processedRows.map(row => discoverySiteIdentity(row.domain || row.pageUrl || row.feedUrl || row.identity)).filter(Boolean)); pendingRows = pendingRows.filter(row => !processedIds.has(discoverySiteIdentity(row.domain || row.pageUrl || row.feedUrl || row.identity))); renderPending(pendingRows); renderProcessed(processedRows); }
byId("pendingFilter").addEventListener("input", () => renderPending(pendingRows));
byId("processedFilter").addEventListener("input", () => { if (byId("processedFilter").value) byId("processedDetails").open = true; renderProcessed(processedRows); });
async function preparePermissionRequest(result, keywords) {
  const origins = [...new Set(result.permissionOrigins || [])].slice(0, 20), missing = [];
  for (const origin of origins) if (!await browser.permissions.contains({ origins: [origin] })) missing.push(origin);
  pendingPermissionRequest = missing.length ? { origins: missing, keywords } : null;
  permissionButton.hidden = !pendingPermissionRequest;
  permissionButton.textContent = pendingPermissionRequest ? `Autoriser ${missing.length} domaine(s) et revérifier` : "";
  return missing.length;
}
permissionButton.addEventListener("click", async () => {
  if (!pendingPermissionRequest) return;
  const buttonRequest = pendingPermissionRequest;
  permissionButton.disabled = true;
  try {
    const request = browser.permissions.request({ origins: buttonRequest.origins });
    const granted = await request;
    if (!granted) { showStatus("Accès refusé. Ces sites ne seront pas proposés tant que Firefox ne leur autorise pas l’accès."); return; }
    pendingPermissionRequest = null; permissionButton.hidden = true;
    pendingRows = []; renderPending(pendingRows);
    showStatus("Accès accordé. Nouvelle vérification des flux…");
    const result = await browser.runtime.sendMessage({ type: "discoverSources", keywords: buttonRequest.keywords });
    if (result?.error) throw new Error(result.error);
    pendingRows = Array.isArray(result.results) ? result.results : [];
    await refreshLists();
    renderExplored(result.explored || [], result.diagnostics);
    byId("discoveryProgress").hidden = true;
    const morePermissions = await preparePermissionRequest(result, buttonRequest.keywords);
    showStatus(`${explainDiscoveryResult(result)}${morePermissions ? ` Autorisez les ${morePermissions} autre(s) domaine(s) pour terminer la vérification.` : ""}`);
  } catch (error) { showStatus(error.message || "Impossible d’autoriser les domaines concernés."); }
  finally { permissionButton.disabled = false; }
});
discoveryForm.addEventListener("submit", async event => {
  event.preventDefault(); const button = byId("discoverySubmit"); button.disabled = true;
  try {
    if (!await browser.permissions.request({ origins: ["https://duckduckgo.com/*"] })) throw new Error("Autorisation DuckDuckGo refusée. La recherche n’a pas été lancée.");
    const keywords = [...new Set([termsInput.value, prioritySelect.value].flatMap(value => value.split(/[\n,;]+/)).map(value => value.trim()).filter(Boolean))].slice(0, 8);
    if (!keywords.length) throw new Error("Saisissez un ou plusieurs mots-clés.");
    pendingRows = []; renderPending(pendingRows);
    showProgress("Recherche DuckDuckGo");
    pendingPermissionRequest = null; permissionButton.hidden = true;
    const result = await browser.runtime.sendMessage({ type: "discoverSources", keywords });
    if (result?.error) throw new Error(result.error);
    pendingRows = Array.isArray(result.results) ? result.results : [];
    await refreshLists();
    renderExplored(result.explored || [], result.diagnostics);
    byId("discoveryProgress").hidden = true;
    const missingPermissions = await preparePermissionRequest(result, keywords);
    showStatus(`${explainDiscoveryResult(result)}${missingPermissions ? ` ${missingPermissions} domaine(s) attendent une autorisation ciblée.` : " L’historique des sources traitées et suivies reste pris en compte."}`);
  } catch (error) { byId("discoveryProgress").hidden = true; showStatus(error.message || "La découverte a échoué."); }
  finally { button.disabled = false; }
});
(async () => {
  const state = await browser.runtime.sendMessage({ type: "state" });
  for (const priority of state.settings?.priorities || []) { const option = document.createElement("option"); option.value = priority.term; option.textContent = `${priority.term} · ${{ high: "Haute", medium: "Moyenne", low: "Basse" }[priority.level] || "Prioritaire"}`; prioritySelect.append(option); }
  await refreshLists();
})().catch(error => showStatus(`Initialisation impossible : ${error.message}`));
browser.storage.onChanged.addListener((changes, area) => { if (area === "local" && (changes.processedSources || changes.sources)) refreshLists().catch(() => {}); });
browser.runtime.onMessage.addListener(message => {
  if (message?.type === "discoveryProgress") showProgress(message.phase, message.current, message.total);
});
window.addEventListener("pagehide", () => { pendingRows = []; renderPending(pendingRows); });
window.addEventListener("pageshow", event => { if (event.persisted) { pendingRows = []; renderPending(pendingRows); refreshLists().catch(() => {}); } });
