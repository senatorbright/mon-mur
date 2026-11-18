"use strict";
const badgeLabels = {
  walls: count => `${count} article${count === 1 ? "" : "s"} à lire dans l’ensemble des murs`,
  discovery: count => `${count} source${count === 1 ? " à examiner" : "s à examiner"}`,
  sources: count => `${count} source${count === 1 ? " en erreur" : "s en erreur"}`,
  likes: count => `${count} J’aime enregistré${count === 1 ? "" : "s"}`,
  later: count => `${count} élément${count === 1 ? "" : "s"} à consulter plus tard`,
  archived: count => `${count} article${count === 1 ? " archivé" : "s archivés"}`
};
const mainSidebar = document.querySelector(".sidebar");
if (mainSidebar) {
  document.body.classList.add("mobile-sidebar-layout");
  if (!mainSidebar.id) mainSidebar.id = "mainSidebar";
  let sidebarToggle = document.querySelector("#sidebarToggle");
  if (!sidebarToggle) {
    sidebarToggle = document.createElement("button");
    sidebarToggle.id = "sidebarToggle";
    sidebarToggle.className = "mobile-sidebar-toggle";
    sidebarToggle.type = "button";
    sidebarToggle.innerHTML = '<span aria-hidden="true">☰</span>';
    mainSidebar.insertAdjacentElement("afterend", sidebarToggle);
  }
  sidebarToggle.setAttribute("aria-controls", mainSidebar.id);
  sidebarToggle.setAttribute("aria-label", "Afficher le menu");
  sidebarToggle.setAttribute("title", "Afficher le menu");
  sidebarToggle.setAttribute("aria-expanded", "false");
  const setMobileSidebarOpen = open => {
    document.body.classList.toggle("mobile-sidebar-open", open);
    sidebarToggle.setAttribute("aria-expanded", String(open));
    sidebarToggle.setAttribute("aria-label", open ? "Masquer le menu" : "Afficher le menu");
    sidebarToggle.setAttribute("title", open ? "Masquer le menu" : "Afficher le menu");
  };
  sidebarToggle.addEventListener("click", () => setMobileSidebarOpen(true));
  document.addEventListener("pointerdown", event => {
    if (document.body.classList.contains("mobile-sidebar-open") && !mainSidebar.contains(event.target)) setMobileSidebarOpen(false);
  });
  let touchStart = null;
  window.addEventListener("touchstart", event => {
    if (event.touches.length !== 1) return;
    const x = event.touches[0].clientX;
    if (x < 24 || document.body.classList.contains("mobile-sidebar-open")) touchStart = { x, y: event.touches[0].clientY };
  }, { passive: true });
  window.addEventListener("touchend", event => {
    if (!touchStart) return;
    const touch = event.changedTouches[0], dx = touch.clientX - touchStart.x, dy = touch.clientY - touchStart.y;
    const isOpen = document.body.classList.contains("mobile-sidebar-open");
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (!isOpen && touchStart.x < 24 && dx > 0) setMobileSidebarOpen(true);
      else if (isOpen && dx < 0) setMobileSidebarOpen(false);
    }
    touchStart = null;
  }, { passive: true });
}
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
