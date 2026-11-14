"use strict";
const MMPY = (() => {
  function parseRelativeDate(value, now = Date.now()) {
    const text = MMP.normalizeText(value);
    const match = text.match(/(?:il y a |)(\d+)\s*(second|sec|minute|min|hour|heure|h|day|jour|j|week|semaine|sem|month|mois|m|year|an|annee|a)s?\.?(?:\s|$)/);
    if (!match) return 0;
    const unit = match[2], amount = Number(match[1]);
    const scale = /second|sec/.test(unit) ? 1000 : /minute|min/.test(unit) ? 60000 : /hour|heure|^h$/.test(unit) ? 3600000 : /day|jour|^j$/.test(unit) ? 86400000 : /week|semaine|sem/.test(unit) ? 604800000 : /month|mois|^m$/.test(unit) ? 2592000000 : 31536000000;
    return now - amount * scale;
  }
  function parseSearch(html, keyword, now = Date.now(), diagnostics = null) {
    const marker = html.indexOf("ytInitialData");
    if (marker < 0) throw new Error("YouTube n’a pas fourni les données de recherche attendues.");
    const start = html.indexOf("{", html.indexOf("=", marker));
    if (start < 0) throw new Error("Réponse de recherche YouTube invalide.");
    let depth = 0, quoted = false, escaped = false, end = -1;
    for (let i = start; i < html.length; i++) {
      const c = html[i];
      if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; continue; }
      if (c === '"') quoted = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) { end = i + 1; break; }
    }
    if (end < 0) throw new Error("Réponse de recherche YouTube tronquée.");
    let data;
    try { data = JSON.parse(html.slice(start, end)); } catch { throw new Error("Données de recherche YouTube illisibles."); }
    const videos = [], visit = value => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      const item = value.videoRenderer;
      if (item?.videoId && item.title) {
        if (diagnostics) diagnostics.received++;
        const title = (item.title.runs || []).map(run => run.text || "").join("") || item.title.simpleText || "";
        const readRuns = value => Array.isArray(value?.runs) ? value.runs.map(run => run.text || "").join("") : value?.simpleText || "";
        const descriptionFromSnippet = readRuns(item.descriptionSnippet);
        const descriptionFromMetadata = item.detailedMetadataSnippets?.find(metadata => /description/i.test(readRuns(metadata.snippetHoverText)))?.snippetText;
        // Search results can expose both a short description snippet and a
        // longer description preview. Prefer the most complete text available
        // in this response so known links can be detected before card expand.
        const description = [descriptionFromSnippet, readRuns(descriptionFromMetadata)]
          .map(value => value.trim()).sort((a, b) => b.length - a.length)[0] || "";
        const owner = item.ownerText?.runs?.map(run => run.text || "").join("") || item.longBylineText?.runs?.map(run => run.text || "").join("") || "YouTube";
        const publishedLabel = item.publishedTimeText?.simpleText || "";
        const channelId = item.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || item.longBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || "";
        const thumb = item.thumbnail?.thumbnails?.at(-1)?.url || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;
        if (MMP.matchTerm(title, keyword)) videos.push({ id: item.videoId, title, summary: description, channelName: owner, channelId, image: MMP.cleanUrl(thumb, "https://www.youtube.com/"), publishedLabel, publishedAt: parseRelativeDate(publishedLabel, now), live: !!item.badges?.some(b => /live/i.test(JSON.stringify(b))) });
        else if (diagnostics) diagnostics.titleRejected++;
      }
      for (const child of Object.values(value)) visit(child);
    };
    visit(data);
    return [...new Map(videos.map(video => [video.id, video])).values()];
  }
  function keywordsFromWalls(walls, wallSettings) {
    const unique = new Map();
    const items = Array.isArray(wallSettings?.priorities) ? wallSettings.priorities : Array.isArray(wallSettings) ? wallSettings : Object.values(wallSettings || {}).flatMap(config => config?.priorities || []);
    for (const item of items) {
      const term = (typeof item === "string" ? item : item.term || "").trim(), key = MMP.normalizeText(term);
      if (term && !unique.has(key)) unique.set(key, term);
    }
    return [...unique.values()];
  }
  function parsePeerTubeSearch(payload, keyword, diagnostics = null) {
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    if (diagnostics) diagnostics.received += rows.length;
    const videos = [];
    for (const item of rows) {
      const id = String(item?.uuid || item?.shortUUID || item?.id || "");
      const title = String(item?.name || "").trim();
      const publishedAt = Date.parse(item?.publishedAt || item?.originallyPublishedAt || "");
      const canonicalUrl = MMP.cleanUrl(item?.url || (item?.uuid ? `https://${item?.account?.host || "peertube.social"}/videos/watch/${id}` : ""), "https://search.joinpeertube.org/");
      if (item?.language?.id !== "fr") { if (diagnostics) diagnostics.languageRejected++; continue; }
      if (!MMP.matchTerm(title, keyword)) { if (diagnostics) diagnostics.titleRejected++; continue; }
      if (!id || !title || !Number.isFinite(publishedAt) || !canonicalUrl) { if (diagnostics) diagnostics.invalidRejected++; continue; }
      videos.push({ id, title, summary: String(item?.description || item?.truncatedDescription || "").trim(), canonicalUrl, publishedAt, publishedLabel: new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(publishedAt), channelName: item?.channel?.displayName || item?.account?.displayName || item?.account?.name || "PeerTube", image: MMP.cleanUrl(item?.thumbnailPath || "", canonicalUrl), platform: "peertube" });
    }
    return [...new Map(videos.map(video => [video.id, video])).values()];
  }
  function trackResults(searchState, videos, keyword, now, baselineInitialized) {
    const state = searchState || { initializedAt: now, seen: {} }, articles = [];
    let duplicate = 0;
    let changed = !searchState;
    for (const video of videos) {
      if (state.seen[video.id]) { duplicate++; continue; }
      // Keep results with an unknown publication date eligible for the next
      // refresh. YouTube sometimes changes the localized date label, and
      // recording these as seen here would hide a newly published video forever.
      if (!video.publishedLabel || !Number.isFinite(video.publishedAt) || video.publishedAt <= 0) continue;
      state.seen[video.id] = { firstSeenAt: now, lastSeenAt: now, publishedAt: video.publishedAt || 0 };
      changed = true;
      if (baselineInitialized && video.publishedAt > state.initializedAt) {
        articles.push({ ...video, youtubeKeyword: keyword });
      }
    }
    return { state, articles, changed, duplicate };
  }
  return { parseSearch, parsePeerTubeSearch, parseRelativeDate, keywordsFromWalls, trackResults };
})();
