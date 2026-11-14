"use strict";
const $ = selector => document.querySelector(selector);
const rows = $("#likesRows"), count = $("#likesCount"), pageSizeSelect = $("#pageSize");
const state = { likes: [], pageSize: 50, page: 1, sort: "likedAt", direction: -1, filters: {} };
const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const dateText = value => Number.isFinite(Number(value)) && Number(value) > 0 ? dateFormatter.format(new Date(Number(value))) : "";
const searchable = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim();
function filteredLikes() {
  return state.likes.filter(item => {
    const values = { title: item.title, source: item.source, likedAt: dateText(item.likedAt), publishedAt: dateText(item.publishedAt), language: item.language || "" };
    return Object.entries(state.filters).every(([key, query]) => !query || searchable(values[key]).includes(searchable(query)));
  }).sort((a, b) => {
    const left = a[state.sort] ?? "", right = b[state.sort] ?? "";
    const comparison = state.sort === "likedAt" || state.sort === "publishedAt"
      ? (Number(left) || 0) - (Number(right) || 0)
      : String(left).localeCompare(String(right), "fr", { sensitivity: "base", numeric: true });
    return comparison * state.direction;
  });
}
function render() {
  const filtered = filteredLikes(), pageCount = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.page = Math.min(state.page, pageCount);
  const start = (state.page - 1) * state.pageSize, visible = filtered.slice(start, start + state.pageSize);
  rows.replaceChildren();
  for (const item of visible) {
    const tr = document.createElement("tr");
    const titleCell = document.createElement("td"), title = document.createElement("a");
    title.className = "likes-title"; title.href = MMP.cleanUrl(item.url); title.target = "_blank"; title.rel = "noopener noreferrer"; title.textContent = item.title || "Sans titre"; titleCell.append(title);
    const source = document.createElement("td"); source.textContent = item.source || "—";
    const likedAt = document.createElement("td"); likedAt.textContent = dateText(item.likedAt) || "—";
    const publishedAt = document.createElement("td"); publishedAt.textContent = dateText(item.publishedAt) || "—";
    const language = document.createElement("td"); language.textContent = item.language || "—";
    const actionCell = document.createElement("td"); actionCell.className = "likes-action-cell";
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "likes-remove"; remove.title = "Retirer le J’aime"; remove.setAttribute("aria-label", `Retirer le J’aime : ${item.title || "contenu"}`); remove.textContent = "×";
    remove.onclick = async () => { remove.disabled = true; await browser.runtime.sendMessage({ type: "removeLike", normalizedUrl: item.normalizedUrl }); state.likes = state.likes.filter(like => like.normalizedUrl !== item.normalizedUrl); render(); };
    actionCell.append(remove); tr.append(titleCell, source, likedAt, publishedAt, language, actionCell); rows.append(tr);
  }
  $("#likesEmpty").hidden = state.likes.length > 0;
  $("#likesNoResults").hidden = state.likes.length === 0 || filtered.length > 0;
  $("#likesTableWrap").hidden = state.likes.length === 0;
  count.textContent = state.likes.length ? `${filtered.length} résultat${filtered.length === 1 ? "" : "s"}${filtered.length !== state.likes.length ? ` sur ${state.likes.length}` : ""}` : "";
  const pagination = $("#likesPagination"); pagination.hidden = filtered.length === 0;
  $("#pageInfo").textContent = `${start + 1}–${Math.min(start + state.pageSize, filtered.length)} sur ${filtered.length} · page ${state.page} / ${pageCount}`;
  $("#previousPage").disabled = state.page <= 1; $("#nextPage").disabled = state.page >= pageCount;
  for (const button of document.querySelectorAll(".likes-sort")) {
    const active = button.dataset.sort === state.sort;
    button.setAttribute("aria-sort", active ? (state.direction === 1 ? "ascending" : "descending") : "none");
    button.textContent = `${button.dataset.label || button.textContent.replace(/[ ↑↓]$/, "")}${active ? state.direction === 1 ? " ↑" : " ↓" : ""}`;
    button.dataset.label ||= button.textContent.replace(/[ ↑↓]$/, "");
  }
}
async function load() {
  const [likes, stored] = await Promise.all([browser.runtime.sendMessage({ type: "likes" }), browser.storage.local.get({ likesPageSize: 50 })]);
  state.likes = likes; state.pageSize = [50, 100, 250, 500, 1000].includes(Number(stored.likesPageSize)) ? Number(stored.likesPageSize) : 50;
  pageSizeSelect.value = String(state.pageSize); render();
}
for (const input of document.querySelectorAll("[data-filter]")) input.addEventListener("input", () => { state.filters[input.dataset.filter] = input.value; state.page = 1; render(); });
for (const button of document.querySelectorAll(".likes-sort")) button.addEventListener("click", () => { const key = button.dataset.sort; state.direction = state.sort === key ? -state.direction : 1; state.sort = key; render(); });
pageSizeSelect.addEventListener("change", async () => { state.pageSize = Number(pageSizeSelect.value); state.page = 1; await browser.storage.local.set({ likesPageSize: state.pageSize }); render(); });
$("#previousPage").onclick = () => { state.page--; render(); };
$("#nextPage").onclick = () => { state.page++; render(); };
browser.runtime.onMessage.addListener(message => { if (message?.type === "likesUpdated") load().catch(() => {}); });
load().catch(error => { $("#likesEmpty").hidden = false; $("#likesEmpty").textContent = `Impossible de charger les J’aime : ${error.message}`; });
