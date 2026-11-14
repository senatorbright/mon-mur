"use strict";
const badgeLabels = {
  walls: count => `${count} article${count === 1 ? "" : "s"} à lire dans l’ensemble des murs`,
  discovery: count => `${count} source${count === 1 ? " à examiner" : "s à examiner"}`,
  sources: count => `${count} source${count === 1 ? " en erreur" : "s en erreur"}`,
  likes: count => `${count} J’aime enregistré${count === 1 ? "" : "s"}`,
  later: count => `${count} élément${count === 1 ? "" : "s"} à consulter plus tard`,
  archived: count => `${count} article${count === 1 ? " archivé" : "s archivés"}`
};
async function updateSidebarCounts() {
  const counts = await browser.runtime.sendMessage({ type: "sidebarCounts" });
  if (!counts || counts.error) return;
  for (const [key, describe] of Object.entries(badgeLabels)) {
    const badge = document.querySelector(`[data-badge-for="${key}"]`);
    const anchor = document.querySelector(`[data-count-key="${key}"]`);
    if (!badge || !anchor) continue;
    const count = Number(counts[key]) || 0;
    badge.textContent = String(count);
    badge.hidden = count <= 0;
    badge.title = describe(count);
    anchor.title = describe(count);
  }
}
let updatePending = false;
function scheduleSidebarUpdate() {
  if (updatePending) return;
  updatePending = true;
  setTimeout(() => {
    updatePending = false;
    updateSidebarCounts().catch(() => {});
  }, 100);
}
browser.runtime.onMessage.addListener(message => {
  if (["articlesUpdated", "likesUpdated", "wallsUpdated", "sourcesUpdated"].includes(message?.type)) scheduleSidebarUpdate();
});
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ["sources", "articleStates", "wallSettings", "walls", "automaticWalls", "settings", "videoProviders", "socialProviders", "processedSources", "refusedSources", "blueskyFrenchOnly", "blueskyRequireImage", "linkedinRequireImage"].some(key => key in changes)) scheduleSidebarUpdate();
});
updateSidebarCounts().catch(() => {});
