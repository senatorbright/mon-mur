"use strict";
const ALARM = "mmp-refresh", DEFAULT_REFRESH_INTERVAL = 15, REFRESH_INTERVALS = [5, 10, 15, 30, 60, 1440];
async function refreshInterval() { const { refreshIntervalMinutes } = await browser.storage.local.get({ refreshIntervalMinutes: DEFAULT_REFRESH_INTERVAL }); const value = Number(refreshIntervalMinutes); return REFRESH_INTERVALS.includes(value) ? value : DEFAULT_REFRESH_INTERVAL; }
const MAX_WALLS = 10;
let settingsWriteQueue = Promise.resolve();
async function hasSearchTermsConsent() {
  const granted = (await browser.permissions.getAll()).data_collection;
  return Array.isArray(granted) && granted.includes("searchTerms");
}
async function hasCinemaLookupConsent() {
  const granted = (await browser.permissions.getAll()).data_collection;
  return Array.isArray(granted) && granted.includes("searchTerms") && granted.includes("websiteContent");
}
function stableStateJson(value){if(Array.isArray(value))return `[${value.map(stableStateJson).join(",")}]`;if(value&&typeof value==="object")return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stableStateJson(value[key])}`).join(",")}}`;return JSON.stringify(value);}
const AUTO_WALLS = [{id:"auto-read",name:"Archivés",status:"read"},{id:"auto-later",name:"À consulter plus tard",status:"later"},{id:"auto-youtube",name:"Vidéos auto",kind:"youtube"},{id:"auto-bluesky",name:"Réseaux Sociaux Auto",shortName:"RS Auto",kind:"bluesky"},{id:"auto-documents",name:"PDF auto",kind:"documents"}];
const YOUTUBE_SOURCE_ID = "youtube-keyword-search";
const PEERTUBE_SOURCE_ID = "peertube-keyword-search";
const BLUESKY_SOURCE_ID = "bluesky-keyword-search";
const LINKEDIN_SOURCE_ID = "linkedin-keyword-search";
const CROWDBUNKER_SOURCE_ID = "crowdbunker-keyword-search";
const RUMBLE_SOURCE_ID = "rumble-keyword-search";
const INTERNET_ARCHIVE_SOURCE_PREFIX = "internet-archive:";
const AUTOMATIC_SOCIAL_SNAPSHOT_KEY = "automaticSocialArticleSnapshots";
const SOCIAL_REFRESH_BASELINE_VERSION = 1;
const AUTOMATIC_SOCIAL_SOURCE_IDS = new Set([BLUESKY_SOURCE_ID, LINKEDIN_SOURCE_ID]);
let blueskyRefreshController = null, linkedinRefreshController = null, videoRefreshController = null, archiveSearchController = null;
// Observe only tabs explicitly opened for a LinkedIn RSS card, and only briefly.
const pendingLinkedInTabs = new Map();
const pendingLinkedInArticles = new Map();
const MAX_LINKEDIN_RESOLUTIONS = 2;
async function associateLinkedInUrl(articleId, value) {
  const article = await MMPDB.get(String(articleId || ""));
  if (!article || !(article.sourceIds || [article.sourceId]).includes(LINKEDIN_SOURCE_ID)) return null;
  let url; try { url = new URL(String(value || "").trim()); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !/(^|\.)linkedin\.com$/i.test(url.hostname) || !/^\/(?:posts|pulse|feed\/update)\//i.test(url.pathname)) return null;
  url.hash = "";
  let path = url.pathname; try { path = decodeURIComponent(path); } catch {}
  const activityId = path.match(/(?:activity-|urn:li:activity:)(\d{10,25})/i)?.[1] || "";
  const updated = { ...article, linkedinOriginalUrl: url.href, linkedinActivityUrn: activityId ? `urn:li:activity:${activityId}` : "" };
  await MMPDB.putMany([updated]);
  browser.runtime.sendMessage({ type: "articlesUpdated" }).catch(() => {});
  return updated;
}
function linkedInTabListener(tabId, changeInfo, tab) {
  const pending = pendingLinkedInTabs.get(tabId);
  if (!pending) return;
  if (Date.now() > pending.expiresAt) {
    if (pending.temporary) finishLinkedInResolution(tabId, { error: "Délai de récupération dépassé." });
    else pendingLinkedInTabs.delete(tabId);
    return;
  }
  const candidate = changeInfo.url || (changeInfo.status === "complete" ? tab.url : "");
  if (!candidate) return;
  let url; try { url = new URL(candidate); } catch { return; }
  if (/^consent\.google\./i.test(url.hostname) || url.hostname === "consent.google.com" || /\/consent(?:\/|$)/i.test(url.pathname)) {
    if (pending.temporary) finishLinkedInResolution(tabId, { error: "Google demande une confirmation. Ouvrez le résultat manuellement pour continuer." });
    return;
  }
  if (url.protocol !== "https:" || !/(^|\.)linkedin\.com$/i.test(url.hostname) || !/^\/(?:posts|pulse|feed\/update)\//i.test(url.pathname)) {
    // Google News can finish rendering its RSS article page before its
    // publisher redirect runs. Keep observing Google News until LinkedIn is
    // reached or the overall 90 second deadline expires.
    const stillOnGoogleNews = url.protocol === "https:" && /(^|\.)news\.google\.com$/i.test(url.hostname);
    if (pending.temporary && changeInfo.status === "complete" && !stillOnGoogleNews) finishLinkedInResolution(tabId, { error: "La publication n’a pas redirigé vers une URL LinkedIn." });
    return;
  }
  if (pending.temporary) {
    associateLinkedInUrl(pending.articleId, url.href).then(updated => finishLinkedInResolution(tabId, updated ? { article: updated } : { error: "La publication n’a pas pu être associée." })).catch(error => finishLinkedInResolution(tabId, { error: error.message }));
  } else {
    pendingLinkedInTabs.delete(tabId);
    associateLinkedInUrl(pending.articleId, url.href).catch(error => console.warn("Association automatique LinkedIn impossible :", error));
  }
}
browser.tabs?.onUpdated?.addListener(linkedInTabListener);
function finishLinkedInResolution(tabId, result) {
  const pending = pendingLinkedInTabs.get(tabId); if (!pending || pending.finished) return;
  pending.finished = true; pendingLinkedInTabs.delete(tabId); pendingLinkedInArticles.delete(pending.articleId);
  clearTimeout(pending.timer);
  if (pending.removedListener) browser.tabs.onRemoved.removeListener(pending.removedListener);
  browser.tabs.remove(tabId).catch(() => {});
  pending.resolve(result);
}
async function resolveLinkedInOnExpand(articleId) {
  const article = await MMPDB.get(String(articleId || ""));
  if (!article || !(article.sourceIds || [article.sourceId]).includes(LINKEDIN_SOURCE_ID)) return { error: "Carte LinkedIn introuvable." };
  if (article.linkedinOriginalUrl) return { article };
  if (pendingLinkedInArticles.has(article.id)) return pendingLinkedInArticles.get(article.id).promise;
  if (pendingLinkedInArticles.size >= MAX_LINKEDIN_RESOLUTIONS) return { error: "Une autre récupération LinkedIn est en cours. Réessayez dans un instant." };
  if (!browser.tabs.hide || !browser.permissions.contains || !await browser.permissions.contains({ permissions: ["tabHide"] })) return { error: "Le masquage d’onglet n’est pas autorisé. Ouvrez le résultat Google Actualités manuellement." };
  let googleUrl; try { googleUrl = new URL(article.canonicalUrl); } catch { return { error: "Lien Google Actualités invalide." }; }
  if (googleUrl.protocol !== "https:" || !/(^|\.)news\.google\.com$/i.test(googleUrl.hostname)) return { error: "Lien Google Actualités invalide." };
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  const record = { articleId: article.id, promise, resolve, expiresAt: Date.now() + 90000, finished: false, temporary: true, timer: null, removedListener: null };
  pendingLinkedInArticles.set(article.id, record);
  try {
    const tab = await browser.tabs.create({ url: googleUrl.href, active: false });
    record.tabId = tab.id;
    if (record.cancelled) { pendingLinkedInArticles.delete(article.id); browser.tabs.remove(tab.id).catch(() => {}); return promise; }
    record.removedListener = removedId => { if (removedId === tab.id) finishLinkedInResolution(tab.id, { error: "Navigation annulée." }); };
    browser.tabs.onRemoved.addListener(record.removedListener);
    pendingLinkedInTabs.set(tab.id, record);
    const hidden = await browser.tabs.hide(tab.id);
    if (record.finished) return promise;
    if (!hidden?.includes(tab.id)) { finishLinkedInResolution(tab.id, { error: "Firefox n’a pas pu masquer l’onglet. Ouvrez le résultat manuellement." }); return promise; }
    record.timer = setTimeout(() => finishLinkedInResolution(tab.id, { error: "Délai de récupération dépassé." }), 90000);
    if (tab.url) linkedInTabListener(tab.id, { url: tab.url }, tab);
  } catch (error) {
    if (record.tabId !== undefined) finishLinkedInResolution(record.tabId, { error: error.message });
    else { pendingLinkedInArticles.delete(article.id); resolve({ error: "Firefox n’a pas pu créer un onglet masqué. Ouvrez le résultat manuellement." }); }
  }
  return promise;
}
function cancelLinkedInResolution(articleId) {
  const record = pendingLinkedInArticles.get(String(articleId || ""));
  if (!record) return false;
  record.cancelled = true;
  const entry = [...pendingLinkedInTabs.entries()].find(([, pending]) => pending === record);
  if (entry) finishLinkedInResolution(entry[0], { cancelled: true });
  else if (record.tabId !== undefined) { pendingLinkedInArticles.delete(record.articleId); record.resolve({ cancelled: true }); browser.tabs.remove(record.tabId).catch(() => {}); }
  else { pendingLinkedInArticles.delete(record.articleId); record.resolve({ cancelled: true }); }
  return true;
}
browser.permissions.onRemoved.addListener(removed => {
  if (removed.data_collection?.some(type => ["searchTerms", "websiteContent"].includes(type))) {
    blueskyRefreshController?.abort(); linkedinRefreshController?.abort(); videoRefreshController?.abort(); archiveSearchController?.abort();
  }
});
const VIDEO_REFERENCE_ISO = "2026-10-21T00:00:00+02:00";
const YOUTUBE_WALL_URL = browser.runtime.getURL("wall.html");
const YOUTUBE_WALL_ORIGIN = new URL(YOUTUBE_WALL_URL).origin;
// Firefox omits moz-extension URLs from Referer by default. Forward the real
// wall URL only for YouTube embed frames opened by wall.html.
browser.webRequest.onBeforeSendHeaders.addListener(details => {
  if (details.type !== "sub_frame") return;
  let sourceUrl;
  try { sourceUrl = new URL(details.documentUrl || details.originUrl); }
  catch { return; }
  if (sourceUrl.origin !== YOUTUBE_WALL_ORIGIN || sourceUrl.pathname !== "/wall.html") return;
  const headers = details.requestHeaders || [];
  const referer = headers.find(header => header.name.toLowerCase() === "referer");
  if (referer) referer.value = YOUTUBE_WALL_URL;
  else headers.push({ name: "Referer", value: YOUTUBE_WALL_URL });
  return { requestHeaders: headers };
}, {
  urls: ["https://www.youtube.com/embed/*", "https://www.youtube-nocookie.com/embed/*"],
  types: ["sub_frame"]
}, ["blocking", "requestHeaders"]);
function wallId(name) { return `wall-${MMP.stableId(name + "-" + Date.now() + "-" + Math.random())}`; }
const defaultWallSettings = () => ({ excludedKeywords: [], excludedCategories: [], priorities: [], mode: "chronological", type: "auto", retentionDays: 3, faceFilterEnabled: false });
const GLOBAL_SETTING_KEYS = ["excludedKeywords", "excludedCategories", "priorities", "faceFilterMode", "faceDetectionThreshold", "affiliateModuleEnabled", "affiliateWarningsEnabled", "hideAffiliatedContent", "speechLanguage", "speechVoiceURI", "languageFilterEnabled", "languageFilterLanguages", "languageFilterKeepUnknown", "translationTargetLanguage", "translationEnabled", "archiveRetentionDays", "laterRetentionDays", "retentionSplitVersion"];
function settingsForWall(settings, wallSettings) { const combined = { ...settings, ...wallSettings }; for (const key of GLOBAL_SETTING_KEYS) combined[key] = settings[key]; return combined; }
function wallCinemaEnabled(wall, config) { return config?.type === "cinema"; }
function articleCinemaEnabled(wall, article, config) { return wallCinemaEnabled(wall, config); }
function sourceCinemaPolicy(source, current) { const walls=(source.wallIds||[]).map(id=>({wall:current.walls.find(item=>item.id===id),config:current.wallSettings[id]})).filter(item=>item.wall),cinemaWall=walls.find(item=>wallCinemaEnabled(item.wall,item.config))?.wall;return {force:!!cinemaWall,disabled:walls.length>0&&walls.every(item=>item.config?.type==="standard"),wall:cinemaWall}; }
async function state() {
  const raw = await browser.storage.local.get(null), defaults = MMP.DEFAULTS;
  const sources = Array.isArray(raw.sources) ? raw.sources : [];
  const settings = { ...defaults.settings, ...(raw.settings || {}) };
  const smartDetectionEnabled = settings.persuasionDetectionEnabled === true || settings.clickbaitDetectionEnabled === true;
  settings.persuasionDetectionEnabled = smartDetectionEnabled;
  settings.clickbaitDetectionEnabled = smartDetectionEnabled;
  settings.languageFilterEnabled = settings.languageFilterEnabled === true;
  settings.translationEnabled = settings.translationEnabled === true;
  if (!["fr", "en", "es", "it", "pt", "de", "nl", "pl"].includes(settings.translationTargetLanguage)) settings.translationTargetLanguage = "fr";
  settings.languageFilterKeepUnknown = settings.languageFilterKeepUnknown === true;
  settings.languageFilterLanguages = [...new Set((Array.isArray(settings.languageFilterLanguages) ? settings.languageFilterLanguages : ["fr", "en"]).filter(code => ["fr", "en", "es", "it", "pt", "de", "nl", "pl"].includes(code)))];
  if (settings.faceFilterMode === "blur-large") settings.faceFilterMode = "blur";
  if (!["off", "blur", "hide"].includes(settings.faceFilterMode)) settings.faceFilterMode = "off";
  settings.faceDetectionThreshold = Math.max(30, Math.min(90, Number(settings.faceDetectionThreshold) || 75));
  let walls = Array.isArray(raw.walls) && raw.walls.length ? raw.walls : null;
  let activeWallId = raw.activeWallId;
  let defaultWallId = raw.defaultWallId;
  let wallSettings = raw.wallSettings && typeof raw.wallSettings === "object" ? raw.wallSettings : {};
  if (!walls) {
    const actus = { id: "wall-actus", name: "Actus", order: 0 }, local = { id: "wall-info-locale", name: "Info locale", order: 1 };
    walls = [actus, local]; activeWallId = actus.id;
    const { retentionDays, archiveRetentionDays, laterRetentionDays, ...legacy } = settings;
    wallSettings[actus.id] = { ...defaultWallSettings(), ...legacy };
    for (const source of sources) source.wallIds = [actus.id];
  }
  walls = walls.slice(0, MAX_WALLS).map((wall, index) => ({...wall, id: String(wall.id), name: String(wall.name || `Mur ${index + 1}`), order: index}));
  const validIds = new Set(walls.map(w => w.id));
  const automaticWalls = { videos: raw.automaticWalls?.videos !== false, bluesky: raw.automaticWalls?.bluesky === true, internetArchive: raw.automaticWalls?.internetArchive !== false };
  const videoProviders = { youtube: raw.videoProviders?.youtube !== false, peertube: raw.videoProviders?.peertube !== false, crowdbunker: raw.videoProviders?.crowdbunker === true, rumble: raw.videoProviders?.rumble === true };
  const socialProviders = { bluesky: raw.socialProviders?.bluesky !== false, linkedin: raw.socialProviders?.linkedin === true };
  // Text-only Bluesky posts are common. Keep the image filter opt-in so the
  // default social feed does not silently discard matching posts.
  const blueskyRequireImage = raw.blueskyRequireImage === true;
  const blueskyFrenchOnly = raw.blueskyFrenchOnly === true;
  const linkedinRequireImage = raw.linkedinRequireImage === true;
  for (const source of sources) {
    source.strategyFailures = Math.max(0, Number(source.strategyFailures) || 0);
    source.lastRediscoveryAt = Number(source.lastRediscoveryAt) || 0;
    source.lastRediscoveryResult = String(source.lastRediscoveryResult || "");
    source.wallIds = [...new Set((source.wallIds || [walls[0].id]).filter(id => validIds.has(id)))];
  }
  const validAutomaticIds=AUTO_WALLS.filter(w=>w.id==="auto-youtube"?automaticWalls.videos:w.id==="auto-bluesky"?automaticWalls.bluesky:w.id==="auto-documents"?automaticWalls.internetArchive:true).map(w=>w.id);
  if (![...validIds,...validAutomaticIds].includes(activeWallId)) activeWallId = walls[0].id;
  if (!validIds.has(defaultWallId)) defaultWallId = validIds.has(activeWallId) ? activeWallId : walls[0].id;
  const firstWallSettings = wallSettings[walls[0].id] || {};
  if (Number(raw.semanticFiltersMigrationVersion) < 1) {
    const mergeTerms = (key, normalize) => {
      const entries = new Map();
      const existing = [...(raw.settings?.[key] || []), ...walls.flatMap(wall => wallSettings[wall.id]?.[key] || [])];
      for (const item of existing) {
        const value = key === "priorities" ? item : item;
        const label = key === "priorities" ? String(value?.term || "").trim() : String(value || "").trim();
        if (!label) continue;
        const id = normalize(label), prior = entries.get(id);
        if (!prior || (key === "priorities" && ({low:1,medium:2,high:3}[value.level] || 2) > ({low:1,medium:2,high:3}[prior.level] || 2))) entries.set(id, key === "priorities" ? { ...value, term: label } : label);
      }
      return [...entries.values()];
    };
    for (const key of ["excludedKeywords", "excludedCategories", "priorities"]) settings[key] = mergeTerms(key, MMP.normalizeText);
    settings.mode = firstWallSettings.mode || settings.mode || "chronological";
  }
  if (Number(raw.wallFiltersMigrationVersion) < 1) {
    for (const key of ["excludedKeywords", "excludedCategories", "priorities"]) {
      const legacy = raw.settings?.[key];
      if (Array.isArray(legacy) && legacy.length && (!Array.isArray(firstWallSettings[key]) || !firstWallSettings[key].length)) firstWallSettings[key] = legacy;
    }
    if (raw.settings?.mode && !firstWallSettings.mode) firstWallSettings.mode = raw.settings.mode;
  }
  wallSettings[walls[0].id] = firstWallSettings;
  const legacyRetentionDays = Math.max(1, Number(settings.retentionDays) || 30);
  for (const wall of walls) { wallSettings[wall.id] = { ...defaultWallSettings(), ...(wallSettings[wall.id] || {}), retentionDays: Math.max(1, Number(wallSettings[wall.id]?.retentionDays) || legacyRetentionDays) }; for (const key of GLOBAL_SETTING_KEYS) delete wallSettings[wall.id][key]; if (!["auto", "cinema", "standard"].includes(wallSettings[wall.id].type)) wallSettings[wall.id].type = "auto"; }
  settings.retentionDays = Math.max(1, Number(settings.retentionDays) || 30);
  settings.archiveRetentionDays = Math.max(1, Number(raw.settings?.archiveRetentionDays) || 2);
  settings.laterRetentionDays = Math.max(1, Number(raw.settings?.laterRetentionDays) || 90);
  settings.retentionSplitVersion = 1;
  const normalized = { sources, settings, walls, activeWallId, defaultWallId, wallSettings, automaticWalls, videoProviders, socialProviders, blueskyRequireImage, blueskyFrenchOnly, linkedinRequireImage, refreshIntervalMinutes: REFRESH_INTERVALS.includes(Number(raw.refreshIntervalMinutes)) ? Number(raw.refreshIntervalMinutes) : DEFAULT_REFRESH_INTERVAL, wallFiltersMigrationVersion: 1, semanticFiltersMigrationVersion: 1 }, updates = {};
  for (const [key, value] of Object.entries(normalized)) if (stableStateJson(raw[key]) !== stableStateJson(value)) updates[key] = value;
  if (Object.keys(updates).length) await browser.storage.local.set(updates);
  const visibleAutoWalls=AUTO_WALLS.filter(w=>w.id==="auto-youtube"?automaticWalls.videos:w.id==="auto-bluesky"?automaticWalls.bluesky:w.id==="auto-documents"?automaticWalls.internetArchive:true);
  return { ...defaults, ...raw, sources, settings: { ...settingsForWall(settings, wallSettings[activeWallId]||{}), excludedKeywords: settings.excludedKeywords || [], excludedCategories: settings.excludedCategories || [], priorities: settings.priorities || [] }, walls: walls.map(w=>({...w, cinema: wallCinemaEnabled(w,wallSettings[w.id])})), autoWalls:visibleAutoWalls, automaticWalls, videoProviders, socialProviders, blueskyRequireImage, blueskyFrenchOnly, linkedinRequireImage, activeWallId, defaultWallId, wallSettings };
}
async function cleanReadingStates(){const stored=await browser.storage.local.get({articleStates:{},settings:MMP.DEFAULTS.settings,sourceHistoryMigrationVersion:0}),articleStates=stored.articleStates||{},settings=stored.settings||{},cutoffs={read:Date.now()-Math.max(1,Number(settings.archiveRetentionDays)||2)*86400000,later:Date.now()-Math.max(1,Number(settings.laterRetentionDays)||90)*86400000},expired=[];if(Number(stored.sourceHistoryMigrationVersion)<1){const bySource=new Map();for(const article of await MMPDB.all())for(const id of article.sourceIds||[article.sourceId])if(id){if(!bySource.has(id))bySource.set(id,[]);bySource.get(id).push(article);}for(const [id,rows] of bySource)await MMPDB.rememberSourceArticles(id,rows,{acquiredCanonicalUrls:rows.map(row=>row.canonicalUrl)});await browser.storage.local.set({sourceHistoryMigrationVersion:1});}let changed=false;for(const [id,item] of Object.entries(articleStates)){const cutoff=cutoffs[item?.status],isExpired=Number(item?.updatedAt)>0&&cutoff&&Number(item.updatedAt)<=cutoff;if(!item?.updatedAt||isExpired||!cutoff){delete articleStates[id];changed=true;if(isExpired)expired.push(id);}}if(changed)await browser.storage.local.set({articleStates});if(expired.length)await MMPDB.removeArticles(expired);return articleStates;}
const LIKE_RETENTION_DAYS = 60;
const SOURCE_URL_HISTORY_DAYS = 7;
function deduplicateArticlesByCanonicalUrl(articles, articleStates, likedUrls) {
  const byUrl = new Map();
  for (const article of articles) {
    const canonicalUrl = MMP.cleanUrl(article.canonicalUrl) || article.canonicalUrl;
    if (!canonicalUrl) continue;
    const previous = byUrl.get(canonicalUrl);
    if (!previous) {
      byUrl.set(canonicalUrl, { ...article, canonicalUrl, readingState: articleStates[article.id] || null });
      continue;
    }
    const previousState = previous.readingState, incomingState = articleStates[article.id] || null;
    const readingState = incomingState && (!previousState || Number(incomingState.updatedAt) > Number(previousState.updatedAt)) ? incomingState : previousState;
    const merged = {
      ...previous, ...article, canonicalUrl,
      title: previous.title && article.title ? [previous.title, article.title].sort((a, b) => a.length - b.length)[0] : previous.title || article.title,
      summary: previous.summary || article.summary || "",
      image: previous.image || article.image || "",
      sourceIds: [...new Set([...(previous.sourceIds || [previous.sourceId]), ...(article.sourceIds || [article.sourceId])])],
      readingState,
      liked: likedUrls.has(MMP.normalizeContentUrl(canonicalUrl))
    };
    if (previous.dateIsFallback && !article.dateIsFallback) {
      merged.publishedAt = article.publishedAt; merged.dateIsFallback = false; merged.datePrecision = article.datePrecision;
    } else if (!previous.dateIsFallback && article.dateIsFallback) {
      merged.publishedAt = previous.publishedAt; merged.dateIsFallback = false; merged.datePrecision = previous.datePrecision;
    }
    byUrl.set(canonicalUrl, merged);
  }
  return [...byUrl.values()].map(article => ({ ...article, liked: likedUrls.has(MMP.normalizeContentUrl(article.canonicalUrl)) }));
}
async function cleanExpiredLikes(){const removed=await MMPDB.removeExpiredLikes(Date.now()-LIKE_RETENTION_DAYS*86400000);for(const normalizedUrl of removed)browser.runtime.sendMessage({type:"likesUpdated",normalizedUrl,liked:false}).catch(()=>{});}
async function clearOrphanedReadingStates(articleIds = [], sourceId = "", incomingRows = []){const removed=new Set(articleIds),keep=new Set(incomingRows.map(row=>row.canonicalUrl)),{articleStates={}}=await browser.storage.local.get({articleStates:{}});let changed=false;for(const [id,item] of Object.entries(articleStates)){const article=item?.article;if(removed.has(id)||(sourceId&&article&&(article.sourceIds||[article.sourceId]).includes(sourceId)&&!keep.has(article.canonicalUrl)&&!(article.sourceIds||[article.sourceId]).some(other=>other!==sourceId))){delete articleStates[id];changed=true;}}if(changed)await browser.storage.local.set({articleStates});}
const FIRST_COLLECTION_LOOKBACK_MS = 10 * 60 * 60 * 1000;
function firstCollectionCutoffs(source, rows, current, cachedArticles, startedAt, unavailableUrls = new Set()) {
  const result = new Map(), walls = (source.wallIds || []).map(id => current.walls.find(wall => wall.id === id)).filter(Boolean);
  const all = [...cachedArticles, ...rows.filter(article => !unavailableUrls.has(article.canonicalUrl))];
  for (const wall of walls) {
    const config = current.wallSettings?.[wall.id] || {}, retention = Math.max(1, Number(config.retentionDays) || 3);
      const keywords = (current.settings?.excludedKeywords || config.excludedKeywords || []).map(item => typeof item === "string" ? item : item.term).filter(Boolean);
      const categories = (current.settings?.excludedCategories || config.excludedCategories || []).map(MMP.normalizeText);
    const eligible = article => {
      const date = Number(article.publishedAt) || 0;
      return !article.readingState && date > 0 && !article.dateIsFallback && date >= startedAt - retention * 86400000 &&
        (article.sourceIds || [article.sourceId]).includes(source.id) &&
        !keywords.some(term => MMP.matchTerm(`${article.title} ${article.summary || ""}`, term)) &&
        !(article.categories || []).some(category => categories.includes(MMP.normalizeText(category)));
    };
    let hours = 10;
    const maxHours = Math.min(retention * 24, 72);
    while (hours < maxHours && !all.some(article => eligible(article) && Number(article.publishedAt) >= startedAt - hours * 3600000)) hours = Math.min(hours + 2, maxHours);
    result.set(wall.id, startedAt - hours * 3600000);
  }
  return result;
}
async function firstCollectionCutoffsFor(source, rows, current, cachedArticles, startedAt) {
  if (!startedAt) return null;
  const urls = rows.map(article => article.canonicalUrl);
  const [seen, expired] = await Promise.all([MMPDB.sourceHistory(source.id, urls), MMPDB.expiredArticleUrls(urls)]);
  const storedUrls = new Set(cachedArticles.map(article => article.canonicalUrl));
  const unavailable = new Set([...seen, ...expired].filter(url => !storedUrls.has(url)));
  return firstCollectionCutoffs(source, rows, current, cachedArticles, startedAt, unavailable);
}
function sourceTimeout(promise, timeout = 15000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => { const error = new Error(`Délai maximal de collecte dépassé (${Math.round(timeout / 1000)} s).`); error.kind = "transient"; reject(error); }, timeout); })]).finally(() => clearTimeout(timer));
}
async function sourceRowsToPersist(sourceId, rows, lastSuccessfulSync = 0, firstCollectionStartedAt = 0, wallCutoffs = null, diagnostics = null) {
  const urls = rows.map(row => row.canonicalUrl);
  const [seen, expired, currentArticles] = await Promise.all([MMPDB.sourceHistory(sourceId, urls), MMPDB.expiredArticleUrls(urls), MMPDB.all()]);
  const stored = new Set(currentArticles.map(article => article.canonicalUrl));
  const cutoff = Number(lastSuccessfulSync) || 0;
  const firstCollectionCutoff = firstCollectionStartedAt ? firstCollectionStartedAt - FIRST_COLLECTION_LOOKBACK_MS : 0;
  const diagnosticUrls = diagnostics ? Object.fromEntries(["alreadyStored", "retentionTombstone", "deduplicated", "outsideInitialWindow", "olderThanLastSync", "eligible"].map(key => [key, new Set()])) : null;
  const classified = rows.map(row => {
    let reason;
    if (stored.has(row.canonicalUrl)) reason = "alreadyStored";
    else if (expired.has(row.canonicalUrl)) reason = "retentionTombstone";
    else if (seen.has(row.canonicalUrl)) reason = "deduplicated";
    else {
      const publishedAt = Number(row.publishedAt) || 0;
      if (firstCollectionCutoff) reason = !row.dateIsFallback && publishedAt > 0 && (wallCutoffs?.size ? [...wallCutoffs.values()].some(cutoff => publishedAt >= cutoff) : publishedAt >= firstCollectionCutoff) ? "eligible" : "outsideInitialWindow";
      else reason = cutoff > 0 && !row.dateIsFallback && publishedAt > 0 && publishedAt <= cutoff ? "olderThanLastSync" : "eligible";
    }
    diagnosticUrls?.[reason]?.add(row.canonicalUrl);
    return { row, reason };
  });
  if (diagnostics) for (const [key, values] of Object.entries(diagnosticUrls)) diagnostics[key] = values.size;
  return classified.filter(item => item.reason === "alreadyStored" || item.reason === "eligible").map(item => item.row);
}
function sourceHistoryMetadata(source, method = source?.method, acquisitionMode = "") {
  let configuredHost = ""; try { configuredHost = new URL(source?.feedUrl || source?.pageUrl || "").hostname; } catch {}
  const type = /(^|\.)news\.google\.com$/i.test(configuredHost) ? "Google Actualités" : method === "rss" || method === "atom" ? "RSS" : method === "jsonfeed" ? "JSON Feed" : method === "html" ? "Site web" : "Source";
  return { sourceName: source?.name || "", sourceType: type, wallIds: [...(source?.wallIds || [])], acquisitionMode };
}
function automaticHistoryMetadata(sourceId, wallIds = [], acquisitionMode = "Automatique") {
  const map = {
    [YOUTUBE_SOURCE_ID]: ["YouTube", "YouTube"], [PEERTUBE_SOURCE_ID]: ["PeerTube", "PeerTube"],
    [CROWDBUNKER_SOURCE_ID]: ["CrowdBunker", "CrowdBunker"], [RUMBLE_SOURCE_ID]: ["Rumble", "Rumble"],
    [BLUESKY_SOURCE_ID]: ["Bluesky", "Bluesky"], [LINKEDIN_SOURCE_ID]: ["Google Actualités", "LinkedIn"]
  };
  const [sourceType, sourceName] = map[sourceId] || (sourceId.startsWith(INTERNET_ARCHIVE_SOURCE_PREFIX) ? ["Internet Archive", "PDF · Internet Archive"] : ["Source automatique", sourceId]);
  return { sourceType, sourceName, wallIds: [...wallIds], acquisitionMode };
}
function markSourceAttempt(source, attemptedAt = Date.now()) { source.lastAttemptAt = attemptedAt; return attemptedAt; }
function sourceAcquisitionDiagnostic({ attemptedAt, finishedAt = Date.now(), outcome, method = "", result = null, selectedRows = null, knownSourceUrls = null, persistenceDiagnostics = null, storageCompleted = false, stage = "", error = "" }) {
  const received = Array.isArray(result?.articles) && !result.error ? result.articles : null;
  const receivedUrls = new Set((received || []).map(row => row.canonicalUrl).filter(Boolean));
  const selectedUrls = new Set((selectedRows || []).map(row => row.canonicalUrl).filter(url => receivedUrls.has(url)));
  const knownUrls = new Set(knownSourceUrls || []);
  const newUrls = [...selectedUrls].filter(url => !knownUrls.has(url));
  return {
    attemptedAt: Number(attemptedAt) || 0, finishedAt, outcome, method,
    httpStatus: Number(result?.status) || 0,
    receivedArticleCount: received?.length ?? null, receivedUrlCount: receivedUrls.size || (received ? 0 : null),
    selectedUrlCount: received && Array.isArray(selectedRows) ? selectedUrls.size : null,
    alreadyKnownUrlCount: received && Array.isArray(knownSourceUrls) ? [...receivedUrls].filter(url => knownUrls.has(url)).length : null,
    alreadyInDatabaseUrlCount: persistenceDiagnostics?.alreadyStored ?? null,
    excludedUrlCount: received && Array.isArray(selectedRows) ? Math.max(0, receivedUrls.size - selectedUrls.size) : null,
    retentionTombstoneUrlCount: persistenceDiagnostics?.retentionTombstone ?? null,
    deduplicatedUrlCount: persistenceDiagnostics?.deduplicated ?? null,
    outsideInitialWindowUrlCount: persistenceDiagnostics?.outsideInitialWindow ?? null,
    olderThanLastSyncUrlCount: persistenceDiagnostics?.olderThanLastSync ?? null,
    newlyStoredUrlCount: storageCompleted ? newUrls.length : null,
    stage, error: error || result?.error || ""
  };
}
async function recordAutomaticHistory(sourceId, rows, metadata) {
  try { await MMPDB.rememberSourceArticles(sourceId, rows, { ...metadata, acquiredCanonicalUrls: rows.map(row => row.canonicalUrl).filter(Boolean) }); }
  catch (error) { console.warn("Historique de diagnostic indisponible :", error); }
}
async function ensureSocialRefreshBaseline() {
  const stored = await browser.storage.local.get({ socialRefreshBaselineVersion: 0, blueskySearchState: { lastSuccessfulByTopic: {} }, linkedinSearchState: { lastSuccessfulByTopic: {} } });
  if (Number(stored.socialRefreshBaselineVersion) >= SOCIAL_REFRESH_BASELINE_VERSION) return false;
  const now = Date.now();
  const blueskySearchState = stored.blueskySearchState || { lastSuccessfulByTopic: {} };
  const linkedinSearchState = stored.linkedinSearchState || { lastSuccessfulByTopic: {} };
  blueskySearchState.lastSuccessfulByTopic ||= {};
  blueskySearchState.cursorByTopic = {};
  linkedinSearchState.lastSuccessfulByTopic ||= {};
  for (const topic of Object.keys(blueskySearchState.lastSuccessfulByTopic)) blueskySearchState.lastSuccessfulByTopic[topic] = now;
  for (const topic of Object.keys(linkedinSearchState.lastSuccessfulByTopic)) linkedinSearchState.lastSuccessfulByTopic[topic] = now;
  await browser.storage.local.set({ socialRefreshBaselineVersion: SOCIAL_REFRESH_BASELINE_VERSION, blueskySearchState, linkedinSearchState });
  await browser.storage.local.remove(["blueskyCollectionDiagnostics", "linkedinCollectionDiagnostics"]);
  return true;
}
async function saveAutomaticSocialSnapshots(additionalArticles = []) {
  const [stored, articles, local] = await Promise.all([
    browser.storage.local.get({ [AUTOMATIC_SOCIAL_SNAPSHOT_KEY]: [] }),
    MMPDB.all().catch(error => { console.warn("Lecture IndexedDB avant sauvegarde sociale impossible :", error); return []; }),
    browser.storage.local.get({ articleStates: {} })
  ]);
  const snapshots = new Map((stored[AUTOMATIC_SOCIAL_SNAPSHOT_KEY] || []).map(article => [article.id, article]));
  for (const article of [...articles, ...additionalArticles]) {
    if (!(article.sourceIds || [article.sourceId]).some(id => AUTOMATIC_SOCIAL_SOURCE_IDS.has(id))) continue;
    if (["read", "later"].includes(local.articleStates?.[article.id]?.status)) snapshots.delete(article.id);
    else snapshots.set(article.id, article);
  }
  for (const id of snapshots.keys()) if (["read", "later"].includes(local.articleStates?.[id]?.status)) snapshots.delete(id);
  const retained = [...snapshots.values()].sort((a, b) => Number(b.publishedAt || 0) - Number(a.publishedAt || 0)).slice(0, 2000);
  await browser.storage.local.set({ [AUTOMATIC_SOCIAL_SNAPSHOT_KEY]: retained });
  for (const sourceId of AUTOMATIC_SOCIAL_SOURCE_IDS) {
    const rows = retained.filter(article => (article.sourceIds || [article.sourceId]).includes(sourceId));
    if (rows.length) await recordAutomaticHistory(sourceId, rows, automaticHistoryMetadata(sourceId, ["auto-bluesky"], "Automatique"));
  }
}
async function restoreAutomaticSocialSnapshots() {
  const [stored, articles, local] = await Promise.all([
    browser.storage.local.get({ [AUTOMATIC_SOCIAL_SNAPSHOT_KEY]: [] }),
    MMPDB.all(),
    browser.storage.local.get({ articleStates: {} })
  ]);
  const existingIds = new Set(articles.map(article => article.id));
  const missing = (stored[AUTOMATIC_SOCIAL_SNAPSHOT_KEY] || []).filter(article =>
    !existingIds.has(article.id) && !["read", "later"].includes(local.articleStates?.[article.id]?.status)
  );
  if (!missing.length) return 0;
  await MMPDB.putMany(missing);
  for (const sourceId of AUTOMATIC_SOCIAL_SOURCE_IDS) {
    const rows = missing.filter(article => (article.sourceIds || [article.sourceId]).includes(sourceId));
    if (rows.length) await recordAutomaticHistory(sourceId, rows, automaticHistoryMetadata(sourceId, ["auto-bluesky"], "Restauration locale"));
  }
  return missing.length;
}
async function fetchText(url, timeout = 18000) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    let response;
    try { response = await fetch(url, { credentials: "omit", signal: controller.signal, redirect: "follow", headers: { "Accept": "application/feed+json, application/json;q=0.9, application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8" } }); }
    catch (error) {
      if (error?.name === "AbortError") { const e = new Error("Validation impossible pour le moment : délai de connexion dépassé."); e.kind = "transient"; throw e; }
      const detail = `${error?.name || ""} ${error?.message || error || ""}`;
      if (/ERR_NAME_NOT_RESOLVED|NS_ERROR_UNKNOWN_HOST|ENOTFOUND|EAI_AGAIN|NXDOMAIN/i.test(detail)) throw new Error("Domaine introuvable : vérifiez l’adresse saisie.");
      if (/ERR_CERT_COMMON_NAME_INVALID|SSL_ERROR_BAD_CERT_DOMAIN|NS_ERROR_DOMAIN_MISMATCH/i.test(detail)) throw new Error("Le certificat HTTPS ne correspond pas au domaine demandé.");
      if (/ERR_CERT_|SSL_ERROR_|SEC_ERROR_UNKNOWN_ISSUER|MOZILLA_PKIX_ERROR_/i.test(detail)) throw new Error("Le certificat HTTPS présenté par le serveur est invalide.");
      const e = new Error("Validation impossible pour le moment : connexion refusée ou erreur réseau. Le navigateur ne précise pas davantage la cause."); e.kind = "transient"; throw e;
    }
    if (!response.ok) {
      const e = new Error([401, 403].includes(response.status) ? `Accès refusé par le serveur (HTTP ${response.status}).` : response.status === 404 || response.status === 410 ? `Adresse introuvable sur le serveur (HTTP ${response.status}).` : response.status === 408 || response.status === 429 || response.status >= 500 ? `Validation impossible pour le moment : réponse temporaire du serveur (HTTP ${response.status}).` : `Le serveur a répondu avec une erreur HTTP ${response.status}.`);
      e.status = response.status; e.kind = [401, 403].includes(response.status) ? "access" : [404, 410].includes(response.status) ? "strategy" : "transient"; throw e;
    }
    const finalUrl = response.url || url;
    if (new URL(url).protocol === "https:" && new URL(finalUrl).protocol !== "https:") throw new Error("La source redirige vers une adresse HTTP non sécurisée.");
    let body;
    try { body = await response.text(); }
    catch (error) { const e = new Error(error?.name === "AbortError" ? "Validation impossible pour le moment : délai de connexion dépassé." : "Validation impossible pour le moment : la connexion a été interrompue pendant le téléchargement."); e.kind = "transient"; throw e; }
    return { text: body, type: response.headers.get("content-type") || "", url: finalUrl, status: response.status };
  }
  finally { clearTimeout(timer); }
}
async function fetchYouTubeVideoDetails(videoId) {
  if (!/^[\w-]{11}$/.test(String(videoId || ""))) throw new Error("L’adresse de cette vidéo YouTube est invalide.");
  const html = (await fetchText(`https://www.youtube.com/watch?v=${videoId}`, 12000)).text;
  const marker = html.indexOf("ytInitialPlayerResponse"), start = html.indexOf("{", marker);
  if (marker < 0 || start < 0) throw new Error("YouTube n’a pas fourni les informations détaillées de cette vidéo.");
  let depth = 0, quoted = false, escaped = false, end = -1;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { end = i + 1; break; }
  }
  if (end < 0) throw new Error("Les informations détaillées YouTube sont illisibles.");
  const player = JSON.parse(html.slice(start, end)), video = player.videoDetails || {}, micro = player.microformat?.playerMicroformatRenderer || {};
  return { description: String(video.shortDescription || ""), channelName: video.author || "", viewCount: video.viewCount || "", durationSeconds: Number(video.lengthSeconds) || 0, category: micro.category || "", publishedAtLabel: micro.publishDate || micro.uploadDate || "", tags: Array.isArray(video.keywords) ? video.keywords.slice(0, 20) : [] };
}
async function accessible(url) {
  if (await browser.permissions.contains({ origins: ["<all_urls>"] })) return true;
  return browser.permissions.contains({ origins: [new URL(url).origin + "/*"] });
}
const affiliateResolutionCache = new Map();
async function resolveAffiliateInHiddenTab(rawUrl) {
  const tabs = browser.tabs;
  if (!tabs?.create || !tabs?.hide || !tabs?.update || !tabs?.onUpdated || !tabs?.onRemoved) return null;
  if (!await browser.permissions?.contains?.({ permissions: ["tabHide"] })) return null;
  let tab;
  try {
    // Hide an inactive blank tab before navigating so the destination is never
    // displayed in the user's window.
    tab = await tabs.create({ url: "about:blank", active: false });
    if (tab?.id == null) return null;
    const hidden = await tabs.hide(tab.id);
    if (!hidden?.includes(tab.id)) { await tabs.remove(tab.id).catch(() => {}); return null; }
    const chain = [rawUrl];
    return await new Promise(resolve => {
      let settled = false, quietTimer = null;
      const finish = result => {
        if (settled) return;
        settled = true;
        clearTimeout(deadlineTimer); clearTimeout(quietTimer);
        tabs.onUpdated.removeListener(onUpdated); tabs.onRemoved.removeListener(onRemoved);
        tabs.remove(tab.id).catch(() => {}); resolve(result);
      };
      const onUpdated = (id, change, updatedTab) => {
        if (id !== tab.id) return;
        const candidate = change.url || (change.status === "complete" ? updatedTab?.url : "");
        if (candidate) { const safe = safeAffiliateResolutionUrl(candidate); if (safe && chain.at(-1) !== safe) chain.push(safe); }
        if (change.status === "complete") {
          clearTimeout(quietTimer);
          // Client side offer redirects can run after the first page load.
          quietTimer = setTimeout(() => {
            const finalUrl = chain.at(-1);
            finish(finalUrl ? { url: rawUrl, finalUrl, redirected: finalUrl !== rawUrl, resolved: true, status: "verified", chain, reason: "Destination observée dans un onglet masqué" } : null);
          }, 1800);
        }
      };
      const onRemoved = id => { if (id === tab.id) finish(null); };
      const deadlineTimer = setTimeout(() => finish(null), 15000);
      tabs.onUpdated.addListener(onUpdated); tabs.onRemoved.addListener(onRemoved);
      tabs.update(tab.id, { url: rawUrl }).catch(() => finish(null));
    });
  } catch { return null; }
  finally { if (tab?.id != null) tabs.remove(tab.id).catch(() => {}); }
}
function safeAffiliateResolutionUrl(raw) {
  try {
    const url = new URL(String(raw || ""));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::1" || /^10\.|^127\.|^192\.168\.|^169\.254\.|^172\.(?:1[6-9]|2\d|3[01])\./.test(host)) return null;
    return url.href;
  } catch { return null; }
}
async function resolveAffiliateLinks(rawUrls, browserProbeUrls = []) {
  const urls = [...new Set((Array.isArray(rawUrls) ? rawUrls : []).map(safeAffiliateResolutionUrl).filter(Boolean))];
  const browserProbes = new Set((Array.isArray(browserProbeUrls) ? browserProbeUrls : []).map(safeAffiliateResolutionUrl).filter(Boolean));
  const now = Date.now(), results = new Map();
  for (const url of urls) {
    const cached = affiliateResolutionCache.get(url);
    const needsFreshBrowserProbe = browserProbes.has(url) && cached?.result?.resolved && !cached.result.redirected;
    if (cached && cached.expiresAt > now && !needsFreshBrowserProbe) results.set(url, cached.result);
  }
  const queue = urls.filter(url => !results.has(url));
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      let result = { url, resolved: false, status: "unverified", chain: [url], reason: "La vérification réseau n’a pas abouti" };
      try {
        const deadline = Date.now() + 7000, chain = [url], redirectStatuses = new Set([301, 302, 303, 307, 308]);
        let current = url, complete = false;
        for (let hop = 0; hop <= 5; hop++) {
          if (!await accessible(current)) { result = { url, resolved: false, status: "unverified", chain, reason: "Autorisation d’accès absente pour une destination de la redirection" }; break; }
          const remaining = deadline - Date.now();
          if (remaining <= 0) { result = { url, resolved: false, status: "unverified", chain, reason: "Délai total de vérification dépassé" }; break; }
          const controller = new AbortController(), timer = setTimeout(() => controller.abort(), Math.min(3500, remaining));
          let response;
          try { response = await fetch(current, { method: "HEAD", credentials: "omit", referrerPolicy: "no-referrer", redirect: "manual", signal: controller.signal, headers: { Accept: "*/*" } }); }
          finally { clearTimeout(timer); }
          // Firefox can expose a cross-origin manual redirect as an opaque
          // response with status 0 and no Location header. Retry those cases
          // with automatic redirect following, which exposes the final URL to
          // the extension request without fetching the page body.
          if (response.status === 0 || response.type === "opaqueredirect" || [403, 405, 501].includes(response.status)) {
            const remainingAfterHead = deadline - Date.now();
            if (remainingAfterHead <= 0) { result = { url, resolved: false, status: "unverified", chain, reason: "Délai total de vérification dépassé" }; break; }
            const fallbackController = new AbortController(), fallbackTimer = setTimeout(() => fallbackController.abort(), Math.min(3500, remainingAfterHead));
            try {
              response = await fetch(current, { method: "GET", credentials: "omit", referrerPolicy: "no-referrer", redirect: "follow", signal: fallbackController.signal, headers: { Accept: "*/*", Range: "bytes=0-0" } });
            } finally { clearTimeout(fallbackTimer); }
            const finalUrl = safeAffiliateResolutionUrl(response.url) || current;
            if (response.body?.cancel) response.body.cancel().catch(() => {});
            if (response.status >= 200 && response.status < 300) {
              if (finalUrl !== current && chain.at(-1) !== finalUrl) chain.push(finalUrl);
              complete = true;
              result = { url, finalUrl, resolved: true, redirected: finalUrl !== url, chain, status: "verified", reason: "Destination HTTP vérifiée après suivi de la redirection; aucun motif d’affiliation reconnu" };
              break;
            }
          }
          if (!(response.status >= 200 && response.status < 300) && !redirectStatuses.has(response.status)) {
            result = { url, resolved: false, status: "unverified", chain, reason: `Le serveur a répondu HTTP ${response.status}` };
            break;
          }
          if (!redirectStatuses.has(response.status)) {
            complete = true;
            result = { url, finalUrl: current, resolved: true, redirected: current !== url, chain, status: "verified", reason: "Destination HTTP vérifiée; aucun motif d’affiliation reconnu" };
            break;
          }
          const location = response.headers?.get?.("location");
          if (!location || hop === 5) { result = { url, resolved: false, status: "unverified", chain, reason: location ? "Limite de cinq redirections atteinte" : "Redirection HTTP masquée ou sans en-tête Location accessible" }; break; }
          const next = safeAffiliateResolutionUrl(new URL(location, current).href);
          if (!next) { result = { url, resolved: false, status: "unverified", chain, reason: "Destination de redirection invalide ou non publique" }; break; }
          chain.push(next); current = next;
        }
        if (!complete && result.resolved) result = { url, resolved: false, status: "unverified", chain, reason: "Chaîne HTTP incomplète" };
      } catch (error) { result.reason = /abort|timeout/i.test(String(error?.name || error?.message)) ? "Délai de vérification dépassé" : "Requête réseau bloquée ou impossible"; }
      const needsBrowserProbe = !result.resolved || browserProbes.has(url) && !result.redirected;
      if (needsBrowserProbe && await accessible(url)) {
        const hiddenResult = await resolveAffiliateInHiddenTab(url);
        if (hiddenResult) result = hiddenResult;
      }
      affiliateResolutionCache.set(url, { result, expiresAt: Date.now() + (result.resolved ? 6 * 60 * 60 * 1000 : 10 * 60 * 1000) });
      results.set(url, result);
    }
  };
  await Promise.all([worker(), worker()]);
  return urls.map(url => results.get(url));
}
function feedMethod(url, type = "") {
  if (/application\/feed\+json|json.?feed|\.json(?:$|[?#])/i.test(`${type} ${url}`)) return "jsonfeed";
  return /atom/i.test(`${type} ${url}`) ? "atom" : "rss";
}
function knownPublisherFeedCandidates(pageUrl) {
  try {
    const page = new URL(pageUrl);
    if (!/^(?:www\.)?french-stream\.net$/i.test(page.hostname)) return [];
    const category = page.pathname.match(/^\/(films?|series?)\/?$/i)?.[1];
    if (!category) return [];
    const url = new URL("/engine/rss.php", page.origin);
    url.searchParams.set("do", "cat");
    url.searchParams.set("category", category.toLowerCase().startsWith("film") ? "films" : "series");
    return [url.href];
  } catch { return []; }
}
function cleanRequestUrl(value, baseUrl) {
  let resolved;
  try { resolved = new URL(value, baseUrl); } catch { return ""; }
  const keepTrailingSlash = resolved.pathname.length > 1 && resolved.pathname.endsWith("/");
  const clean = MMP.cleanUrl(resolved.href, baseUrl);
  if (!clean || !keepTrailingSlash) return clean;
  const normalized = new URL(clean);
  if (!normalized.pathname.endsWith("/")) normalized.pathname += "/";
  return normalized.href;
}
function feedPathCandidates(pageUrl) {
  const page = new URL(pageUrl), segments = page.pathname.split("/").filter(Boolean), paths = [];
  const add = path => { for (const suffix of ["feed/", "rss/", "atom.xml", "feed.json"]) paths.push(`${path}${suffix}`); };
  add("/");
  for (let depth = Math.min(segments.length, 3); depth > 0; depth--) add(`/${segments.slice(0, depth).join("/")}/`);
  for (const path of ["/feed", "/rss", "/feed.xml", "/rss.xml", "/atom.xml", "/feed.json"]) paths.push(path);
  return [...new Set(paths)].map(path => new URL(path, page.origin).href);
}
async function discoverFeedCandidates(pageUrl, pageHtml = "", supplied = []) {
  const candidates = [], seenFeeds = new Set(), discoveryPages = [], seenPages = new Set();
  const addFeed = (url, title = "Flux RSS/Atom", type = "") => {
    const clean = cleanRequestUrl(url, pageUrl);
    if (!clean || seenFeeds.has(clean)) return;
    seenFeeds.add(clean); candidates.push({ url: clean, title, type: type || feedMethod(clean) });
  };
  for (const item of supplied) if (item) addFeed(item.url || item.feedUrl, item.title, item.type || item.method);
  for (const url of feedPathCandidates(pageUrl)) addFeed(url, `Flux ${new URL(url).pathname}`);
  const queueDiscovery = (url, title = "") => {
    const clean = cleanRequestUrl(url, pageUrl);
    if (!clean || new URL(clean).origin !== new URL(pageUrl).origin || seenPages.has(clean) || clean === MMP.cleanUrl(pageUrl)) return;
    seenPages.add(clean); discoveryPages.push({ url: clean, title });
  };
  const inspect = (html, baseUrl) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const link of doc.querySelectorAll('link[rel~="alternate"][href]')) {
      if (/rss|atom|xml|feed|json/i.test(`${link.type} ${link.href} ${link.title}`)) addFeed(link.href, link.title || "Flux RSS/Atom", link.type);
    }
    for (const anchor of doc.querySelectorAll("a[href]")) {
      const href = cleanRequestUrl(anchor.getAttribute("href"), baseUrl), label = `${anchor.textContent || ""} ${anchor.getAttribute("title") || ""} ${anchor.getAttribute("aria-label") || ""} ${anchor.getAttribute("type") || ""} ${href || ""}`;
      if (!href || !/rss|atom|feed|flux|syndicat/i.test(label)) continue;
      addFeed(href, (anchor.textContent || anchor.getAttribute("title") || "Flux RSS/Atom").trim(), anchor.getAttribute("type") || "");
      queueDiscovery(href, label);
    }
    const sectionTerms = /alert|alerte|news|actualit|publication|security|sécurité|avis|threat|menace|bulletin|vulnerabil|vulnérabil|incident|advisory/i;
    for (const anchor of doc.querySelectorAll("a[href]")) {
      const href = MMP.cleanUrl(anchor.getAttribute("href"), baseUrl);
      if (!href || new URL(href).origin !== new URL(pageUrl).origin) continue;
      const label = `${anchor.textContent || ""} ${anchor.getAttribute("title") || ""} ${href}`;
      if (!sectionTerms.test(label)) continue;
      const path = new URL(href).pathname, segments = path.split("/").filter(Boolean);
      if (!segments.length || segments.length > 2 || /\.[a-z\d]{2,8}$/i.test(segments.at(-1))) continue;
      for (let depth = Math.min(segments.length, 3); depth > 0; depth--) {
        const base = `/${segments.slice(0, depth).join("/")}/`;
        for (const suffix of ["feed/", "rss/", "atom.xml"]) addFeed(new URL(`${base}${suffix}`, new URL(pageUrl).origin).href, `Flux ${label.trim().slice(0,70)}`);
      }
    }
  };
  if (pageHtml) inspect(pageHtml, pageUrl);
  else {
    try { const response = await fetchText(pageUrl, 8000); if (/html/i.test(response.type)) inspect(response.text, response.url); } catch {}
  }
  for (let i = 0; i < discoveryPages.length && i < 4; i++) {
    const page = discoveryPages[i];
    if (!await accessible(page.url)) continue;
    try { const response = await fetchText(page.url, 7000); if (/html/i.test(response.type)) inspect(response.text, response.url); } catch {}
  }
  return candidates.slice(0, 40);
}
async function readOpenPage(tabId, pageUrl) {
  try {
    if (!Number.isInteger(tabId)) return "";
    const tab = await browser.tabs.get(tabId);
    if (MMP.cleanUrl(tab.url) !== MMP.cleanUrl(pageUrl)) return "";
    const [result] = await browser.scripting.executeScript({ target: { tabId }, func: () => document.documentElement?.outerHTML?.slice(0, 4000000) || "" });
    return typeof result?.result === "string" ? result.result : "";
  } catch { return ""; }
}
async function probeArticleVideo(articleId) {
  const unavailable = detail => ({ kind: "unavailable", error: `Vidéo indisponible dans Mon Mur${detail ? ` : ${detail}` : "."}` });
  const article = await MMPDB.get(String(articleId || ""));
  if (!article?.canonicalUrl) return unavailable();
  let page;
  try { page = new URL(article.canonicalUrl); } catch { return unavailable(); }
  if (!/^https?:$/.test(page.protocol) || !await accessible(page.href)) return unavailable("l’accès à la page de la vidéo n’est pas autorisé dans Firefox.");
  let tabs;
  try { tabs = await browser.tabs.query({}); }
  catch { return unavailable(); }
  const pageUrl = MMP.cleanUrl(page.href);
  const tab = tabs.find(candidate => Number.isInteger(candidate.id) && MMP.cleanUrl(candidate.url) === pageUrl);
  if (!tab) return unavailable("la page de la vidéo doit déjà être ouverte dans un onglet Firefox.");
  try {
    const [injection] = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: MMP.probeVideoPage, args: [3500] });
    const probe = injection?.result;
    if (!probe || !["file", "hls", "dash"].includes(probe.kind)) return unavailable();
    const src = MMP.cleanUrl(probe.src);
    if (!src || new URL(src).protocol !== "https:") return unavailable();
    const poster = MMP.cleanUrl(probe.poster || "");
    if (probe.kind === "dash" && !new URL(src).pathname.toLowerCase().endsWith(".mpd")) return unavailable();
    return { kind: probe.kind, src, ...(poster && new URL(poster).protocol === "https:" ? { poster } : {}) };
  } catch { return unavailable("Firefox n’a pas pu lire le lecteur déjà ouvert."); }
}
async function resolveFranceTvVideo(videoId, pageUrl) {
  const unavailable = () => ({ kind: "unavailable", error: "Vidéo indisponible dans Mon Mur." });
  let page;
  try { page = new URL(pageUrl); } catch { return unavailable(); }
  if (!/^https?:$/.test(page.protocol) || !/(?:^|\.)(?:franceinfo\.fr|france\.tv|francetv\.fr)$/i.test(page.hostname) || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(videoId || ""))) return unavailable();
  try {
    const api = new URL(`https://proxy-mediation.yatta.francetv.fr/prod/v2/gateway-player/videos/${encodeURIComponent(videoId)}`);
    for (const [key, value] of Object.entries({ domain: page.hostname, country_code: "FR", w: "1280", h: "720", player_version: "5.0", screen_w: "1280", screen_h: "720", browser: "Firefox", browser_version: String(/Firefox\/(\d+)/.exec(navigator.userAgent)?.[1] || ""), os: "Linux", os_version: "", device_type: "desktop" })) if (value) api.searchParams.set(key, value);
    const response = await fetch(api.href, { credentials: "omit", headers: { Accept: "application/json" } });
    if (!response.ok) return unavailable();
    const payload = await response.json(), video = payload?.video;
    if (!video?.url || video.drm) return unavailable();
    let manifest = new URL(video.url);
    if (manifest.protocol !== "https:" || !/(?:^|\.)ftven\.fr$/i.test(manifest.hostname)) return unavailable();
    if (/\.mpd(?:$|[?#])/i.test(manifest.href) && video.token?.akamai) {
      const tokenEndpoint = new URL(video.token.akamai);
      if (tokenEndpoint.protocol !== "https:" || tokenEndpoint.hostname !== "hdfauth.ftven.fr") return unavailable();
      tokenEndpoint.searchParams.set("url", manifest.href);
      const signedResponse = await fetch(tokenEndpoint.href, { credentials: "omit", headers: { Accept: "application/json" } });
      if (!signedResponse.ok) return unavailable();
      const signed = await signedResponse.json();
      manifest = new URL(signed?.url || "");
      if (manifest.protocol !== "https:" || !/(?:^|\.)ftven\.fr$/i.test(manifest.hostname)) return unavailable();
      return { kind: "dash", src: manifest.href };
    }
    if (/\.m3u8(?:$|[?#])/i.test(manifest.href)) return { kind: "hls", src: manifest.href };
    if (/\.(?:mp4|webm|ogg)(?:$|[?#])/i.test(manifest.href)) return { kind: "file", src: manifest.href };
    return unavailable();
  } catch { return unavailable(); }
}
async function readOpenPageForSource(source) {
  const candidates = [];
  if (Number.isInteger(source.pageTabId)) candidates.push(source.pageTabId);
  try {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (!Number.isInteger(tab.id) || candidates.includes(tab.id)) continue;
      if (MMP.cleanUrl(tab.url) === MMP.cleanUrl(source.pageUrl)) candidates.push(tab.id);
    }
  } catch {}
  for (const tabId of candidates) {
    const html = await readOpenPage(tabId, source.pageUrl);
    if (html) return html;
  }
  return "";
}
function youtubeChannelMetadata(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const canonical = doc.querySelector('link[rel~="canonical"][href]')?.href || "";
  const channelId = doc.querySelector('meta[itemprop="channelId"][content]')?.content?.match(/UC[A-Za-z0-9_-]{22}/)?.[0]
    || canonical.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/)?.[1]
    || doc.querySelector('meta[property="og:url"][content]')?.content?.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/)?.[1]
    || html.match(/"externalId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/)?.[1]
    || "";
  const rawName = doc.querySelector('meta[property="og:title"][content]')?.content || doc.title || "";
  const channelName = MMP.decodeHtmlEntities(rawName.replace(/\s*[-–|]\s*YouTube\s*$/i, "").trim());
  return { channelId, channelName };
}
async function discoverFavicon(pageUrl) {
  try {
    const { text: html } = await fetchText(pageUrl, 3000), doc = new DOMParser().parseFromString(html, "text/html");
    const links = [...doc.querySelectorAll("link[rel][href]")]
      .filter(el => /(^|\s)(icon|shortcut)(\s|$)/i.test(el.getAttribute("rel") || ""))
      .map((el, index) => {
        const url = MMP.cleanUrl(el.getAttribute("href"), pageUrl);
        const sizes = (el.getAttribute("sizes") || "").toLowerCase();
        const rel = (el.getAttribute("rel") || "").toLowerCase();
        const size = Math.max(0, ...[...sizes.matchAll(/(\d+)x(\d+)/g)].map(m => Math.min(+m[1], +m[2])));
        const score = (rel.split(/\s+/).includes("icon") ? 20 : 0)
          + (sizes.includes("any") ? 8 : 0)
          + (size >= 32 && size <= 128 ? 12 : size > 128 ? 2 : size ? 5 : 0)
          + (/^image\//i.test(el.getAttribute("type") || "") ? 2 : 0)
          - (/apple-touch|mask-icon/i.test(rel) ? 100 : 0)
          - index / 1000;
        return { url, score };
      }).filter(item => item.url).sort((a, b) => b.score - a.score);
    const faviconUrl = links[0]?.url || new URL("/favicon.ico", pageUrl).href;
    const result = { faviconUrl, faviconChecked: true, faviconVersion: 2 };
    // Cache same-site icons, including normal high-resolution variants.
    if (new URL(faviconUrl).origin === new URL(pageUrl).origin) {
      try {
        const response = await fetch(faviconUrl, { redirect: "follow", signal: AbortSignal.timeout(8000) });
        const type = response.headers.get("content-type") || "";
        if (response.ok && /^image\//i.test(type)) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length > 0 && bytes.length <= 131072) {
            let binary = "";
            for (const byte of bytes) binary += String.fromCharCode(byte);
            result.faviconData = `data:${type.split(";")[0]};base64,${btoa(binary)}`;
          }
        }
      } catch {}
    }
    return result;
  } catch { return { faviconChecked: true, faviconVersion: 2 }; }
}
function isLikelyThumbnailImage(value) {
  try {
    const url=new URL(value),path=url.pathname.toLowerCase();
    if(/(?:^|[\/_-])(?:thumb|thumbnail|small|medium|preview)(?:[\/_-]|\.)/.test(path))return true;
    const dimensions=path.match(/[-_](\d{2,4})x(\d{2,4})(?=\.[^/]+$)/i),widthMarker=path.match(/(?:^|\/)w_(\d{2,4})(?:\/|$)/i);
    if(dimensions&&Math.max(Number(dimensions[1]),Number(dimensions[2]))<=900||widthMarker&&Number(widthMarker[1])<=900)return true;
    for(const key of ["w","width","maxwidth","resize"]){const size=Number(url.searchParams.get(key));if(size>0&&size<=900)return true;}
  } catch {}
  return false;
}
async function enrichArticleImages(xml, source, articles, knownImages = new Map(), force = false, cachedArticles = []) {
  const doc = new DOMParser().parseFromString(xml || "", "application/xml");
  const sourceArticles = cachedArticles.filter(article => (article.sourceIds || [article.sourceId]).includes(source.id));
  const feedImageFallbackUrl = MMP.cleanUrl(source.feedUrl || "");
  const isFeedFallback = image => !image || (!!feedImageFallbackUrl && MMP.cleanUrl(image) === feedImageFallbackUrl);
  for (const article of [...articles, ...sourceArticles]) {
    article.feedImageFallbackUrl = feedImageFallbackUrl;
    if (article.image && isFeedFallback(article.image)) article.image = "";
  }
  const cachedByUrl=new Map(sourceArticles.map(article=>[article.canonicalUrl,article]));
  const cachedImages=new Map(sourceArticles.map(article=>[article.canonicalUrl,article.image||""]));
  // Prefer the just-parsed feed entry over its cached copy so an absent cover
  // in the current feed can clear an old, incorrectly associated thumbnail.
  const targetByUrl=new Map([...sourceArticles,...articles].map(article=>[article.canonicalUrl,article]));
  const currentUrls=new Set(articles.map(article=>article.canonicalUrl));
  const targets=[...articles.map(article=>targetByUrl.get(article.canonicalUrl)),...sourceArticles.filter(article=>!currentUrls.has(article.canonicalUrl))];
  for (const article of articles) {
    const cached=cachedByUrl.get(article.canonicalUrl);
    if(cached?.imageQualityCheckImage===article.image){article.imageQualityCheckImage=cached.imageQualityCheckImage;article.imageQualityCheckedAt=cached.imageQualityCheckedAt;}
    const known=knownImages.get(article.canonicalUrl);
    if(known&&!isFeedFallback(known)&&(!article.image||isLikelyThumbnailImage(article.image)&&!isLikelyThumbnailImage(known)))article.image=known;
  }
  const needsImageLookup=article=>!article.image||isLikelyThumbnailImage(article.image)&&!(article.imageQualityCheckImage===article.image&&Date.now()-Number(article.imageQualityCheckedAt||0)<7*86400000);
  const missing=targets.filter(needsImageLookup).slice(0,120);
  if (!missing.length) return { articles, imageUpdates: [] };
  const checkedUrls=new Set();
  // Keep the WordPress API as an optional source of featured images, but use
  // each article's ordinary metadata and editorial images for every publisher.
  if (force || /wordpress\.org/i.test(doc.querySelector("channel > generator")?.textContent || "")) try {
    const origin = new URL(source.pageUrl || source.feedUrl).origin;
    const endpoint = new URL("/wp-json/wp/v2/posts", origin);
    if (await accessible(endpoint.href)) {
      const byUrl = new Map();
      for (let i = 0; i < missing.length; i += 80) {
        const batch = missing.slice(i, i + 80), slugs = batch.map(article => {
          try { return new URL(article.canonicalUrl).pathname.split("/").filter(Boolean).at(-1); } catch { return ""; }
        }).filter(Boolean);
        if (!slugs.length) continue;
        const query = new URL(endpoint.href);
        query.searchParams.set("slug", slugs.join(",")); query.searchParams.set("per_page", "100"); query.searchParams.set("_embed", "wp:featuredmedia");
        const { text: json } = await fetchText(query.href, 12000), posts = JSON.parse(json);
        for (const post of posts) {
          const url = MMP.cleanUrl(post.link), media = post?._embedded?.["wp:featuredmedia"]?.[0];
          const image = MMP.cleanUrl(media?.media_details?.sizes?.full?.source_url || media?.source_url || "", post.link);
          if (url && image) byUrl.set(url, image);
        }
      }
      for (const article of missing) {
        const cachedImage = knownImages.get(article.canonicalUrl);
        const fullImage=byUrl.get(MMP.cleanUrl(article.canonicalUrl));
        if(fullImage&&(!article.image||isLikelyThumbnailImage(article.image)))article.image=fullImage;
        else if(!article.image&&!isFeedFallback(cachedImage))article.image=cachedImage;
      }
      for(const article of missing)checkedUrls.add(article.canonicalUrl);
    }
  } catch {}
  const genericTargets=missing.filter(needsImageLookup).slice(0,24);
  for(const article of genericTargets)checkedUrls.add(article.canonicalUrl);
  for (let i = 0; i < genericTargets.length; i += 4) {
    await Promise.all(genericTargets.slice(i, i + 4).map(async article => {
      try {
        if (!await accessible(article.canonicalUrl)) return;
        const { text: html, type } = await fetchText(article.canonicalUrl, 9000);
        if (!/text\/html|application\/xhtml\+xml/i.test(type) || html.length > 8000000) return;
        const page=new DOMParser().parseFromString(html,"text/html"),best=await wordpressFeaturedImage(page,article.canonicalUrl)||articleImage(page,article.canonicalUrl);
        if(best&&(!article.image||isLikelyThumbnailImage(article.image)&&!isLikelyThumbnailImage(best)))article.image=best;
      } catch {}
    }));
  }
  const imageUpdates=[];
  for (const cached of sourceArticles) {
    const current = articles.find(article => article.canonicalUrl === cached.canonicalUrl) || targets.find(article => article.canonicalUrl === cached.canonicalUrl);
    if(!current)continue;
    let changed=false;
    if(current.image&&current.image!==cachedImages.get(cached.canonicalUrl)){cached.image=current.image;cached.replaceImage=true;delete cached.readerImage;changed=true;}
    if(current.image&&isLikelyThumbnailImage(current.image)&&checkedUrls.has(current.canonicalUrl)){
      const checkedAt=Number(current.imageQualityCheckedAt||0);
      if(current.imageQualityCheckImage!==current.image||Date.now()-checkedAt>=7*86400000){current.imageQualityCheckImage=current.image;current.imageQualityCheckedAt=Date.now();changed=true;}
      cached.imageQualityCheckImage=current.imageQualityCheckImage;cached.imageQualityCheckedAt=current.imageQualityCheckedAt;
    } else {if(cached.imageQualityCheckImage!==undefined||cached.imageQualityCheckedAt!==undefined)changed=true;delete cached.imageQualityCheckImage;delete cached.imageQualityCheckedAt;}
    if(changed)imageUpdates.push(cached);
  }
  return { articles, imageUpdates };
}
function structuredExtractionProfile(source, articles) {
  const sample = articles || [];
  return {
    version: 1, method: source.method, kind: "structured-feed", status: "validated", refreshable: true,
    sourceUrl: source.pageUrl, collectionUrl: source.feedUrl,
    urlNormalization: { removeTrackingParameters: true, stripFragment: true, trimTrailingSlash: true },
    fields: {
      title: sample.some(article => !!article.title), date: sample.some(article => !article.dateIsFallback),
      description: sample.some(article => !!article.summary), author: sample.some(article => !!article.author),
      categories: sample.some(article => !!article.categories?.length), keywords: sample.some(article => !!article.keywords?.length), image: sample.some(article => !!article.image),
      video: sample.some(article => !!article.video), content: sample.some(article => !!article.feedContentHtml)
    },
    validation: { sampleCount: sample.length, validatedAt: Date.now() }
  };
}
async function fetchSource(source, knownImages, cachedArticles = [], cinemaPolicy = {}) {
  try {
    if (source.method === "html") {
      let html = typeof source.pageHtml === "string" && source.pageHtml ? source.pageHtml : "", responseInfo = "";
      if (!html) {
        try {
          const response = await fetchText(source.pageUrl, 15000);
          html = response.text;
          responseInfo = `HTTP ${response.status}, ${response.type || "type inconnu"}, ${response.url || source.pageUrl}`;
        } catch (error) { responseInfo = error.message || "erreur réseau"; }
      }
      const directPublication = MMP.extractHtmlPublication(html, source.pageUrl, source);
      const samePagePublication = directPublication.article && directPublication.diagnostics.structured && MMP.cleanUrl(directPublication.article.canonicalUrl) === MMP.cleanUrl(source.pageUrl);
      let parsed = samePagePublication ? [directPublication.article] : [], extractionProfile = samePagePublication
        ? { version: 1, method: "html", kind: "publication", status: "extracted", refreshable: false, sourceUrl: source.pageUrl, fields: directPublication.diagnostics.fields, validation: { ...directPublication.diagnostics, extractedAt: Date.now() } }
        : source.extractionProfile || null;
      let extractionDiagnostics = samePagePublication ? directPublication.diagnostics : null, capturedFromTab = false, referenceParsed = null;
      if (!parsed.length && extractionProfile?.kind === "listing" && extractionProfile?.version === 1) {
        const profiled = MMP.extractHtmlProfile(html, source.pageUrl, source, extractionProfile);
        extractionDiagnostics = profiled.diagnostics;
        const reference = referenceParsed = MMP.parseHtmlArticles(html, source.pageUrl, source);
        const sourceUrl = new URL(source.pageUrl);
        const verifiedReference = [...new Map(reference.filter(article => {
          try {
            const url = new URL(article.canonicalUrl);
            return /^https?:$/.test(url.protocol) && url.origin === sourceUrl.origin && String(article.title || "").replace(/\s+/g, " ").trim().length >= 8 && url.href !== sourceUrl.href;
          } catch { return false; }
        }).map(article => [article.canonicalUrl, article])).values()];
        const profileUrls = new Set(profiled.articles.map(article => article.canonicalUrl));
        const omittedReference = verifiedReference.filter(article => !profileUrls.has(article.canonicalUrl));
        extractionDiagnostics.referenceCount = verifiedReference.length;
        extractionDiagnostics.omittedReferenceCount = omittedReference.length;
        if (profiled.articles.length && !omittedReference.length) {
          parsed = profiled.articles;
          extractionDiagnostics.reusedProfile = true;
          if (cinemaPolicy.force) {
            const enrichedByUrl = new Map(MMP.parseHtmlArticles(html, source.pageUrl, source).map(article => [article.canonicalUrl, article]));
            parsed = parsed.map(article => ({ ...article, ...(enrichedByUrl.get(article.canonicalUrl) || {}) }));
          }
        } else {
          extractionProfile = { ...extractionProfile, status: "stale", invalidatedAt: Date.now(), invalidationReason: omittedReference.length ? `Le profil omet ${omittedReference.length} publication(s) valides reconnues par l’extraction de référence.` : profiled.diagnostics.reason };
          extractionDiagnostics = { ...extractionDiagnostics, reason: extractionProfile.invalidationReason, fallbackUsed: true };
        }
      }
      let legacyParsed = null;
      if (!parsed.length) {
        legacyParsed = referenceParsed || MMP.parseHtmlArticles(html, source.pageUrl, source);
        parsed = legacyParsed;
        const learned = MMP.learnHtmlProfile(html, source.pageUrl);
        if (learned.profile) {
          const sample = MMP.extractHtmlProfile(html, source.pageUrl, source, learned.profile);
          const legacyUrls = new Set(legacyParsed.filter(article => {
            try { const url = new URL(article.canonicalUrl); return /^https?:$/.test(url.protocol) && url.origin === new URL(source.pageUrl).origin && String(article.title || "").replace(/\s+/g, " ").trim().length >= 8; }
            catch { return false; }
          }).map(article => article.canonicalUrl));
          const omittedReference = [...legacyUrls].filter(url => !sample.articles.some(article => article.canonicalUrl === url));
          if (sample.articles.length >= 2 && !omittedReference.length) {
            extractionProfile = learned.profile;
            extractionDiagnostics = { ...learned.diagnostics, ...sample.diagnostics, profileLearned: true, referenceCount: legacyUrls.size, omittedReferenceCount: 0, reusedProfile: false };
          } else {
            extractionDiagnostics = { ...learned.diagnostics, profileLearned: false, referenceCount: legacyUrls.size, omittedReferenceCount: omittedReference.length, reason: omittedReference.length ? `Le profil candidat omet ${omittedReference.length} publication(s) valides reconnues par l’extraction de référence.` : "Le profil candidat ne produit pas assez de publications valides." };
          }
        } else if (extractionDiagnostics) {
          extractionDiagnostics = { ...extractionDiagnostics, fallbackUsed: true, fallbackCount: legacyParsed.length };
        } else extractionDiagnostics = learned.diagnostics;
      }
      let singlePublication = null;
      if (!parsed.length) {
        singlePublication = MMP.extractHtmlPublication(html, source.pageUrl, source);
        if (singlePublication.article) {
          parsed = [singlePublication.article];
          extractionProfile = { version: 1, method: "html", kind: "publication", status: "extracted", refreshable: false, sourceUrl: source.pageUrl, fields: singlePublication.diagnostics.fields, validation: { ...singlePublication.diagnostics, extractedAt: Date.now() } };
          extractionDiagnostics = singlePublication.diagnostics;
        }
      }
      // Reuse an already-open Firefox tab if a static request cannot see its
      // rendered content. This is opportunistic; no background JS renderer is
      // introduced for pages that are not open.
      if ((!parsed.length || (extractionProfile?.status === "stale" && parsed.length < 2)) && !source.pageHtml) {
        const openHtml = await readOpenPageForSource(source);
        if (openHtml) {
          const openArticles = MMP.parseHtmlArticles(openHtml, source.pageUrl, source);
          if (openArticles.length > parsed.length) {
            html = openHtml; parsed = openArticles; capturedFromTab = true;
            const learned = MMP.learnHtmlProfile(openHtml, source.pageUrl);
            if (learned.profile) {
              const sample = MMP.extractHtmlProfile(openHtml, source.pageUrl, source, learned.profile);
              const urls = new Set(openArticles.filter(article => {
                try { const url = new URL(article.canonicalUrl); return /^https?:$/.test(url.protocol) && url.origin === new URL(source.pageUrl).origin && String(article.title || "").replace(/\s+/g, " ").trim().length >= 8; }
                catch { return false; }
              }).map(article => article.canonicalUrl));
              const omittedReference = [...urls].filter(url => !sample.articles.some(article => article.canonicalUrl === url));
              if (sample.articles.length >= 2 && !omittedReference.length) {
                extractionProfile = learned.profile;
                extractionDiagnostics = { ...learned.diagnostics, ...sample.diagnostics, profileLearned: true, referenceCount: urls.size, omittedReferenceCount: 0, reusedProfile: false };
              } else {
                extractionDiagnostics = { ...learned.diagnostics, ...sample.diagnostics, profileLearned: false, referenceCount: urls.size, omittedReferenceCount: omittedReference.length, reason: `Le profil candidat omet ${omittedReference.length} publication(s) valides reconnues par l’extraction de référence.` };
              }
            }
          } else if (!parsed.length && !singlePublication?.article) {
            const one = MMP.extractHtmlPublication(openHtml, source.pageUrl, source);
            if (one.article) {
              html = openHtml; parsed = [one.article]; capturedFromTab = true;
              extractionProfile = { version: 1, method: "html", kind: "publication", status: "extracted", refreshable: false, sourceUrl: source.pageUrl, fields: one.diagnostics.fields, validation: { ...one.diagnostics, extractedAt: Date.now() } };
              extractionDiagnostics = one.diagnostics;
            }
          }
        }
      }
      if (parsed.length === 1 && extractionProfile?.kind !== "publication") {
        const knownSourceUrls = new Set(cachedArticles.filter(article => (article.sourceIds || [article.sourceId]).includes(source.id)).map(article => article.canonicalUrl));
        const hasRepeatableHistory = knownSourceUrls.size >= 2;
        if (hasRepeatableHistory) {
          extractionDiagnostics = { ...(extractionDiagnostics || {}), refreshable: true, knownPublications: knownSourceUrls.size, reason: "Un seul élément est visible cette fois-ci ; l’historique confirme que cette source a déjà fourni une liste répétitive." };
          if (extractionProfile?.kind === "listing") extractionProfile = { ...extractionProfile, status: "stale", refreshable: true };
        } else {
          const reason = "Une publication a été extraite, mais la page ne prouve pas une structure de liste actualisable.";
          extractionProfile = {
            version: 1, method: "html", kind: "listing-unproven", status: "unvalidated", refreshable: false,
            sourceUrl: source.pageUrl, urlNormalization: { removeTrackingParameters: true, stripFragment: true, trimTrailingSlash: true },
            fields: { title: true, date: !parsed[0].dateIsFallback, author: !!parsed[0].author, description: !!parsed[0].summary, image: !!parsed[0].image, categories: !!parsed[0].categories?.length, keywords: !!parsed[0].keywords?.length, video: !!parsed[0].video },
            validation: { sampleCount: 1, minimumItems: 2, validatedAt: Date.now(), reason }
          };
          extractionDiagnostics = { ...(extractionDiagnostics || {}), refreshable: false, reason };
        }
      }
      parsed = parsed.map(article => ({ ...article, title: MMP.recoverArticleTitle(article.title, article.canonicalUrl) }));
      const enriched = await enrichArticleImages("", source, parsed, knownImages, true, cachedArticles);
      const articles = await enrichCinemaArticles(enriched.articles,cachedArticles,cinemaPolicy);
      if (!articles.length) {
        const detail = extractionDiagnostics?.reason ? ` Diagnostic : ${extractionDiagnostics.reason}` : "";
        const e = new Error(`Aucun lien d’article fiable détecté (HTML analysé : ${html.length} caractères${capturedFromTab || source.pageHtml ? ", capturé depuis l’onglet" : ""}${responseInfo ? ` ; réponse : ${responseInfo}` : ""}).${detail}`);
        e.kind = "strategy"; e.diagnostics = extractionDiagnostics; throw e;
      }
      return { articles, imageUpdates: enriched.imageUpdates, method: "html", valid: true, status: source.pageHtml || capturedFromTab ? 200 : undefined, extractionProfile, extractionDiagnostics };
    }
    const { text, status, type } = await fetchText(source.feedUrl, 15000);
    let parsed;
    let xmlRoot = "";
    try {
      if (source.method === "jsonfeed" || /application\/feed\+json|application\/json/i.test(type) || /^\s*\{/.test(text)) {
        parsed = MMP.parseJsonFeed(text, source.feedUrl, source);
      } else {
      const xmlDoc = new DOMParser().parseFromString(MMP.normalizeFeedXml(text), "application/xml");
      xmlRoot = xmlDoc.documentElement?.localName?.toLowerCase() || "";
      if (xmlDoc.querySelector("parsererror") || !["rss", "feed", "rdf", "channel"].includes(xmlRoot)) throw new Error("Flux XML invalide");
      parsed = MMP.parseFeed(text, source.feedUrl, source);
      }
    }
    catch (error) {
      if (/Flux XML invalide/i.test(error.message || "")) {
        const details = [`HTTP ${status}`, type || "type de contenu inconnu", `racine <${xmlRoot || "?"}>`];
        error = new Error(`Flux XML invalide (${details.join(", ")}).`);
      }
      error.kind = "strategy"; error.status = status; throw error;
    }
    parsed = parsed.map(article => ({ ...article, title: MMP.recoverArticleTitle(article.title, article.canonicalUrl) }));
    const enriched = await enrichArticleImages(text, source, parsed, knownImages, false, cachedArticles);
    const articles = await enrichCinemaArticles(enriched.articles,cachedArticles,cinemaPolicy);
    return { articles, imageUpdates: enriched.imageUpdates, method: source.method, valid: true, status, extractionProfile: structuredExtractionProfile(source, articles) };
  } catch (err) { return { error: err.message || "Erreur réseau", kind: err.kind || "transient", status: err.status || 0, diagnostics: err.diagnostics || null }; }
}
async function validateArticleAccess(source, articles, forceCinema = false) {
  // The popup captured this listing from the already-open, permission-granted tab.
  // Its cards and links are direct evidence that the catalogue page is accessible.
  if (source.method === "html" && source.pageHtml) return;
  const sourceUrl = source.method === "html" ? source.pageUrl : source.feedUrl;
  const sourceOrigin = new URL(source.pageUrl || source.feedUrl).origin;
  const candidates = [...new Map(articles.filter(article => article.canonicalUrl).map(article => [article.canonicalUrl, article.canonicalUrl])).keys()]
    .sort((a, b) => Number(new URL(b).origin === sourceOrigin) - Number(new URL(a).origin === sourceOrigin))
    .slice(0, 3);
  const cinemaCandidate=articles.find(article=>(forceCinema||article.cinemaHint)&&article.canonicalUrl)?.canonicalUrl;
  if(cinemaCandidate&&!await accessible(cinemaCandidate))return {needsPermission:new URL(cinemaCandidate).origin};
  let missingPermission = "", lastError = "";
  for (const articleUrl of candidates) {
    if (source.method === "html" && MMP.cleanUrl(articleUrl) === MMP.cleanUrl(sourceUrl)) return;
    if (!await accessible(articleUrl)) { missingPermission ||= new URL(articleUrl).origin; continue; }
    try { await fetchText(articleUrl, 8000); return; }
    catch (error) { lastError = error.message; }
  }
  if (missingPermission) return { needsPermission: missingPermission };
  if (!candidates.length) throw new Error("Aucun article avec un lien valide n’a été trouvé.");
  throw new Error(`Les articles du flux ne sont pas accessibles. ${lastError}`);
}
function clean(doc) {
  const sel = ['nav','[role="navigation"]','aside','[role="complementary"]','[role="dialog"]','[aria-modal="true"]','#didomi-host','#onetrust-consent-sdk','#CybotCookiebotDialog','[class*="cookie-banner" i]','[id*="cookie-banner" i]','[class*="consent-banner" i]','[id*="consent-banner" i]','[class~="ad"]','[id~="ad"]','[class~="pub"]','[id~="pub"]','[class*="publicite" i]','[id*="publicite" i]','[class~="advert"]','[id~="advert"]','[class~="advertisement"]','[id~="advertisement"]','[class*="ad-container" i]','[id*="ad-container" i]','[class*="ad-slot" i]','[id*="ad-slot" i]','[class*="adblock" i]','[id*="adblock" i]','[class*="ad-block" i]','[id*="ad-block" i]','[class*="sponsor" i]','[id*="sponsor" i]','[class*="sponsored" i]','[id*="sponsored" i]','[class*="partner-content" i]','[id*="partner-content" i]','[class*="commercial" i]','[id*="commercial" i]','[class*="promotion" i]','[id*="promotion" i]','[class*="promo" i]','[id*="promo" i]','[class*="social-share" i]','[class*="share-button" i]','[class*="share-tools" i]','[class*="breadcrumb" i]','[aria-label*="advert" i]','[aria-label*="sponsor" i]','[data-ad]','[data-advertisement]','[data-sponsored]','[data-sponsor]','[data-testid*="advert" i]','[data-testid*="sponsor" i]','[data-testid*="promo" i]','video-player','[data-root-video-player]','[data-wrapper-video-player]','[data-adblock-content]','[class*="block-message" i]','[class*="close-button" i]'].join(',');
  for (const n of doc.querySelectorAll(sel)) n.remove();
}
function usableReaderContent(html, baseUrl, minTextLength = 180) {
  const sourceDoc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const video = MMP.extractVideo(sourceDoc, baseUrl, true);
  markInlineVideo(sourceDoc, video, true, baseUrl);
  clean(sourceDoc);
  const safeHtml = MMP.sanitizeArticleHtml(sourceDoc.body.innerHTML, baseUrl);
  const doc = new DOMParser().parseFromString(safeHtml, "text/html"), text = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  return (text.length >= minTextLength || !!video) && safeHtml.length <= 1500000 ? { html: safeHtml, text, video } : null;
}
function semanticArticleContent(doc, baseUrl) {
  const candidates = [...doc.querySelectorAll('[itemprop~="articleBody"], article')];
  let best = null, bestScore = 0;
  for (const candidate of candidates) {
    const body = candidate.cloneNode(true);
    body.querySelectorAll('aside, [role="complementary"]').forEach(node => node.remove());
    clean(body);
    const repeatedBlocks = new Set();
    let primaryTextLength = 0;
    for (const section of [...body.children]) {
      const blockSelector = "p,li,h1,h2,h3,h4,blockquote,figcaption,div";
      const blocks = [...section.querySelectorAll(blockSelector)].filter(node => !node.querySelector(blockSelector));
      const texts = blocks.map(node => (node.textContent || "").replace(/\s+/g, " ").trim()).filter(text => text.length >= 80);
      const sectionTextLength = texts.reduce((sum, text) => sum + text.length, 0);
      if (!sectionTextLength) continue;
      const duplicateLength = texts.reduce((sum, text) => sum + (repeatedBlocks.has(MMP.normalizeText(text)) ? text.length : 0), 0);
      const linkedTextLength = [...section.querySelectorAll("a")].reduce((sum, link) => sum + (link.textContent || "").replace(/\s+/g, " ").trim().length, 0);
      const linkRatio = linkedTextLength / Math.max(sectionTextLength, 1);
      // Once the page has supplied a real article body, drop later link-heavy
      // related-story blocks and long alternate copies of that body (such as
      // downloadable text transcripts). Keep short linked references in prose.
      if (primaryTextLength >= 1500 && sectionTextLength >= 500 && (linkRatio >= 0.6 || (sectionTextLength >= 1200 && duplicateLength / sectionTextLength >= 0.65))) {
        section.remove();
        continue;
      }
      for (const text of texts) repeatedBlocks.add(MMP.normalizeText(text));
      if (linkRatio < 0.6) primaryTextLength += sectionTextLength;
    }
    const content = usableReaderContent(body.innerHTML, baseUrl);
    if (!content) continue;
    const safeDoc = new DOMParser().parseFromString(content.html, "text/html");
    const linkedText = [...safeDoc.querySelectorAll("a")].reduce((length, link) => length + (link.textContent || "").replace(/\s+/g, " ").trim().length, 0);
    const linkRatio = linkedText / Math.max(content.text.length, 1);
    const score = content.text.length * (1 - Math.min(linkRatio, 1));
    if (score > bestScore) { best = { ...content, linkRatio }; bestScore = score; }
  }
  return best;
}
const INLINE_VIDEO_MARKER = "MONMUR_VIDEO_BLOCK";
function markInlineVideo(doc, video, editorialFragment = false, baseUrl = "") {
  if (!video) return false;
  const selector = editorialFragment ? "video,iframe" : "article video,main video,[role='main'] video,[itemprop='articleBody'] video,[class*='article-body'] video,[class*='article-content'] video,article iframe[src],article iframe[data-src],article iframe[data-lazy-src],main iframe[src],main iframe[data-src],main iframe[data-lazy-src],[role='main'] iframe[src],[role='main'] iframe[data-src],[role='main'] iframe[data-lazy-src],[itemprop='articleBody'] iframe[src],[itemprop='articleBody'] iframe[data-src],[itemprop='articleBody'] iframe[data-lazy-src],[class*='article-body'] iframe[src],[class*='article-body'] iframe[data-src],[class*='article-body'] iframe[data-lazy-src],[class*='article-content'] iframe[src],[class*='article-content'] iframe[data-src],[class*='article-content'] iframe[data-lazy-src]";
  const nodes = [...doc.querySelectorAll(selector)];
  const media = nodes.find(node => {
    if (video.kind === "unavailable") return true;
    const raw = node.getAttribute("src") || node.getAttribute("data-src") || node.getAttribute("data-lazy-src") || node.querySelector("source[src],source[data-src],source[data-lazy-src]")?.getAttribute("src") || node.querySelector("source[data-src]")?.getAttribute("data-src") || node.querySelector("source[data-lazy-src]")?.getAttribute("data-lazy-src") || "";
    const candidate = MMP.cleanUrl(raw, baseUrl), target = MMP.cleanUrl(video.src, baseUrl);
    if (!candidate || !target) return false;
    try { const a = new URL(candidate), b = new URL(target); return a.href === b.href || (a.origin === b.origin && a.pathname === b.pathname); }
    catch { return false; }
  });
  const placeholder = !media && video.kind === "unavailable" && video.poster
    ? [...doc.querySelectorAll("figure,picture,[class*='video' i]")].find(node => [...node.querySelectorAll("img")].some(image => {
      const imageUrl = MMP.cleanUrl(image.getAttribute("src") || image.getAttribute("data-src") || "", baseUrl);
      return imageUrl && imageUrl === MMP.cleanUrl(video.poster, baseUrl);
    }))
    : null;
  const target = media || placeholder;
  if (!target) return false;
  const block = target.closest?.("figure,video-player,[data-root-video-player],[data-wrapper-video-player],[class*='video-container' i],[class*='media-player' i]") || target;
  const caption = block.querySelector?.("figcaption,[class*='video-description' i],[class*='video-caption' i]")?.textContent?.replace(/\s+/g, " ").trim();
  if (caption) video.caption = caption.slice(0, 500);
  const marker = doc.createElement("p");
  marker.textContent = INLINE_VIDEO_MARKER;
  block.replaceWith(marker);
  return true;
}
function demosphereEventContent(doc, article) {
  let url;
  try { url = new URL(article.canonicalUrl); } catch { return null; }
  if (!/(^|\.)demosphere\.net$/i.test(url.hostname) || !/^\/rv\/\d+\/?$/.test(url.pathname)) return null;
  const event = doc.querySelector("#eventMain");
  const description = event?.querySelector("#htmlView");
  if (!description) return null;

  const body = description.cloneNode(true);
  body.querySelectorAll("#text-image-zoom, #text-image-link, #text-image-zoom-title, #text-image-zoom-popup-close").forEach(node => node.remove());
  body.querySelectorAll(".openingBlock").forEach(node => node.remove());
  const normalize = value => MMP.normalizeText(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const title = normalize(article.title || "");
  body.querySelectorAll("h1, h2, h3").forEach(heading => {
    const text = normalize(heading.textContent || "");
    if (text && (title.includes(text) || text.includes(title))) heading.remove();
  });

  const details = [];
  const date = event.querySelector("#dateContents");
  const dateText = date?.querySelector(".date")?.textContent?.trim() || "";
  const timeText = date?.querySelector(".time")?.textContent?.trim().replace(/^à\s*/i, "") || "";
  if (dateText && !title.includes(normalize(dateText))) details.push(`<p><strong>Date :</strong> ${dateText.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`);
  if (timeText && !title.includes(normalize(timeText))) details.push(`<p><strong>Horaire :</strong> ${timeText.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`);
  const place = event.querySelector(".place .address-text")?.textContent?.replace(/\s+/g, " ").trim() || "";
  if (place && !title.includes(normalize(place))) details.push(`<p><strong>Lieu :</strong> ${place.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`);
  if (!dateText && !timeText && !place) return usableReaderContent(body.innerHTML, article.canonicalUrl, 20);
  return usableReaderContent(details.join("") + body.innerHTML, article.canonicalUrl, 20);
}
async function wordpressFeaturedImage(doc, pageUrl, wordpressFeed = false) {
  const apiRoot = doc.querySelector('link[rel="https://api.w.org/"]')?.href || "";
  const postLink = doc.querySelector('link[rel="alternate"][type="application/json"][href*="/wp-json/wp/v2/posts/"]')?.href || "";
  const ogImage = MMP.cleanUrl(doc.querySelector('meta[property="og:image"]')?.content || doc.querySelector('meta[name="twitter:image"]')?.content, pageUrl);
  if (!wordpressFeed && !apiRoot && !postLink) return ogImage;
  try {
    let endpoint;
    if (postLink) endpoint = new URL(postLink, pageUrl);
    else if (apiRoot) {
      const slug = new URL(pageUrl).pathname.split("/").filter(Boolean).at(-1);
      if (!slug) return "";
      endpoint = new URL("wp/v2/posts", apiRoot); endpoint.searchParams.set("slug", slug);
    } else if (wordpressFeed) {
      const page = new URL(pageUrl), slug = page.pathname.split("/").filter(Boolean).at(-1);
      if (!slug) return "";
      endpoint = new URL("/wp-json/wp/v2/posts", page.origin); endpoint.searchParams.set("slug", slug);
    } else return "";
    endpoint.searchParams.set("_embed", "1");
    if (!await accessible(endpoint.href)) return "";
    const { text: json } = await fetchText(endpoint.href, 9000), result = JSON.parse(json), post = Array.isArray(result) ? result[0] : result;
    const media = post?._embedded?.["wp:featuredmedia"]?.[0];
    return MMP.cleanUrl(media?.media_details?.sizes?.full?.source_url || media?.source_url || "", pageUrl) || ogImage;
  } catch { return ogImage; }
}
function articleImage(doc, pageUrl) {
  const normalize = value => {
    const url = MMP.cleanUrl(value, pageUrl);
    if (!url) return "";
    try {
      const path = new URL(url).pathname;
      if (/(?:^|[\/_-])(?:logos?|favicons?|sprites?|avatars?|icons?)(?:[\/_-]|\.)/i.test(path)) return "";
    } catch { return ""; }
    return url;
  };
  let metadataImage = "";
  for (const selector of ['meta[property="og:image"]', 'meta[property="og:image:secure_url"]', 'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]', 'meta[itemprop="image"]']) {
    const value = doc.querySelector(selector)?.content;
    const image = normalize(value);
    if (image) { metadataImage = image; break; }
  }
  const candidates = [...doc.querySelectorAll('article figure img, [itemprop="articleBody"] img, main article img, main figure img, [role="main"] article img, [class*="article-content" i] img, [class*="article-body" i] img')];
  for (const node of candidates) {
    // The shared selector also considers <picture> sources and lazy-loaded
    // attributes, while comparing intrinsic variants rather than display size.
    const image = MMP.selectBestImage(node, pageUrl);
    if (image) return image;
  }
  if (metadataImage) return metadataImage;
  for (const node of candidates) {
    const image = MMP.selectBestImage(node, pageUrl);
    if (image) return image;
  }
  return "";
}
function eventMetadata(doc, pageUrl) {
  const events = [];
  const visit = value => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    const types = [].concat(value["@type"] || []).map(type => String(type).toLowerCase());
    if (types.includes("event")) events.push(value);
    if (value["@graph"]) visit(value["@graph"]);
    if (value.mainEntity) visit(value.mainEntity);
    if (value.itemListElement) visit(value.itemListElement);
  };
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) try { visit(JSON.parse(script.textContent)); } catch {}
  const event = events[0];
  const placeValue = event?.location;
  const microdataPlace = doc.querySelector('[itemprop="location"]');
  const place = typeof placeValue === "string" ? placeValue : [placeValue?.address?.streetAddress || placeValue?.name, placeValue?.address?.postalCode, placeValue?.address?.addressLocality].filter(Boolean).join(", ") || microdataPlace?.textContent?.replace(/\s+/g, " ").trim() || doc.querySelector(".localisation-address, [itemprop='streetAddress']")?.textContent?.replace(/\s+/g, " ").trim() || "";
  const start = event?.startDate || doc.querySelector('[itemprop="startDate"]')?.getAttribute("content") || doc.querySelector('time[datetime]')?.getAttribute("datetime") || "";
  const end = event?.endDate || doc.querySelector('[itemprop="endDate"]')?.getAttribute("content") || "";
  const schedules = [];
  for (const opening of doc.querySelectorAll(".sheet-opening[periods], [data-periods]")) try {
    const periods = JSON.parse(opening.getAttribute("periods") || opening.getAttribute("data-periods") || "[]");
    const collectSchedules = value => {
      if (Array.isArray(value)) return value.forEach(collectSchedules);
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value.schedules)) schedules.push(...value.schedules);
      for (const [key, child] of Object.entries(value)) if (key !== "schedules") collectSchedules(child);
    };
    collectSchedules(periods);
  } catch {}
  const cleanTime = value => String(value || "").replace(/:00$/, "");
  const timeText = [...new Set(schedules.map(schedule => [cleanTime(schedule.startTime), cleanTime(schedule.endTime)].filter(Boolean).join(" à ")).filter(Boolean))].join(" · ");
  const displayDate = value => { const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", ...(String(value).includes("T") ? { timeStyle: "short" } : {}) }).format(parsed) : ""; };
  const description = event?.description || doc.querySelector('meta[property="og:description"]')?.content || doc.querySelector('meta[name="description"]')?.content || "";
  if (!event && !/(^|\/)agenda\//i.test(new URL(pageUrl).pathname)) return null;
  return {
    startDate: start, endDate: end, dateText: [displayDate(start), end && end.slice(0,10) !== start.slice(0,10) ? displayDate(end) : ""].filter(Boolean).join(" – "), timeText, place: String(place || "").trim(),
    category: [].concat(event?.eventType || event?.category || []).map(String).filter(Boolean),
    description: String(description).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0,1200)
  };
}
const eventMetadataInFlight = new Map();
async function fetchEventMetadata(article) {
  if (!/(^|\/)agenda\//i.test(new URL(article.canonicalUrl).pathname)) return null;
  if (eventMetadataInFlight.has(article.id)) return eventMetadataInFlight.get(article.id);
  const request = (async () => {
    const { text: html, type } = await fetchText(article.canonicalUrl, 9000);
    if (!/text\/html|application\/xhtml\+xml/i.test(type) || html.length > 8000000) return null;
    const event = eventMetadata(new DOMParser().parseFromString(html, "text/html"), article.canonicalUrl);
    if (event) await MMPDB.cacheEventMetadata(article.id, event);
    return event;
  })();
  eventMetadataInFlight.set(article.id, request);
  try { return await request; } finally { eventMetadataInFlight.delete(article.id); }
}
async function fetchWordPressFeaturedImage(article) {
  if (!await accessible(article.canonicalUrl)) return "";
  const { text: html, type } = await fetchText(article.canonicalUrl);
  if (!/text\/html|application\/xhtml\+xml/i.test(type) || html.length > 8000000) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return await wordpressFeaturedImage(doc, article.canonicalUrl) || articleImage(doc, article.canonicalUrl);
}
async function fetchReaderContent(article) {
  const { sources } = await state();
  const source = sources.find(s => s.id === article.sourceId) || sources.find(s => (article.sourceIds || []).includes(s.id));
  let wordpressFeed = false, feedImage = article.image || "", feedContent = null;
  if (source?.feedUrl && source.method !== "html" && await accessible(source.feedUrl)) {
    try {
      const { text: xml, type } = await fetchText(source.feedUrl);
      if (source.method !== "jsonfeed") {
        const feedDoc = new DOMParser().parseFromString(xml, "application/xml");
        wordpressFeed = /wordpress\.org/i.test(feedDoc.querySelector("channel > generator")?.textContent || "");
      }
      const entry = (source.method === "jsonfeed" || /application\/feed\+json|application\/json/i.test(type) ? MMP.parseJsonFeed(xml, source.feedUrl, source, true) : MMP.parseFeed(xml, source.feedUrl, source, true)).find(a => a.canonicalUrl === article.canonicalUrl);
      feedImage ||= entry?.image || "";
      if (entry?.feedContentHtml) {
        const content = usableReaderContent(entry.feedContentHtml, article.canonicalUrl);
        if (content) {
          feedContent = { ...content, source: "flux" };
        }
      }
    } catch {}
  }
  if (!await accessible(article.canonicalUrl)) {
    if (feedContent) return { ...feedContent, image: feedImage };
    throw new Error("L’autorisation d’accès au site de l’article n’est pas disponible.");
  }
  let html, type;
  try {
    ({ text: html, type } = await fetchText(article.canonicalUrl, 18000));
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) throw new Error("Le site n’a pas fourni de page HTML lisible.");
    if (html.length > 8000000) throw new Error("La page est trop volumineuse pour être extraite.");
  } catch (error) {
    if (feedContent) return { ...feedContent, image: feedImage };
    throw error;
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  let image = await wordpressFeaturedImage(doc, article.canonicalUrl, wordpressFeed) || articleImage(doc, article.canonicalUrl) || feedImage;
  const event = eventMetadata(doc, article.canonicalUrl);
  if (event) article.event = { ...(article.event || {}), ...event };
  const eventContent = demosphereEventContent(doc, article);
  if (eventContent) return { ...eventContent, image, source: "article" };
  if (feedContent) return { ...feedContent, image };
  const video = MMP.extractVideo(doc, article.canonicalUrl);
  markInlineVideo(doc, video, false, article.canonicalUrl);
  clean(doc);
  // Run Readability against the complete cleaned page first. Broad class-name
  // selectors such as "article content" also match related-story cards on
  // some publishers (including newsroom list blocks).
  const base = doc.createElement("base"); base.href = article.canonicalUrl;
  doc.head.prepend(base);
  // Readability mutates its input while pruning the page. Keep the cleaned
  // original intact so semantic article containers remain available as a
  // comparison when Readability selects a short related-content block.
  const parsed = new Readability(doc.cloneNode?.(true) || doc, { charThreshold: 180 }).parse();
  const fallback = () => ({ html: readerFallback(article), text: article.summary || "", video, image, source: "article" });
  let content = parsed?.content ? usableReaderContent(parsed.content, article.canonicalUrl) : null;
  const semanticContent = semanticArticleContent(doc, article.canonicalUrl);
  if (semanticContent && semanticContent.linkRatio <= 0.2 && (!content || semanticContent.text.length >= Math.max(content.text.length + 300, content.text.length * 1.3))) content = semanticContent;
  if (!content) {
    // Semantic containers are a fallback for pages where Readability cannot
    // meet its text threshold. Keep the generic class fallback restricted to
    // body-like names so recommendation cards are less likely to win.
    const articleBody = doc.querySelector('[itemprop~="articleBody"], [rel~="article-content"], [class*="article" i][class*="body" i], article, main, [role="main"]');
    if (articleBody) {
      const editorialBody = articleBody.cloneNode(true);
      clean(editorialBody);
      content = usableReaderContent(editorialBody.innerHTML, article.canonicalUrl);
    }
  }
  if (!parsed?.content && !content) { if (video) return fallback(); throw new Error("Aucun contenu éditorial exploitable n’a été détecté."); }
  // Keep the article body images in the expanded article; do not promote its
  // first inline image to the card cover when the publisher has no cover.
  if (!content) { if (video) return fallback(); throw new Error("Le contenu de l’article est trop court ou incomplet."); }
  return { ...content, video: video || content.video, image, event, source: "article" };
}
function cleanCinemaTitle(title) {
  return MMP.decodeHtmlEntities(String(title || "")).replace(/\b(?:VF|VOSTFR|VOST|VO|MULTI|720p|1080p|2160p|4K|WEB[- .]?DL|WEBRip|Blu[- .]?Ray|HDRip|DVDRip)\b/gi, " ").replace(/[._]+/g," ").replace(/\s+/g," ").replace(/[\s:;,.!?–—-]+$/g,"").trim();
}
function cinemaYear(article) {
  const match = String(article.title || "").match(/\b(19\d{2}|20\d{2})\b/);
  if(match)return Number(match[1]);
  return 0;
}
function cinemaTitleKey(value){return MMP.normalizeText(value).replace(/[^\p{L}\p{N}]+/gu,"");}
function cinemaMetadataRecognized(cinema){return cinema?.recognized===true||["allocine","wikipedia"].includes(cinema?.source);}
function selectCinemaCandidate(candidates, year=0){
  const unique=[...new Map(candidates.map(candidate=>[candidate.path,candidate])).values()];
  let pool=unique;
  if(year){const matchingYear=unique.filter(candidate=>candidate.resultYear===year);if(matchingYear.length)pool=matchingYear;else if(unique.some(candidate=>candidate.resultYear))return null;}
  return pool.length===1?pool[0]:null;
}
function cinemaArticleTitle(article) {
  const title=cleanCinemaTitle(article.title).replace(/\(?\b(?:19|20)\d{2}\b\)?/g," ").replace(/\s+/g," ").trim();
  if(title&& !/^(?:lire |voir |une? )?(?:la )?(?:critique|avis|review|film|serie|série)$/i.test(title))return title;
  try { const match=new URL(article.canonicalUrl).pathname.match(/^\/(?:film|serie|series)\/([^/]+)\/(?:critique|avis|review)(?:\/|$)/i); if(match)return decodeURIComponent(match[1]).replace(/[_-]+/g," ").trim(); } catch {}
  return title;
}
function usableCinemaImage(value, baseUrl) {
  if (!value) return "";
  const image=MMP.cleanUrl(value,baseUrl);
  return /(?:placeholder|no[-_]?image|default[-_]?image|coming[-_]?soon|logo|blank)/i.test(image) ? "" : image;
}
async function cinemaSourceMetadata(article) {
  try {
    if(!await accessible(article.canonicalUrl))return null;
    const response=await fetchText(article.canonicalUrl,8000);
    if(!/text\/html/i.test(response.type))return null;
    const doc=new DOMParser().parseFromString(response.text,"text/html"), pageTitle=doc.title||"", socialTitle=doc.querySelector('meta[property="og:title"]')?.content||"", structured=schemaCinema(doc);
    let title=structured?.title||socialTitle||pageTitle, year=structured?.year||Number((pageTitle.match(/\b(19\d{2}|20\d{2})\b/)||[])[1])||0;
    const decorated=pageTitle.match(/^(?:film|s[ée]rie)\s+(.+?)\s*\(((?:19|20)\d{2})\)(?:\s+.*)?$/i);
    if(decorated){title=decorated[1].trim();year=Number(decorated[2]);}
    const image=doc.querySelector('meta[property="og:image"]')?.content||doc.querySelector('meta[name="twitter:image"]')?.content||doc.querySelector('[class*="poster" i] img[src], [class*="thumbnail" i] img[src]')?.getAttribute("src")||doc.querySelector('[class*="poster" i] img[data-src], [class*="thumbnail" i] img[data-src]')?.getAttribute("data-src")||"";
    const path=new URL(article.canonicalUrl).pathname,recognized=!!structured||/^\/(?:film|films|series|serie)\//i.test(path)||decorated!==null;
    return {...(structured||{}),title:cleanCinemaTitle(title),recognized,kind:structured?.kind||(/^\/(?:series|serie)\//i.test(path)||/^s[ée]rie\b/i.test(pageTitle)?"series":/^\/(?:film|films)\//i.test(path)||/^film\b/i.test(pageTitle)?"film":""),year,description:structured?.description||doc.querySelector('meta[property="og:description"]')?.content||doc.querySelector('meta[name="description"]')?.content||"",image:usableCinemaImage(structured?.image||image,article.canonicalUrl),ratingSource:structured?.rating?(structured.ratingSource||"publisher"):""};
  } catch { return null; }
}
function schemaCinema(doc) {
  const values=[]; for(const node of doc.querySelectorAll('script[type="application/ld+json"]')) try { const parsed=JSON.parse(node.textContent); values.push(...(Array.isArray(parsed)?parsed:[parsed])); } catch {}
  const flatten=value=>{if(!value||typeof value!=="object")return [];return [...(Array.isArray(value)?value: [value]).flatMap(x=>[x,...(x["@graph"]?flatten(x["@graph"]):[])])];};
  const item=flatten(values).find(x=>[x["@type"]].flat().some(t=>["Movie","TVSeries","TVEpisode","CreativeWorkSeries"].includes(t)));
  if(!item)return null; const director=[].concat(item.director||[]).map(x=>typeof x==="string"?x:x?.name).filter(Boolean);
  const actors=[].concat(item.actor||[]).map(x=>x?.actor?.name||x?.name).filter(Boolean).slice(0,8);
  const rawImage=[].concat(item.image||[])[0], image=typeof rawImage==="string"?rawImage:rawImage?.url||"";
  const date=String(item.datePublished||item.dateCreated||""); const rating=item.aggregateRating||{}, types=[].concat(item["@type"]||[]).map(String);
  return {title:item.name||"", originalTitle:item.alternateName||"", kind:types.some(type=>["TVSeries","TVEpisode","CreativeWorkSeries"].includes(type))?"series":"film", recognized:true, year:Number(date.slice(0,4))||0, description:String(item.description||"").trim(), image, genres:[].concat(item.genre||[]).map(String).filter(Boolean), director, actors, rating:rating.ratingValue??"", ratingScale:rating.bestRating||rating.worstRating||"", ratingCount:rating.ratingCount||rating.reviewCount||""};
}
function allocineRatings(doc) {
  // AlloCiné's JSON-LD aggregate is the audience score; the labeled rows carry
  // the separate press and spectator values and their own review counts.
  return [...doc.querySelectorAll(".rating-holder .rating-item")].flatMap(item=>{
    const label=item.querySelector(".rating-title")?.textContent?.replace(/\s+/g," ").trim()||"";
    const kind=/^spectateurs?$/i.test(label)?"spectateurs":/^presse$/i.test(label)?"presse":"";
    const rawValue=item.querySelector(".stareval-note")?.textContent?.trim()||"",value=rawValue.replace(",",".");
    if(!kind||!value||!Number.isFinite(Number(value)))return [];
    return [{kind,value,scale:"5",count:item.querySelector(".stareval-review")?.textContent?.replace(/\s+/g," ").trim()||"",source:"allocine"}];
  });
}
function pageCinemaMetadata(doc, article) {
  const structured=schemaCinema(doc), pageTitle=doc.title||"", decorated=pageTitle.match(/^(?:film|s[ée]rie)\s+(.+?)\s*\(((?:19|20)\d{2})\)(?:\s+.*)?$/i);
  const title=structured?.title||decorated?.[1]?.trim()||doc.querySelector("h1")?.textContent?.trim()||doc.querySelector('meta[property="og:title"]')?.content||pageTitle||article.title;
  const cleanTitle=cleanCinemaTitle(title).replace(/\s+(?:\||·|–|—|-)\s+[^|·–—-]+$/," ").trim()||article.title;
  const year=structured?.year||Number(decorated?.[2])||Number((pageTitle.match(/\b(19\d{2}|20\d{2})\b/)||[])[1])||0;
  let image=structured?.image||doc.querySelector('meta[property="og:image"],meta[property="og:image:secure_url"],meta[name="twitter:image"],meta[itemprop="image"]')?.content||"";
  if(!image){const titleKey=MMP.normalizeText(cleanTitle);const img=[...doc.querySelectorAll("img[src],img[data-src],img[data-original]")].find(node=>{const label=MMP.normalizeText(`${node.alt||""} ${node.title||""} ${node.className||""}`);return label.includes(titleKey)||/poster|affiche|cover/i.test(label);});image=img?.getAttribute("src")||img?.getAttribute("data-src")||img?.getAttribute("data-original")||articleImage(doc,article.canonicalUrl)||"";}
  const path=(()=>{try{return new URL(article.canonicalUrl).pathname;}catch{return "";}})();
  const recognized=!!structured||/^\/(?:film|films|series|serie)\//i.test(path)||/^(?:film|s[ée]rie)\s/i.test(doc.title||"");
  return {...(structured||{}),title:cleanTitle,recognized,kind:structured?.kind||(/^\/(?:series|serie)\//i.test(path)||/^s[ée]rie\b/i.test(doc.title||"")?"series":/^\/(?:film|films)\//i.test(path)||/^film\b/i.test(doc.title||"")?"film":""),year,description:structured?.description||doc.querySelector('meta[property="og:description"],meta[name="description"],meta[name="twitter:description"]')?.content||"",image:usableCinemaImage(image,article.canonicalUrl),ratingSource:structured?.rating?(structured.ratingSource||"publisher"):"",url:article.canonicalUrl,source:"linked-page",checkedAt:Date.now()};
}
async function fetchWikipediaCinema(title, year=0) {
  if (!await hasCinemaLookupConsent()) return null;
  for(const language of ["fr","en"]){
    if (!await hasCinemaLookupConsent()) return null;
    const base=`https://${language}.wikipedia.org`,searchUrl=`${base}/w/rest.php/v1/search/page?q=${encodeURIComponent(title)}&limit=6`;
    try{
      if(!await accessible(searchUrl))continue;
      const search=JSON.parse((await fetchText(searchUrl,8000)).text), target=cinemaTitleKey(title);
      let matches=(search.pages||[]).map(page=>{
        const candidate=String(page.title||"").replace(/\s*\((?:film|série).*$/i,"").trim(),key=cinemaTitleKey(candidate),label=`${page.title||""} ${page.description||""} ${page.excerpt||""}`,foundYear=Number(label.match(/\b(19\d{2}|20\d{2})\b/)?.[1])||0;
        return {page,candidate,key,foundYear,score:key===target?1:0};
      }).filter(item=>item.score===1);
      if(!matches.length)continue;
      const match=selectCinemaCandidate(matches.map(match=>({...match,path:match.page.title})),year);
      if(!match)continue;
      const summaryUrl=`${base}/api/rest_v1/page/summary/${encodeURIComponent(match.page.title)}`;
      const summary=JSON.parse((await fetchText(summaryUrl,8000)).text);
      const kindLabel=`${match.page.title||""} ${match.page.description||""} ${match.page.excerpt||""}`,kind=/s[ée]rie(?: télévisée| télé| TV)?/i.test(kindLabel)?"series":/\bfilm\b|long métrage/i.test(kindLabel)?"film":"";
      return {title:match.candidate||summary.title||title,kind,recognized:true,year:match.foundYear||year||0,description:summary.extract||match.page.excerpt||"",image:usableCinemaImage(summary.thumbnail?.source||match.page.thumbnail?.url||"",base),url:summary.content_urls?.desktop?.page||summaryUrl,source:"wikipedia",genres:[],director:[],actors:[],rating:"",ratingCount:""};
    }catch{}
  }
  return null;
}
async function enrichCinemaArticles(articles, cachedArticles=[], policy={}) {
  const cacheById=new Map(cachedArticles.map(article=>[article.id,article]));
  const now=Date.now(), targets=[],catalogConsent=policy.force&&await hasCinemaLookupConsent();
  for(const article of articles){
    const previous=cacheById.get(article.id);
    if(previous?.cinema&&!previous.cinema.status){article.cinema=previous.cinema;article.cinemaCheckedAt=previous.cinemaCheckedAt||previous.cinema.checkedAt||0;}
    else if(previous?.cinemaCheckedAt)article.cinemaCheckedAt=previous.cinemaCheckedAt;
    if(previous?.cinemaCatalogCheckedAt)article.cinemaCatalogCheckedAt=previous.cinemaCatalogCheckedAt;
    if(previous?.cinemaCatalogVersion)article.cinemaCatalogVersion=previous.cinemaCatalogVersion;
    const hasCatalogMatch=article.cinema&&["allocine","wikipedia"].includes(article.cinema.source);
    const needsPageMetadata=!article.cinema&&(!article.cinemaCheckedAt||now-article.cinemaCheckedAt>7*86400000);
    // A negative lookup is only a short cooldown. A source-page summary must
    // remain eligible for a later catalog match, even when the seven-day
    // reader cache is still valid. Successful catalog matches are retained
    // indefinitely by the `hasCatalogMatch` check above.
    const needsCatalogMetadata=catalogConsent&&!hasCatalogMatch&&(article.cinemaCatalogVersion!==1||!article.cinemaCatalogCheckedAt||now-article.cinemaCatalogCheckedAt>86400000);
    if(policy.force&&(needsPageMetadata||needsCatalogMetadata))targets.push(article);
  }
  for(let i=0;i<Math.min(targets.length,12);i+=3)await Promise.all(targets.slice(i,i+3).map(async article=>{
    try{
      if(!article.cinema||article.cinema.source!=="linked-page"){
        if(!await accessible(article.canonicalUrl))return;
        const response=await fetchText(article.canonicalUrl,9000);
        if(!/text\/html|application\/xhtml\+xml/i.test(response.type)||response.text.length>8000000)return;
        article.cinema=pageCinemaMetadata(new DOMParser().parseFromString(response.text,"text/html"),article);
        article.cinemaCheckedAt=now;
      }
      if(catalogConsent){
        const matched=await fetchCinemaDetails(article,policy.wall,true);
        if(matched)article.cinema=matched;
        article.cinemaCatalogCheckedAt=now;
        article.cinemaCatalogVersion=1;
      }
    }catch{article.cinemaCheckedAt=now;}
  }));
  return articles;
}
async function enrichExistingCinemaArticles(cachedArticles, current, wallId="") {
  const sources=new Map((current.sources||[]).map(source=>[source.id,source]));
  const walls=new Map((current.walls||[]).map(wall=>[wall.id,wall]));
  const groups=new Map();
  for(const article of cachedArticles){
    const ids=article.sourceIds||[article.sourceId], candidates=ids.map(id=>sources.get(id)).filter(Boolean);
    let cinemaWall=null;
    for(const source of candidates){
      for(const id of source.wallIds||[]){
        if(wallId&&id!==wallId)continue;
        const wall=walls.get(id);
        if(wall&&wallCinemaEnabled(wall,current.wallSettings?.[id])){cinemaWall=wall;break;}
      }
      if(cinemaWall)break;
    }
    if(!cinemaWall)continue;
    const group=groups.get(cinemaWall.id)||{wall:cinemaWall,articles:[]};
    group.articles.push(article);groups.set(cinemaWall.id,group);
  }
  let remaining=12;
  for(const group of groups.values()){
    if(!remaining)break;
    const batch=group.articles.slice(0,remaining);
    await enrichCinemaArticles(batch,cachedArticles,{force:true,wall:group.wall});
    await MMPDB.putMany(batch);
    remaining-=batch.length;
  }
}
async function fetchCinemaDetails(article, wall, allowRetry=false) {
  if (!await hasCinemaLookupConsent()) return cinemaMetadataRecognized(article.cinema)?article.cinema:null;
  if(!allowRetry&&article.cinemaCatalogCheckedAt&&Date.now()-Number(article.cinemaCatalogCheckedAt)<86400000&&!cinemaMetadataRecognized(article.cinema))return null;
  if(!articleCinemaEnabled(wall, article, (await state()).wallSettings[wall.id]))return null;
  const sourceMeta=article.cinema?.source==="linked-page"?article.cinema:null;
  const requestedYear=cinemaYear(article);
  if(article.cinema&&!sourceMeta&&article.cinema.status!=="not-found"&&!(requestedYear&&article.cinema.year&&requestedYear!==article.cinema.year))return article.cinema;
  // A publisher page may expose only a generic placeholder as og:image. Keep
  // consulting the catalog so a real poster and film details can replace it.
  const fallback=linkedMeta=>({title:linkedMeta?.title||cinemaArticleTitle(article)||article.title,recognized:linkedMeta?.recognized===true,kind:linkedMeta?.kind||"",year:cinemaYear(article)||linkedMeta?.year||0,description:linkedMeta?.description||article.summary||"",image:linkedMeta?.image||usableCinemaImage(article.image,article.canonicalUrl),url:article.canonicalUrl,source:"linked-page",genres:linkedMeta?.genres||[],director:linkedMeta?.director||[],actors:linkedMeta?.actors||[],rating:linkedMeta?.rating||"",ratingScale:linkedMeta?.ratingScale||"",ratingCount:linkedMeta?.ratingCount||"",ratingSource:linkedMeta?.ratingSource||""});
  const miss=async()=>fallback(linkedMeta);
  const linkedMeta=sourceMeta||await cinemaSourceMetadata(article), title=linkedMeta?.title||cinemaArticleTitle(article); if(title.length<2)return linkedMeta||null;
  const wikipediaMatch=async()=>{const result=await fetchWikipediaCinema(title,year);if(!result)return null;const enriched={...linkedMeta,...result,kind:result.kind||linkedMeta?.kind||"",year:result.year||linkedMeta?.year||0,description:result.description||linkedMeta?.description||article.summary||"",image:result.image||linkedMeta?.image||"",genres:result.genres?.length?result.genres:linkedMeta?.genres||[],director:result.director?.length?result.director:linkedMeta?.director||[],actors:result.actors?.length?result.actors:linkedMeta?.actors||[],rating:linkedMeta?.rating||result.rating||"",ratingScale:linkedMeta?.ratingScale||result.ratingScale||"",ratingCount:linkedMeta?.ratingCount||result.ratingCount||"",ratingSource:linkedMeta?.ratingSource||result.ratingSource||"",url:result.url,source:"wikipedia"};await MMPDB.cacheCinemaMetadata(article.id,enriched);return enriched;};
  const searchQuery=title.replace(/[^\p{L}\p{N}\s]+/gu," ").replace(/\s+/g," ").trim();
  const searchUrl=`https://www.allocine.fr/rechercher/?q=${encodeURIComponent(searchQuery)}`;
  if (!await hasCinemaLookupConsent()) return null;
  const year=cinemaYear(article)||linkedMeta?.year||0;
  if(!await accessible(searchUrl))return await wikipediaMatch()||await miss();
  let searchResponse;try{searchResponse=await fetchText(searchUrl,10000);}catch{return await wikipediaMatch()||await miss();}
  const {text: searchHtml,type}=searchResponse; if(!/text\/html/i.test(type))return await wikipediaMatch()||await miss();
  const doc=new DOMParser().parseFromString(searchHtml,"text/html"), target=cinemaTitleKey(title), candidates=[];
  for(const el of doc.querySelectorAll(".meta-title-link, .meta-title a, h2 a")){
    const candidate=cleanCinemaTitle(el.textContent), normalized=cinemaTitleKey(candidate); if(!candidate)continue;
    let score=normalized===target?1:0;
    if(score<.8)continue;
    let path=""; for(const token of el.classList){try{const decoded=atob(token.replace(/ACr/g,""));if(decoded.startsWith("/film/")||decoded.startsWith("/series/")){path=decoded;break;}}catch{}}
    if(!path&&el.href)try{const u=new URL(el.href);if(u.hostname.endsWith("allocine.fr"))path=u.pathname+u.search;}catch{}
    if(!path)continue;
    const row=el.closest(".card, .entity-card, .meta, li")||el.parentElement, dateText=row?.textContent||"", resultYear=Number(dateText.match(/\b(19\d{2}|20\d{2})\b/)?.[1])||0;
    candidates.push({candidate,score,path,resultYear});
  }
  const match=selectCinemaCandidate(candidates,year);
  if(!match||match.score<.99)return await wikipediaMatch()||await miss();
  const pageUrl=new URL(match.path,"https://www.allocine.fr").href; if(!await accessible(pageUrl))return await wikipediaMatch()||await miss();
  let page;try{page=await fetchText(pageUrl,10000);}catch{return await wikipediaMatch()||await miss();}
  if(!/text\/html/i.test(page.type))return await wikipediaMatch()||await miss();
  const cinemaDoc=new DOMParser().parseFromString(page.text,"text/html"),metadata=schemaCinema(cinemaDoc),ratings=allocineRatings(cinemaDoc);
  if(metadata?.rating!==""&&metadata?.rating!==null&&metadata?.rating!==undefined&&!ratings.some(rating=>rating.kind==="spectateurs"))ratings.push({kind:"spectateurs",value:String(metadata.rating),scale:String(metadata.ratingScale||"5"),count:String(metadata.ratingCount||""),source:"allocine"});
  if(!metadata||cinemaTitleKey(metadata.title)!==cinemaTitleKey(match.candidate))return await wikipediaMatch()||await miss();
  if(year&&metadata.year&&year!==metadata.year)return await wikipediaMatch()||await miss();
  const audienceRating=ratings.find(rating=>rating.kind==="spectateurs"),pressRating=ratings.find(rating=>rating.kind==="presse"),result={...linkedMeta,...metadata,title:metadata.title||linkedMeta?.title,kind:metadata.kind||(match.path.startsWith("/series/")?"series":linkedMeta?.kind||"film"),year:year||metadata.year||match.resultYear||linkedMeta?.year||0,description:metadata.description||linkedMeta?.description||"",image:usableCinemaImage(metadata.image, pageUrl)||linkedMeta?.image||"",ratings:ratings.length?ratings:linkedMeta?.ratings||[],rating:audienceRating?.value??metadata.rating??linkedMeta?.rating??"",ratingScale:audienceRating?.scale??metadata.ratingScale??linkedMeta?.ratingScale??"",ratingCount:audienceRating?.count??metadata.ratingCount??linkedMeta?.ratingCount??"",ratingSource:audienceRating?"allocine":metadata.rating!==""&&metadata.rating!==null&&metadata.rating!==undefined?"allocine":linkedMeta?.ratingSource||"",ratingPress:pressRating?.value||"",ratingPressScale:pressRating?.scale||"",ratingPressCount:pressRating?.count||"",url:pageUrl,source:"allocine",matchedTitle:match.candidate,matchedAt:Date.now()}; await MMPDB.cacheCinemaMetadata(article.id,result); return result;
}
function readerFallback(article) {
  const escaped = String(article.summary || "Aucun résumé n’est disponible.").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>");
  return MMP.sanitizeArticleHtml(`<p>${escaped}</p>`, article.canonicalUrl);
}
let refreshInFlight = null, refreshQueued = null;
async function rediscoverSource(source, knownImages, cachedArticles, previousSuccessfulSync=0, firstCollectionStartedAt=0, deadlineAt=Date.now()+15000, acquisitionMode="Automatique") {
  const stamp = Date.now();
  source.lastRediscoveryAt = stamp;
  let checkingHomepage = true;
  try {
    const remaining = () => Math.max(0, deadlineAt - Date.now());
    if (!await accessible(source.pageUrl)) throw Object.assign(new Error("Autorisation du domaine révoquée"), { kind: "access" });
    const { text: html } = await sourceTimeout(fetchText(source.pageUrl, Math.min(5000, remaining())), remaining());
    checkingHomepage = false;
    const candidates = [...new Set([
      ...knownPublisherFeedCandidates(source.pageUrl),
      ...(await discoverFeedCandidates(source.pageUrl, html)).map(item => item.url)
    ])].filter(url => url !== source.feedUrl);
    for (const feedUrl of candidates.slice(0, 2)) {
      if (!remaining()) break;
      if (!await accessible(feedUrl)) continue;
      const candidate = { ...source, feedUrl, method: "rss" };
      const current = await state();
      const result = await sourceTimeout(fetchSource(candidate, knownImages, cachedArticles, sourceCinemaPolicy(source,current)), remaining());
      if (!result.error && result.articles.length) {
        const wallCutoffs = await firstCollectionCutoffsFor(source, result.articles, current, cachedArticles, firstCollectionStartedAt);
        const persistenceDiagnostics = {};
        const rows = await sourceRowsToPersist(source.id, [...result.articles, ...(result.imageUpdates || [])], previousSuccessfulSync, firstCollectionStartedAt, wallCutoffs, persistenceDiagnostics);
        const knownSourceUrls = await MMPDB.sourceHistory(source.id, result.articles.map(row => row.canonicalUrl));
        await MMPDB.putMany(rows);
        await MMPDB.rememberSourceArticles(source.id, result.articles, { ...sourceHistoryMetadata(source, result.method, acquisitionMode), acquiredCanonicalUrls: rows.map(row => row.canonicalUrl) });
        source.lastAcquisitionDiagnostics = sourceAcquisitionDiagnostic({ attemptedAt: source.lastAttemptAt || stamp, finishedAt: Date.now(), outcome: "success", method: result.method, result, selectedRows: rows, knownSourceUrls: [...knownSourceUrls], persistenceDiagnostics, storageCompleted: true, stage: "redécouverte et mémorisation" });
        if (result.method === "html") await clearOrphanedReadingStates(await MMPDB.reconcileSourceArticles(source.id, result.articles), source.id, result.articles);
        source.method = result.method; source.feedUrl = feedUrl;
        source.strategyFailures = 0; source.status = "ok"; source.lastError = "";
        if (result.extractionProfile) { source.extractionProfile = result.extractionProfile; source.enabled = result.extractionProfile.refreshable !== false; }
        source.lastExtractionDiagnostics = result.extractionDiagnostics || null;
        source.lastSync = stamp; source.lastSuccessfulSync = stamp; await MMPDB.setSourceSync(source.id, stamp);
        source.lastArticleAt = Math.max(...result.articles.map(a => a.publishedAt));
        source.lastRediscoveryResult = `Réparée avec ${result.method.toUpperCase()} (${result.articles.length} article(s) exploitable(s)).`;
        return true;
      }
    }
    if (!remaining()) throw new Error("Délai maximal de redécouverte dépassé.");
    const candidate = { ...source, method: "html" };
    const current = await state();
    const result = await sourceTimeout(fetchSource(candidate, knownImages, cachedArticles, sourceCinemaPolicy(source,current)), remaining());
    if (!result.error && result.articles.length && result.extractionProfile?.refreshable !== false) {
      const wallCutoffs = await firstCollectionCutoffsFor(source, result.articles, current, cachedArticles, firstCollectionStartedAt);
      const persistenceDiagnostics = {};
      const rows = await sourceRowsToPersist(source.id, [...result.articles, ...(result.imageUpdates || [])], previousSuccessfulSync, firstCollectionStartedAt, wallCutoffs, persistenceDiagnostics);
      const knownSourceUrls = await MMPDB.sourceHistory(source.id, result.articles.map(row => row.canonicalUrl));
      await MMPDB.putMany(rows);
      await MMPDB.rememberSourceArticles(source.id, result.articles, { ...sourceHistoryMetadata(source, result.method, acquisitionMode), acquiredCanonicalUrls: rows.map(row => row.canonicalUrl) });
      source.lastAcquisitionDiagnostics = sourceAcquisitionDiagnostic({ attemptedAt: source.lastAttemptAt || stamp, finishedAt: Date.now(), outcome: "success", method: result.method, result, selectedRows: rows, knownSourceUrls: [...knownSourceUrls], persistenceDiagnostics, storageCompleted: true, stage: "redécouverte et mémorisation" });
      await clearOrphanedReadingStates(await MMPDB.reconcileSourceArticles(source.id, result.articles), source.id, result.articles);
      source.method = "html"; source.feedUrl = "";
      source.strategyFailures = 0; source.status = "ok"; source.lastError = "";
      source.extractionProfile = result.extractionProfile || null;
      if (result.extractionProfile) source.enabled = result.extractionProfile.refreshable !== false;
      source.lastExtractionDiagnostics = result.extractionDiagnostics || null;
      source.lastSync = stamp; source.lastSuccessfulSync = stamp; await MMPDB.setSourceSync(source.id, stamp);
      source.lastArticleAt = Math.max(...result.articles.map(a => a.publishedAt));
      source.lastRediscoveryResult = `Réparée avec HTML (${result.articles.length} article(s) exploitable(s)).`;
      return true;
    }
    source.lastRediscoveryResult = "Aucune méthode candidate n’a extrait d’article exploitable.";
  } catch (error) {
    source.lastRediscoveryResult = checkingHomepage
      ? `Page principale inaccessible : ${error.message}` : `Redécouverte échouée : ${error.message}`;
  }
  return false;
}
async function refreshAll(wallId = "", acquisitionMode = "Automatique") {
  if (refreshInFlight) {
    if (refreshQueued) { refreshQueued.wallId = wallId; refreshQueued.acquisitionMode = acquisitionMode; return refreshQueued.promise; }
    const queued = { wallId, acquisitionMode, promise: null };
    queued.promise = (async () => {
      await refreshInFlight.catch(() => {});
      const nextWallId = queued.wallId;
      const nextMode = queued.acquisitionMode;
      if (refreshQueued === queued) refreshQueued = null;
      return refreshAll(nextWallId, nextMode);
    })();
    refreshQueued = queued;
    return queued.promise;
  }
  const startedAt = Date.now();
  await browser.storage.local.set({ refreshStatus: { startedAt, completedAt: 0 } });
  refreshInFlight = (async () => {
    try { return await refreshAllImpl(wallId, acquisitionMode); }
    finally {
      const stored = await browser.storage.local.get({ refreshStatus: {} });
      await browser.storage.local.set({ refreshStatus: { ...(stored.refreshStatus || {}), startedAt, completedAt: Date.now() } });
    }
  })();
  try { return await refreshInFlight; } finally { refreshInFlight = null; }
}
async function refreshIfStale() {
  const stored = await browser.storage.local.get({ refreshStatus: {} });
  const status = stored.refreshStatus || {};
  const interval = await refreshInterval();
  if (Date.now() - (Number(status.startedAt) || 0) < interval * 60000 && !status.completedAt) return null;
  if (Date.now() - (Number(status.completedAt) || 0) < interval * 60000) return null;
  return refreshAll();
}
function crowdBunkerVideos(payload, keyword) {
  return (payload?.hits || []).map(hit => hit?.document || {}).filter(item => item.uid && item.title && MMP.matchTerm(item.title, keyword)).map(item => ({
    id: String(item.uid), title: String(item.title).trim(), canonicalUrl: `https://crowdbunker.com/v/${encodeURIComponent(item.uid)}`,
    summary: String(item.longSummary || item.shortSummary || "").trim(), channelName: String(item.channelName || "CrowdBunker"),
    image: MMP.cleanUrl(item.thumbnailUrl || "", "https://crowdbunker.com/"), publishedAt: Number(item.publishedAtTimestamp) * 1000 || 0
  }));
}
async function rumbleSearchPage(tabId, url, signal) {
  await browser.tabs.update(tabId, { url });
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline && !signal.aborted) {
    const tab = await browser.tabs.get(tabId);
    if (tab.status === "complete" && MMP.cleanUrl(tab.url) === MMP.cleanUrl(url)) break;
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  const tab = await browser.tabs.get(tabId);
  if (signal.aborted) throw new Error("La recherche Rumble a été interrompue.");
  if (tab.status !== "complete" || MMP.cleanUrl(tab.url) !== MMP.cleanUrl(url)) throw new Error("La recherche Rumble n’a pas fini de charger.");
  const [injection] = await browser.scripting.executeScript({ target: { tabId }, func: () => {
    const listings = [...document.querySelectorAll("li.video-listing-entry")];
    const cards = listings.length ? listings : [...document.querySelectorAll(".video-item")];
    const videos = cards.map(card => {
      const link = card.querySelector("a.video-item--a[href*='/v'], a[href*='/v']");
      if (!link) return null;
      const title = link.getAttribute("title") || card.querySelector(".video-item--title, h3")?.textContent || link.textContent;
      const time = card.querySelector("time[datetime]");
      const image = card.querySelector("img");
      const channel = [...card.querySelectorAll("a[href]")].find(anchor => !anchor.href.includes("/v") && /channel|user/i.test(anchor.href));
      return { href: link.href, title: title.trim(), publishedAt: time?.dateTime || "", image: image?.currentSrc || image?.dataset?.src || image?.src || "", channelName: channel?.textContent?.trim() || "Rumble" };
    }).filter(Boolean);
    const next = [...document.querySelectorAll("a[href]")].find(anchor => anchor.rel === "next" || /^(next|suivant|›|»)/i.test(anchor.textContent.trim()));
    const challenge = cards.length === 0 && /just a moment|checking your browser|verify you are human|security check|captcha|robot/i.test(`${document.title} ${document.body?.innerText?.slice(0,1200) || ""}`);
    return { videos, cardCount: cards.length, challenge, next: next?.href || "" };
  } });
  const result = injection?.result;
  if (!result || !Array.isArray(result.videos)) throw new Error("Firefox n’a pas renvoyé les résultats extraits de Rumble.");
  if (result.challenge) throw new Error("Rumble a renvoyé une vérification anti-robot au lieu des résultats.");
  return result;
}
async function fetchRumbleSearch(keyword, signal) {
  if (!browser.tabs?.create || !browser.tabs?.hide || !browser.permissions?.contains || !await browser.permissions.contains({ permissions: ["tabHide"] })) {
    throw new Error("La recherche Rumble automatique nécessite le masquage d’onglet, indisponible dans cette version de Firefox. Consultez Rumble directement.");
  }
  const tab = await browser.tabs.create({ url: "about:blank", active: false });
  try {
    const hiddenTabs = await browser.tabs.hide(tab.id);
    if (!hiddenTabs.includes(tab.id)) throw new Error("Firefox n’a pas pu masquer l’onglet de recherche Rumble.");
    const url = new URL("https://rumble.com/search/video"); url.searchParams.set("q", keyword); url.searchParams.set("sort", "date"); url.searchParams.set("hl", "fr"); url.searchParams.set("gl", "FR");
    const videos = [], seenPages = new Set(); let next = url.href, pages = 0, cards = 0;
    for (let page = 0; next && page < 5 && !signal.aborted; page++) {
      const current = new URL(next); current.hash = "";
      if (seenPages.has(current.href)) break;
      seenPages.add(current.href);
      const result = await rumbleSearchPage(tab.id, current.href, signal);
      videos.push(...result.videos);
      pages++; cards += result.cardCount;
      next = result.next;
    }
    return { videos, pages, cards };
  } finally { await browser.tabs.remove(tab.id).catch(() => {}); }
}
async function rumbleEmbedUrl(value) {
  let videoUrl;
  try { videoUrl = new URL(value); } catch { throw new Error("L’adresse de la vidéo Rumble est invalide."); }
  if (!/(^|\.)rumble\.com$/i.test(videoUrl.hostname) || !/^\/v[A-Za-z0-9]+(?:-[^/]*)?\.html$/i.test(videoUrl.pathname)) throw new Error("Cette adresse n’est pas une vidéo Rumble prise en charge.");
  videoUrl.search = ""; videoUrl.hash = "";
  const endpoint = new URL("https://rumble.com/api/Media/oembed.json"); endpoint.searchParams.set("url", videoUrl.href);
  const response = await fetch(endpoint.href, { credentials: "omit", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Rumble a répondu HTTP ${response.status} en préparant le lecteur.`);
  const metadata = await response.json(), iframe = String(metadata.html || "").match(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/i);
  if (!iframe) throw new Error("Rumble n’a pas fourni l’adresse de son lecteur intégré.");
  let embed;
  try { embed = new URL(iframe[1].replaceAll("&amp;", "&"), "https://rumble.com/"); } catch { throw new Error("L’adresse du lecteur Rumble est invalide."); }
  if (!/(^|\.)rumble\.com$/i.test(embed.hostname) || !/^\/embed\/[A-Za-z0-9.]+\/?$/i.test(embed.pathname)) throw new Error("Rumble a fourni une adresse de lecteur non prise en charge.");
  return embed.href;
}
async function refreshYouTubeKeywords(acquisitionMode = "Automatique") {
  if (!await hasSearchTermsConsent()) return { keywordCount: 0, successCount: 0, resultCount: 0, addedCount: 0, errors: [], skippedReason: "search-consent-missing" };
  const current = await state();
  const keywords = MMPY.keywordsFromWalls(current.walls, current.settings);
  const providers = { ...(current.videoProviders || { youtube: true, peertube: true }) };
  if (providers.crowdbunker && !await browser.permissions.contains({ origins: ["https://api.crowdbunker.com/*"] })) providers.crowdbunker = false;
  if (providers.rumble && !await browser.permissions.contains({ origins: ["https://rumble.com/*"] })) providers.rumble = false;
  const stored = await browser.storage.local.get({ autoVideoState: null, youtubeSearchState: null, autoVideoMigrationVersion: 0 });
  const youtubeSearchState = stored.autoVideoState || (stored.youtubeSearchState ? { ...stored.youtubeSearchState, seen: Object.fromEntries(Object.entries(stored.youtubeSearchState.seen || {}).map(([id,item]) => [`youtube:${id}`,item])) } : null);
  const now = Date.now();
  if (!keywords.length) return { keywordCount: 0, successCount: 0, resultCount: 0, addedCount: 0, errors: [], initialized: false };
  const controller = new AbortController(); videoRefreshController = controller;
  const searchState = youtubeSearchState || { seen: {} };
  searchState.seen ||= {};
  if (Number(stored.autoVideoMigrationVersion) < 1) {
    searchState.referenceAt = Date.parse(VIDEO_REFERENCE_ISO);
    searchState.referenceIso = VIDEO_REFERENCE_ISO;
    searchState.seen ||= {};
    await browser.storage.local.set({ autoVideoState: searchState, autoVideoMigrationVersion: 1 });
  } else if (!Number.isFinite(searchState.referenceAt)) { searchState.referenceAt = Date.parse(VIDEO_REFERENCE_ISO); searchState.referenceIso = VIDEO_REFERENCE_ISO; }
  searchState.initializedAt = Number(searchState.initializedAt) || searchState.referenceAt;
  let changed = Number(stored.autoVideoMigrationVersion) < 1 || !stored.autoVideoState;
  let successCount = 0, resultCount = 0, addedCount = 0;
  const errors = [];
  const allQueries = keywords.length * (Number(!!providers.youtube) + Number(!!providers.peertube) + Number(!!providers.crowdbunker) + Number(!!providers.rumble));
  const diagnostics = { youtube: { searches: 0, requests: [], results: 0, titleRejected: 0, olderDateRejected: 0, unknownDateRejected: 0, duplicate: 0, stored: 0, errors: [] }, peertube: { searches: 0, requests: [], results: 0, titleRejected: 0, languageRejected: 0, invalidRejected: 0, duplicate: 0, stored: 0, errors: [] }, crowdbunker: { searches: 0, requests: [], results: 0, titleRejected: 0, duplicate: 0, stored: 0, errors: [] }, rumble: { searches: 0, requests: [], pages: 0, cards: 0, results: 0, titleRejected: 0, olderDateRejected: 0, unknownDateRejected: 0, duplicate: 0, stored: 0, errors: [] } };
  for (const keyword of keywords) {
    if (controller.signal.aborted) break;
    if (providers.youtube) {
      // Ask for French results and upload-date ordering where YouTube honors it.
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=CAI%3D&hl=fr&gl=FR`;
      diagnostics.youtube.searches++;
      try {
        const response = await fetch(url, { credentials: "omit", redirect: "follow", headers: { Accept: "text/html" }, signal: AbortSignal.any([controller.signal,AbortSignal.timeout(18000)]) });
        const requestInfo = { url: response.url || url, status: response.status, contentType: response.headers.get("content-type") || "", bytes: 0, extracted: 0, matched: 0, titleRejected: 0, olderDateRejected: 0, unknownDateRejected: 0 };
        diagnostics.youtube.requests.push(requestInfo);
        if (!response.ok) throw new Error(`YouTube a répondu HTTP ${response.status}.`);
        const parseStats = { received: 0, titleRejected: 0 };
        const html = await response.text();
        requestInfo.bytes = html.length;
        requestInfo.format = html.includes("ytInitialData") ? "ytInitialData" : "inconnu";
        const videos = MMPY.parseSearch(html, keyword, now, parseStats);
        requestInfo.extracted = parseStats.received;
        requestInfo.matched = videos.length;
        requestInfo.titleRejected = parseStats.titleRejected;
        diagnostics.youtube.results += parseStats.received;
        diagnostics.youtube.titleRejected += parseStats.titleRejected;
        const fresh = videos.filter(video => video.publishedAt > searchState.referenceAt);
        requestInfo.olderDateRejected = videos.filter(video => video.publishedAt > 0 && video.publishedAt <= searchState.referenceAt).length;
        requestInfo.unknownDateRejected = videos.filter(video => !Number.isFinite(video.publishedAt) || video.publishedAt <= 0).length;
        diagnostics.youtube.olderDateRejected += requestInfo.olderDateRejected;
        diagnostics.youtube.unknownDateRejected += requestInfo.unknownDateRejected;
        resultCount += videos.length;
        for (const video of videos) {
          if (!video.summary) continue;
          const canonicalUrl = `https://www.youtube.com/watch?v=${video.id}`;
          const existing = await MMPDB.get(MMP.stableId(canonicalUrl));
          if (existing && video.summary.length > (existing.summary || "").length) await MMPDB.putMany([{ ...existing, summary: video.summary }]);
        }
        const previous = JSON.parse(JSON.stringify(searchState));
        const tracked = MMPY.trackResults(previous, fresh.map(v => ({...v,id:`youtube:${v.id}`})), keyword, now, true);
        diagnostics.youtube.duplicate += tracked.duplicate;
        if (tracked.articles.length) {
          const rows = tracked.articles.map(video => { const videoId = video.id.slice("youtube:".length), canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`; return { id: MMP.stableId(canonicalUrl), sourceId: YOUTUBE_SOURCE_ID, sourceIds: [YOUTUBE_SOURCE_ID], canonicalUrl, title: video.title, summary: video.summary || "", image: video.image, categories: [], publishedAt: video.publishedAt, discoveredAt: now, fetchedAt: now, videoChannelName: video.channelName, youtubeChannelName: video.channelName, youtubeChannelId: video.channelId, youtubeKeyword: video.youtubeKeyword, youtubePublishedLabel: video.publishedLabel, youtubeLive: video.live, videoPlatform: "YouTube" }; });
          const alreadyStored = new Set((await MMPDB.all()).map(a => a.canonicalUrl));
          const newRows = rows.filter(row => !alreadyStored.has(row.canonicalUrl));
          await Promise.all(newRows.map(async row => {
            try {
              const details = await fetchYouTubeVideoDetails(new URL(row.canonicalUrl).searchParams.get("v"));
              if (details.description) Object.assign(row, { summary: MMP.decodeHtmlEntities(details.description), videoChannelName: details.channelName || row.videoChannelName, videoDetails: details, videoDetailsVersion: 2 });
            } catch (error) { console.warn(`Description YouTube indisponible pour « ${row.title} » : ${error.message}`); }
          }));
          if (newRows.length) await MMPDB.putMany(newRows);
          await recordAutomaticHistory(YOUTUBE_SOURCE_ID, rows, automaticHistoryMetadata(YOUTUBE_SOURCE_ID, ["auto-youtube"], acquisitionMode));
          addedCount += newRows.length; diagnostics.youtube.stored += newRows.length; diagnostics.youtube.duplicate += rows.length - newRows.length;
        }
        Object.assign(searchState, tracked.state);
        successCount++;
        changed ||= tracked.changed;
      } catch (error) { errors.push(`${keyword} : ${error.message}`); diagnostics.youtube.errors.push(`${keyword} : ${error.message}`); console.warn(`Recherche YouTube « ${keyword} » : ${error.message}`); }
    }
    if (controller.signal.aborted) break;
    if (providers.peertube) {
      diagnostics.peertube.searches++;
      try {
        const historyRows = [];
        const url = new URL("https://search.joinpeertube.org/api/v1/search/videos");
        url.searchParams.set("search", keyword); url.searchParams.set("startDate", new Date(searchState.referenceAt).toISOString()); url.searchParams.set("sort", "-publishedAt"); url.searchParams.set("count", "100"); url.searchParams.set("languageOneOf", "fr");
        const response = await fetch(url.href, { credentials: "omit", headers: { Accept: "application/json" }, signal: AbortSignal.any([controller.signal,AbortSignal.timeout(18000)]) });
        diagnostics.peertube.requests.push({ url: response.url || url.href, status: response.status, contentType: response.headers.get("content-type") || "" });
        if (!response.ok) throw new Error(`L’index PeerTube a répondu HTTP ${response.status}.`);
        const parseStats = { received: 0, titleRejected: 0, languageRejected: 0, invalidRejected: 0 };
        const videos = MMPY.parsePeerTubeSearch(await response.json(), keyword, parseStats);
        diagnostics.peertube.results += parseStats.received;
        diagnostics.peertube.titleRejected += parseStats.titleRejected;
        diagnostics.peertube.languageRejected += parseStats.languageRejected;
        diagnostics.peertube.invalidRejected += parseStats.invalidRejected;
        resultCount += videos.length;
        for (const video of videos) {
          const key = `peertube:${video.id}`;
          if (searchState.seen[key]) { searchState.seen[key].lastSeenAt = now; diagnostics.peertube.duplicate++; continue; }
          const row = { id: MMP.stableId(video.canonicalUrl), sourceId: PEERTUBE_SOURCE_ID, sourceIds: [PEERTUBE_SOURCE_ID], canonicalUrl: video.canonicalUrl, title: video.title, summary: video.summary, image: video.image, categories: [], publishedAt: video.publishedAt, discoveredAt: now, fetchedAt: now, videoChannelName: video.channelName, youtubeKeyword: keyword, youtubePublishedLabel: video.publishedLabel, videoPlatform: "PeerTube" };
          historyRows.push(row);
          const already = (await MMPDB.get(row.id));
          if (!already) { await MMPDB.putMany([row]); addedCount++; diagnostics.peertube.stored++; }
          else { if (video.summary.length > (already.summary || "").length) await MMPDB.putMany([row]); diagnostics.peertube.duplicate++; }
          searchState.seen[key] = { firstSeenAt: now, lastSeenAt: now, publishedAt: video.publishedAt };
          changed = true;
        }
          await recordAutomaticHistory(PEERTUBE_SOURCE_ID, historyRows, automaticHistoryMetadata(PEERTUBE_SOURCE_ID, ["auto-youtube"], acquisitionMode));
        successCount++;
      } catch (error) { errors.push(`${keyword} (PeerTube) : ${error.message}`); diagnostics.peertube.errors.push(`${keyword} : ${error.message}`); console.warn(`Recherche PeerTube « ${keyword} » : ${error.message}`); }
    }
    if (controller.signal.aborted) break;
    if (providers.crowdbunker) {
      diagnostics.crowdbunker.searches++;
      try {
        const historyRows = [];
        let page = 1, found = Infinity, pages = 0, videos = [];
        while (page <= Math.min(10, Math.ceil(found / 15)) && !controller.signal.aborted) {
          const url = new URL("https://api.crowdbunker.com/search/posts");
          url.searchParams.set("q", keyword); url.searchParams.set("page", String(page)); url.searchParams.set("perPage", "15"); url.searchParams.set("mediaType", "video");
          url.searchParams.set("publishedAfter", String(Math.floor(searchState.referenceAt / 1000)));
          const response = await fetch(url.href, { credentials: "omit", headers: { Accept: "application/json" }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(18000)]) });
          diagnostics.crowdbunker.requests.push({ url: response.url || url.href, status: response.status, contentType: response.headers.get("content-type") || "" });
          if (!response.ok) throw new Error(`CrowdBunker a répondu HTTP ${response.status}.`);
          const payload = await response.json(); found = Number(payload.found) || 0; pages++;
          const parsed = crowdBunkerVideos(payload, keyword);
          diagnostics.crowdbunker.results += (payload.hits || []).length;
          diagnostics.crowdbunker.titleRejected += (payload.hits || []).length - parsed.length;
          videos.push(...parsed); page++;
        }
        videos = [...new Map(videos.map(video => [video.id, video])).values()].sort((a,b) => b.publishedAt - a.publishedAt);
        resultCount += videos.length;
        for (const video of videos) {
          if (!video.publishedAt || video.publishedAt <= searchState.referenceAt) continue;
          const key = `crowdbunker:${video.id}`;
          if (searchState.seen[key]) { searchState.seen[key].lastSeenAt = now; diagnostics.crowdbunker.duplicate++; continue; }
          const row = { id: MMP.stableId(video.canonicalUrl), sourceId: CROWDBUNKER_SOURCE_ID, sourceIds: [CROWDBUNKER_SOURCE_ID], canonicalUrl: video.canonicalUrl, title: video.title, summary: video.summary, image: video.image, categories: [], publishedAt: video.publishedAt, discoveredAt: now, fetchedAt: now, videoChannelName: video.channelName, youtubeKeyword: keyword, videoPlatform: "CrowdBunker" };
          historyRows.push(row);
          const old = await MMPDB.get(row.id);
          if (!old) { await MMPDB.putMany([row]); addedCount++; diagnostics.crowdbunker.stored++; }
          else diagnostics.crowdbunker.duplicate++;
          searchState.seen[key] = { firstSeenAt: now, lastSeenAt: now, publishedAt: video.publishedAt }; changed = true;
        }
        await recordAutomaticHistory(CROWDBUNKER_SOURCE_ID, historyRows, automaticHistoryMetadata(CROWDBUNKER_SOURCE_ID, ["auto-youtube"], acquisitionMode));
        diagnostics.crowdbunker.pages = (diagnostics.crowdbunker.pages || 0) + pages;
        successCount++;
      } catch (error) { errors.push(`${keyword} (CrowdBunker) : ${error.message}`); diagnostics.crowdbunker.errors.push(`${keyword} : ${error.message}`); console.warn(`Recherche CrowdBunker « ${keyword} » : ${error.message}`); }
    }
    if (controller.signal.aborted) break;
    if (providers.rumble) {
      diagnostics.rumble.searches++;
      try {
        const historyRows = [];
        const search = await fetchRumbleSearch(keyword, controller.signal), extracted = search.videos;
        diagnostics.rumble.pages += search.pages; diagnostics.rumble.cards += search.cards;
        const videos = [...new Map(extracted.map(video => {
          let url; try { url = new URL(video.href); } catch { return ["", null]; }
          if (!/(^|\.)rumble\.com$/i.test(url.hostname) || !/^\/v[A-Za-z0-9]+(?:-[^/]*)?\.html$/i.test(url.pathname)) return ["", null];
          url.search = ""; url.hash = "";
          const publishedAt = Date.parse(video.publishedAt || "");
          return [url.href, { id: url.pathname.match(/^\/v([A-Za-z0-9]+)/)?.[1] || url.href, canonicalUrl: url.href, title: String(video.title || "").trim(), summary: "", channelName: String(video.channelName || "Rumble"), image: MMP.cleanUrl(video.image || "", url.href), publishedAt: Number.isFinite(publishedAt) ? publishedAt : 0 }];
        }).filter(([key, video]) => key && video)).values()].filter(video => video?.title);
        diagnostics.rumble.results += extracted.length;
        const matched = videos.filter(video => MMP.matchTerm(video.title, keyword));
        diagnostics.rumble.titleRejected += videos.length - matched.length;
        matched.sort((a,b) => b.publishedAt - a.publishedAt); resultCount += matched.length;
        for (const video of matched) {
          if (!video.publishedAt) { diagnostics.rumble.unknownDateRejected++; continue; }
          if (video.publishedAt <= searchState.referenceAt) { diagnostics.rumble.olderDateRejected++; continue; }
          const key = `rumble:${video.id}`;
          if (searchState.seen[key]) { searchState.seen[key].lastSeenAt = now; diagnostics.rumble.duplicate++; continue; }
          const row = { id: MMP.stableId(video.canonicalUrl), sourceId: RUMBLE_SOURCE_ID, sourceIds: [RUMBLE_SOURCE_ID], canonicalUrl: video.canonicalUrl, title: video.title, summary: video.summary, image: video.image, categories: [], publishedAt: video.publishedAt, discoveredAt: now, fetchedAt: now, videoChannelName: video.channelName, youtubeKeyword: keyword, videoPlatform: "Rumble" };
          historyRows.push(row);
          const old = await MMPDB.get(row.id);
          if (!old) { await MMPDB.putMany([row]); addedCount++; diagnostics.rumble.stored++; }
          else diagnostics.rumble.duplicate++;
          searchState.seen[key] = { firstSeenAt: now, lastSeenAt: now, publishedAt: video.publishedAt }; changed = true;
        }
        await recordAutomaticHistory(RUMBLE_SOURCE_ID, historyRows, automaticHistoryMetadata(RUMBLE_SOURCE_ID, ["auto-youtube"], acquisitionMode));
        successCount++;
      } catch (error) { errors.push(`${keyword} (Rumble) : ${error.message}`); diagnostics.rumble.errors.push(`${keyword} : ${error.message}`); console.warn(`Recherche Rumble « ${keyword} » : ${error.message}`); }
    }
  }
  const allSuccessful = successCount === allQueries;
  if (changed || allSuccessful) await browser.storage.local.set({ autoVideoState: { ...searchState, lastSuccessfulAt: allSuccessful ? now : (searchState.lastSuccessfulAt || 0) }, autoVideoMigrationVersion: 1 });
  if (videoRefreshController === controller) videoRefreshController = null;
  console.info("Diagnostic de collecte du mur Vidéos auto", diagnostics);
  return { keywordCount: keywords.length, successCount, queryCount: allQueries, resultCount, addedCount, errors, diagnostics, initialized: false, referenceAt: searchState.referenceAt, lastSuccessfulAt: allSuccessful ? now : searchState.lastSuccessfulAt || 0 };
}
function blueskyTopics(current) {
  const level = { low: 1, medium: 2, high: 3 }, topics = new Map();
  // state() exposes the active wall's priorities as settings.priorities. An
  // empty array is still truthy, so using it as a fallback guard silently
  // skipped priorities saved on every other wall.
  const priorities = [
    ...(current.settings?.priorities || []),
    ...Object.values(current.wallSettings || {}).flatMap(config => config.priorities || [])
  ];
  for (const item of priorities) {
    const term = String(item?.term || "").trim(), key = MMP.normalizeText(term);
    if (!key) continue;
    const previous = topics.get(key);
    if (!previous || (level[item.level] || 2) > previous.priority) topics.set(key, { term, priority: level[item.level] || 2 });
  }
  return [...topics.values()].sort((a,b) => b.priority - a.priority || a.term.localeCompare(b.term, "fr"));
}
function blueskyExternalLink(post, record) {
  const embed=post.embed||{},features=(record.facets||[]).flatMap(facet=>facet.features||[]),textLinks=String(record.text||"").match(/https?:\/\/[^\s<>"']+/gi)||[],candidates=[embed.external?.uri,embed.recordWithMedia?.media?.external?.uri,...features.filter(feature=>feature.$type==="app.bsky.richtext.facet#link").map(feature=>feature.uri),...textLinks];
  for(const value of candidates){try{const url=new URL(String(value||"").replace(/[\])}>.,!?;:]+$/g,""));if(["https:","http:"].includes(url.protocol)&&!url.username&&!url.password)return url.href;}catch{}}
  return "";
}
function blueskyPostImage(post){const embed=post?.embed||{},media=embed.recordWithMedia?.media||embed.media||{},images=embed.images||media.images||[],image=images.find(item=>typeof item.thumb==="string")?.thumb||images.find(item=>typeof item.fullsize==="string")?.fullsize||embed.external?.thumb||media.external?.thumb||"";return typeof image==="string"?image:"";}
function blueskyHasAdultLabel(post){
  const adultLabels=new Set(["porn","sexual","sexual-cartoon","adult","adult-content","nsfw","explicit"]),labels=[];
  const collect=value=>{if(Array.isArray(value)){for(const item of value)collect(item);return;}if(!value||typeof value!=="object")return;if(typeof value.val==="string")labels.push({value:value.val.toLowerCase(),neg:value.neg===true});if(Array.isArray(value.values))collect(value.values);};
  collect(post?.labels);collect(post?.record?.labels);collect(post?.author?.labels);
  const active=new Set();for(const label of labels)if(adultLabels.has(label.value)){if(label.neg)active.delete(label.value);else active.add(label.value);}return active.size>0;
}
async function resolveStoredBlueskyLink(article){
  if(article?.blueskyLink||!article?.atUri)return article;
  const endpoints=["https://api.bsky.app/xrpc/app.bsky.feed.getPosts","https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts"];
  for(let index=0;index<endpoints.length;index++){
    try{const url=new URL(endpoints[index]);url.searchParams.append("uris",article.atUri);const response=await fetch(url.href,{credentials:"omit",headers:{Accept:"application/json","atproto-accept-labelers":"did:plc:ar7c4by46qjdydhdevvrndac"},signal:AbortSignal.timeout(12000)});if(response.status===403)continue;if(!response.ok)throw new Error(`Bluesky a répondu HTTP ${response.status}.`);const data=await response.json(),post=data.posts?.[0];if(!post)return article;const record=post.record||{},external=post.embed?.external||post.embed?.recordWithMedia?.media?.external||{},blueskyLink=blueskyExternalLink(post,record),image=blueskyPostImage(post),updated={...article,...(blueskyLink?{blueskyLink}:{}),...(external.title?{blueskyLinkTitle:external.title}:{}),...(external.description?{blueskyLinkDescription:external.description}:{}),...(external.thumb?{blueskyLinkImage:external.thumb}:{}),...(post.author?.avatar?{blueskyAvatar:post.author.avatar}:{}),...(Array.isArray(record.langs)?{blueskyLangs:record.langs.map(String)}:{}),...(image?{image,blueskyPostImage:image}:{}),blueskyAdult:blueskyHasAdultLabel(post)};if(blueskyLink||image||Array.isArray(record.langs)||updated.blueskyAdult!==article.blueskyAdult){await MMPDB.putMany([{...updated,sourceId:BLUESKY_SOURCE_ID}]);}return updated;}catch(error){if(index===0)continue;throw error;}
  }
  return article;
}
async function refreshBluesky(acquisitionMode = "Automatique") {
  if (!await hasSearchTermsConsent()) {
    const result = { enabled: false, topicCount: 0, successCount: 0, addedCount: 0, errors: [], disabledReason: "search-consent-missing" };
    await browser.storage.local.set({ blueskyCollectionDiagnostics: { at: Date.now(), ...result } });
    return result;
  }
  const current = await state(), topics = blueskyTopics(current);
  const automaticEnabled = current.automaticWalls.bluesky === true, providerEnabled = current.socialProviders.bluesky !== false;
  const diagnosticBase = { at: Date.now(), automaticEnabled, providerEnabled, imageRequired: current.blueskyRequireImage !== false, attempted: false };
  if (!automaticEnabled || !providerEnabled) {
    const result = { enabled: false, topicCount: topics.length, successCount: 0, addedCount: 0, errors: [], disabledReason: !automaticEnabled ? "automatic-wall-disabled" : "provider-disabled" };
    await browser.storage.local.set({ blueskyCollectionDiagnostics: { ...diagnosticBase, ...result } });
    return result;
  }
  if (!topics.length) {
    const result = { enabled: true, topicCount: 0, successCount: 0, addedCount: 0, errors: [], disabledReason: "no-priority-topics" };
    await browser.storage.local.set({ blueskyCollectionDiagnostics: { ...diagnosticBase, ...result } });
    return result;
  }
  const controller = new AbortController(); blueskyRefreshController = controller;
  const stored = await browser.storage.local.get({ blueskySearchState: { lastSuccessfulByTopic: {} }, blueskyCollectionDiagnostics: null });
  const sync = stored.blueskySearchState || { lastSuccessfulByTopic: {} };
  sync.lastSuccessfulByTopic ||= {}; sync.cursorByTopic ||= {};
  const errors = [], now = Date.now(), storedArticles = await MMPDB.all(), knownIds = new Set(storedArticles.map(article => article.id)); let successCount = 0, addedCount = 0;
  const diagnostics = { ...diagnosticBase, attempted: true, returned: 0, olderDateRejected: 0, adultRejected: 0, replyRejected: 0, languageRejected: 0, languageUnknownAccepted: 0, subjectRejected: 0, invalidUriRejected: 0, imageRejected: 0, stored: 0, duplicates: 0, topics: [] };
  for (const topic of topics) {
    if (controller.signal.aborted) break;
    const key = MMP.normalizeText(topic.term), legacyCursor = sync.cursorByTopic[key] || "";
    const previous = Number(sync.lastSuccessfulByTopic[key]) || (legacyCursor ? Number(stored.blueskyCollectionDiagnostics?.at) || now : now);
    const since = previous ? new Date(Math.max(0, previous - 5 * 60000)).toISOString() : undefined;
    // Always start at the newest page. Persisted cursors from older versions
    // could otherwise continue an unbounded first-collection backfill.
    let cursor = "";
    const topicDiagnostics = { term: topic.term, requests: [], returned: 0, olderDateRejected: 0, adultRejected: 0, replyRejected: 0, languageRejected: 0, languageUnknownAccepted: 0, subjectRejected: 0, invalidUriRejected: 0, imageRejected: 0, stored: 0, duplicates: 0, errors: [] };
    diagnostics.topics.push(topicDiagnostics);
    try {
      // Keep each run bounded to three newest pages; the overlap protects
      // against inclusive server cutoffs and the strict timestamp check filters it.
      for (let page = 0; page < 3; page++) {
        const candidates=["https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts","https://api.bsky.app/xrpc/app.bsky.feed.searchPosts"];
        let response,url;
        for(const endpoint of candidates){url=new URL(endpoint);url.searchParams.set("q",topic.term);url.searchParams.set("sort","latest");url.searchParams.set("limit","100");if(since)url.searchParams.set("since",since);if(cursor)url.searchParams.set("cursor",cursor);response=await fetch(url.href,{credentials:"omit",headers:{Accept:"application/json","atproto-accept-labelers":"did:plc:ar7c4by46qjdydhdevvrndac"},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(18000)])});if(response.status!==403)break;}
        if (!response.ok) { const error = new Error(`Bluesky a répondu HTTP ${response.status}.`); error.status = response.status; throw error; }
        const data = await response.json(), posts = Array.isArray(data.posts) ? data.posts : [];
        topicDiagnostics.requests.push({ url: url.href, status: response.status, returned: posts.length });
        topicDiagnostics.returned += posts.length; diagnostics.returned += posts.length;
        const rows = [];
        for (const post of posts) {
          const record = post.record || {}, text = String(record.text || "").trim(), uri = String(post.uri || "");
          const publishedAt = Date.parse(record.createdAt || post.indexedAt) || 0;
          if (previous && (!publishedAt || publishedAt <= previous)) { topicDiagnostics.olderDateRejected++; diagnostics.olderDateRejected++; continue; }
          const adult=blueskyHasAdultLabel(post);
          if(adult){topicDiagnostics.adultRejected++;diagnostics.adultRejected++;const id=MMP.stableId(uri);if(knownIds.has(id))rows.push({id,sourceId:BLUESKY_SOURCE_ID,atUri:uri,blueskyAdult:true});continue;}
          if (record.reply) { topicDiagnostics.replyRejected++;diagnostics.replyRejected++;continue; }
          const matchText = text;
          const languages = Array.isArray(record.langs) ? record.langs : [];
          // `langs` is optional in the Bluesky post record. Reject records
          // that explicitly declare only non-French languages, but don't
          // discard French keyword matches merely because the client omitted it.
          if (current.blueskyFrenchOnly && languages.length && !languages.some(language => /^fr(?:-|$)/i.test(String(language)))) { topicDiagnostics.languageRejected++;diagnostics.languageRejected++;continue; }
          if (!languages.length) { topicDiagnostics.languageUnknownAccepted++;diagnostics.languageUnknownAccepted++; }
          if (!uri.startsWith("at://")) { topicDiagnostics.invalidUriRejected++;diagnostics.invalidUriRejected++;continue; }
          if (!text || !MMP.matchTerm(matchText, topic.term)) { topicDiagnostics.subjectRejected++;diagnostics.subjectRejected++;continue; }
          const [, did, collection, rkey] = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/) || [];
          if (!did || collection !== "app.bsky.feed.post" || !rkey) { topicDiagnostics.invalidUriRejected++;diagnostics.invalidUriRejected++;continue; }
          const handle = post.author?.handle || did;
          const canonicalUrl = `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${encodeURIComponent(rkey)}`;
          const image=blueskyPostImage(post);
          if (!image && current.blueskyRequireImage) { topicDiagnostics.imageRejected++;diagnostics.imageRejected++;continue; }
          const blueskyLink=blueskyExternalLink(post,record);
          rows.push({ id: MMP.stableId(uri), sourceId: BLUESKY_SOURCE_ID, sourceIds: [BLUESKY_SOURCE_ID], atUri: uri, blueskyAdult:false, canonicalUrl, blueskyLangs: languages.map(String),
            title: text.slice(0, 180), summary: text, image, blueskyPostImage:image, blueskyAvatar:post.author?.avatar||"", blueskyLinkImage:(post.embed?.external||post.embed?.recordWithMedia?.media?.external)?.thumb||"", blueskyLinkDescription:(post.embed?.external||post.embed?.recordWithMedia?.media?.external)?.description||"", categories: [], publishedAt: publishedAt || now,
            discoveredAt: now, fetchedAt: now, blueskyAuthor: post.author?.displayName || handle, blueskyHandle: handle,
            videoChannelName: post.author?.displayName || handle, blueskyTopics: [topic.term], blueskyLink, blueskyLinkTitle: post.embed?.external?.title || "", videoPlatform: "Bluesky" });
        }
        if (rows.length) { for (const row of rows) if (!knownIds.has(row.id)) { knownIds.add(row.id); addedCount++; topicDiagnostics.stored++; diagnostics.stored++; } else { topicDiagnostics.duplicates++; diagnostics.duplicates++; } await MMPDB.putMany(rows); await recordAutomaticHistory(BLUESKY_SOURCE_ID, rows, automaticHistoryMetadata(BLUESKY_SOURCE_ID, ["auto-bluesky"], acquisitionMode)); await saveAutomaticSocialSnapshots(rows); }
        if (!data.cursor || data.cursor === cursor) break;
        cursor = data.cursor;
      }
      sync.lastSuccessfulByTopic[key] = now;
      delete sync.cursorByTopic[key];
      successCount++;
    } catch (error) { errors.push(`${topic.term} : ${error.message}`); topicDiagnostics.errors.push(error.message); console.warn(`Recherche Bluesky « ${topic.term} » : ${error.message}`); }
  }
  if (successCount) await browser.storage.local.set({ blueskySearchState: sync });
  if (blueskyRefreshController === controller) blueskyRefreshController = null;
  const result = { enabled: true, topicCount: topics.length, successCount, addedCount, errors, diagnostics };
  console.info("Diagnostic de collecte du mur Bluesky", diagnostics);
  await browser.storage.local.set({ blueskyCollectionDiagnostics: { ...diagnostics, ...result } });
  return result;
}
function linkedinTopics(current) {
  return MMPY.keywordsFromWalls(current.walls, current.settings)
    .map(term => String(term || "").trim()).filter(Boolean)
    .filter((term, index, values) => values.findIndex(value => MMP.normalizeText(value) === MMP.normalizeText(term)) === index);
}
async function refreshLinkedInNews(acquisitionMode = "Automatique") {
  const current = await state(), allTopics = linkedinTopics(current), topics = allTopics.slice(0, 8);
  const automaticEnabled = current.automaticWalls.bluesky === true, providerEnabled = current.socialProviders.linkedin === true;
  const base = { at: Date.now(), automaticEnabled, providerEnabled, imageRequired: false, queryWindow: "7d", attempted: false };
  const finish = async result => { const detailed = { ...base, ...result }; await browser.storage.local.set({ linkedinCollectionDiagnostics: detailed }); return detailed; };
  if (!automaticEnabled || !providerEnabled) return finish({ enabled: false, topicCount: topics.length, queryCount: 0, resultCount: 0, stored: 0, duplicates: 0, imageRejected: 0, errors: [], disabledReason: !automaticEnabled ? "automatic-wall-disabled" : "provider-disabled" });
  if (!await hasSearchTermsConsent()) return finish({ enabled: false, topicCount: topics.length, queryCount: 0, resultCount: 0, stored: 0, duplicates: 0, imageRejected: 0, errors: [], disabledReason: "search-consent-missing" });
  if (!topics.length) return finish({ enabled: true, topicCount: 0, queryCount: 0, resultCount: 0, stored: 0, duplicates: 0, imageRejected: 0, errors: [], disabledReason: "no-priority-topics" });
  linkedinRefreshController?.abort();
  const controller = new AbortController(); linkedinRefreshController = controller;
  const stored = await browser.storage.local.get({ linkedinSearchState: { lastSuccessfulByTopic: {} }, linkedinCollectionDiagnostics: null });
  const sync = stored.linkedinSearchState || { lastSuccessfulByTopic: {} };
  sync.lastSuccessfulByTopic ||= {};
  const legacyDiagnostics = stored.linkedinCollectionDiagnostics || {};
  const legacyPrevious = Number(legacyDiagnostics.successCount || legacyDiagnostics.queryCount) > 0 ? Number(legacyDiagnostics.at) || 0 : 0;
  const now = Date.now(), storedArticles = await MMPDB.all(), rowsById = new Map(storedArticles.map(article => [article.id, article]));
  const rowsByDedupe = new Map([...rowsById.values()].filter(article => (article.sourceIds || [article.sourceId]).includes(LINKEDIN_SOURCE_ID) && article.linkedinDedupeKey).map(article => [article.linkedinDedupeKey, article]));
  const result = { enabled: true, topicCount: allTopics.length, queryCount: 0, resultCount: 0, titleRejected: 0, olderDateRejected: 0, undatedDateRejected: 0, stored: 0, duplicates: 0, imageRejected: 0, queriesLimited: allTopics.length > 8, errors: [], queries: [] };
  let successfulTopics = 0;
  for (const keyword of topics) {
    if (controller.signal.aborted) break;
    try {
      const topicKey = MMP.normalizeText(keyword), previous = Number(sync.lastSuccessfulByTopic[topicKey]) || legacyPrevious || now;
      const url = MMPL.queryUrl(keyword), response = await fetch(url, { credentials: "omit", headers: { Accept: "application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      if (!response.ok) throw new Error(`Google Actualités a répondu HTTP ${response.status}.`);
      const xml = await response.text();
      if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml)) throw new Error("Google Actualités n’a pas renvoyé un flux RSS valide.");
      const items = MMPL.parseGoogleNewsRss(xml, keyword);
      result.queryCount++; result.resultCount += items.length;
      result.queries.push({ keyword, status: response.status, received: items.length });
      const additions = [];
      for (const item of items) {
        // Google News can return loose matches for short acronyms. RSS does
        // not expose the post body, so only attribute/store a hit when the
        // visible result title contains the complete priority term.
        if (!MMP.matchTerm(item.title, keyword)) { result.titleRejected++; continue; }
        if (previous && !item.googleNewsDate) { result.undatedDateRejected++; continue; }
        if (previous && item.googleNewsDate <= previous) { result.olderDateRejected++; continue; }
        const cutoff = now - 8 * 86400000;
        if (item.googleNewsDate && item.googleNewsDate < cutoff) continue;
        const dedupeKey = `${MMP.normalizeText(item.title)}|${item.googleNewsDate || item.canonicalUrl}`;
        const existing = rowsByDedupe.get(dedupeKey);
        if (existing) {
          existing.linkedinKeywords = [...new Set([...(existing.linkedinKeywords || []), keyword])];
          additions.push({ ...existing, sourceId: LINKEDIN_SOURCE_ID, linkedinKeywords: existing.linkedinKeywords });
          result.duplicates++;
          continue;
        }
        const id = MMP.stableId(item.googleNewsGuid || item.canonicalUrl);
        const row = {
          id, sourceId: LINKEDIN_SOURCE_ID, sourceIds: [LINKEDIN_SOURCE_ID],
          canonicalUrl: item.canonicalUrl, title: item.title, summary: item.summary || "", image: item.image || "", categories: [],
          publishedAt: item.googleNewsDate, dateIsFallback: !item.googleNewsDate,
          discoveredAt: now, fetchedAt: now, videoPlatform: "LinkedIn",
          linkedinPublisherUrl: item.linkedinPublisherUrl, linkedinPublisher: item.linkedinPublisher || "", linkedinAuthor: item.linkedinAuthor || "", googleNewsGuid: item.googleNewsGuid,
          googleNewsDate: item.googleNewsDate, linkedinDateLabelSource: "Google Actualités",
          linkedinKeywords: [keyword], linkedinDedupeKey: dedupeKey, linkedinContentPartial: true
        };
        const duplicateById = rowsById.get(id);
        if (duplicateById) {
          duplicateById.linkedinKeywords = [...new Set([...(duplicateById.linkedinKeywords || []), keyword])];
          additions.push({ ...duplicateById, sourceId: LINKEDIN_SOURCE_ID }); result.duplicates++;
        } else {
          additions.push(row); rowsById.set(id, row); rowsByDedupe.set(dedupeKey, row); result.stored++;
        }
      }
      if (additions.length) { await MMPDB.putMany(additions); await recordAutomaticHistory(LINKEDIN_SOURCE_ID, additions, automaticHistoryMetadata(LINKEDIN_SOURCE_ID, ["auto-bluesky"], acquisitionMode)); await saveAutomaticSocialSnapshots(additions); }
      sync.lastSuccessfulByTopic[topicKey] = now;
      successfulTopics++;
    } catch (error) {
      if (controller.signal.aborted) break;
      result.errors.push(`${keyword} : ${error.message}`);
    }
  }
  if (successfulTopics) await browser.storage.local.set({ linkedinSearchState: sync });
  if (linkedinRefreshController === controller) linkedinRefreshController = null;
  result.successCount = result.queryCount;
  result.attempted = true;
  return await finish(result);
}
function iaField(value) { return Array.isArray(value) ? value.map(item => String(item || "").trim()).filter(Boolean).join(", ") : String(value || "").trim(); }
function iaTimestamp(value) { const parsed = Date.parse(iaField(value)); return Number.isFinite(parsed) ? parsed : 0; }
function iaIsFrench(value) { const languages=(Array.isArray(value)?value:String(value||"").split(/[;,]/)).map(item=>String(item||"").trim().toLocaleLowerCase("fr")).filter(Boolean); return languages.length>0&&languages.every(language=>/^(?:fr|fre|fra|french|français|francais)(?:\s*\([^)]*\))?$/i.test(language)); }
async function refreshInternetArchive(wallId = "", acquisitionMode = "Automatique") {
  if (!await hasSearchTermsConsent()) {
    const result = { enabled: false, keywordCount: 0, attempted: false, searches: 0, results: 0, stored: 0, errors: [], skippedReason: "search-consent-missing" };
    await browser.storage.local.set({ internetArchiveCollectionDiagnostics: { at: Date.now(), ...result } });
    return result;
  }
  const current = await state(), selectedWalls = current.walls.filter(wall => !wallId || wall.id === wallId || wallId === "auto-documents");
  const queries = new Map();
  for (const item of current.settings?.priorities || Object.values(current.wallSettings || {}).flatMap(config => config.priorities || [])) {
    const keyword = (typeof item === "string" ? item : item?.term || "").trim(), key = MMP.normalizeText(keyword);
    if (!keyword || !key) continue;
    if (!queries.has(key)) queries.set(key, { keyword, walls: new Set() });
    for (const wall of selectedWalls) queries.get(key).walls.add(wall.id);
  }
  const result = { enabled: current.automaticWalls.internetArchive, automaticEnabled: current.automaticWalls.internetArchive, keywordCount: queries.size, keywords: [...queries.values()].map(item => item.keyword), attempted: false, searches: 0, results: 0, pdfChecked: 0, languageRejected: 0, titleRejected: 0, invalidResultRejected: 0, noPdfRejected: 0, unavailablePdfRejected: 0, cachedRejected: 0, stored: 0, duplicates: 0, queriesLimited: queries.size > 8, requests: [], errors: [] };
  if (!result.enabled || !queries.size) {
    if (!queries.size) result.skippedReason = "no-priority-keywords";
    await browser.storage.local.set({ internetArchiveCollectionDiagnostics: { at: Date.now(), ...result } });
    return result;
  }
  if (!await browser.permissions.contains({ origins: ["https://archive.org/*", "https://*.archive.org/*"] })) { result.errors.push("Autorisez archive.org et ses sous-domaines dans les permissions du module Firefox."); result.skippedReason = "permission-missing"; await browser.storage.local.set({ internetArchiveCollectionDiagnostics: { at: Date.now(), ...result } }); return result; }
  const stored = await browser.storage.local.get({ internetArchiveState: { seen: {} } }), sync = stored.internetArchiveState || { seen: {} }, seen = sync.seen || {}, now = Date.now();
  if (now - (Number(sync.lastAttemptAt) || 0) < 60000) { result.throttled = true; result.skippedReason = "throttled"; await browser.storage.local.set({ internetArchiveCollectionDiagnostics: { at: now, ...result } }); return result; }
  result.attempted = true;
  await browser.storage.local.set({ internetArchiveState: { ...sync, seen, lastAttemptAt: now } });
  const controller = new AbortController(); archiveSearchController = controller;
  const metadataTimeout = () => AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), storeForWalls = async (entry, wallIds, keyword) => { const sourceId = `${INTERNET_ARCHIVE_SOURCE_PREFIX}documents`, row = { ...entry, sourceId, sourceIds: [sourceId], archiveKeyword: keyword }; await MMPDB.putMany([row]); await recordAutomaticHistory(sourceId, [row], automaticHistoryMetadata(sourceId, [...wallIds], acquisitionMode)); };
  for (const { keyword, walls } of [...queries.values()].slice(0, 8)) {
    if (controller.signal.aborted || !await hasSearchTermsConsent()) break;
    const escaped = keyword.replace(/[\\+\-&|!(){}\[\]^"~*?:]/g, "\\$&"), url = new URL("https://archive.org/advancedsearch.php");
    const params = url.searchParams;
    params.set("q", `mediatype:texts AND title:"${escaped}" AND (language:fre OR language:fra OR language:French OR language:fr)`);
    for (const field of ["identifier", "title", "creator", "date", "publicdate", "description", "mediatype", "language"]) params.append("fl[]", field);
    params.append("sort[]", "publicdate desc"); params.set("rows", "20"); params.set("output", "json");
    try {
      result.searches++;
      const response = await fetch(url.href, { credentials: "omit", headers: { Accept: "application/json" }, signal: metadataTimeout() });
      if (!response.ok) throw new Error(`Advanced Search a répondu HTTP ${response.status}.`);
      const payload = await response.json();
      const docs = Array.isArray(payload?.response?.docs) ? payload.response.docs : [];
      result.results += docs.length;
      result.requests.push({ keyword, url: url.href, status: response.status, returned: docs.length });
      let accepted = 0, metadataLookups = 0;
      for (const doc of docs) {
        const identifier = String(doc?.identifier || "").trim(), title = iaField(doc?.title), publicAt = iaTimestamp(doc?.publicdate);
        if (!identifier || doc.mediatype !== "texts") { result.invalidResultRejected++; continue; }
        if (!title || !MMP.matchTerm(title, keyword)) { result.titleRejected++; continue; }
        if (seen[identifier]?.article?.documentLanguage === "fr") { await storeForWalls(seen[identifier].article, walls, keyword); result.duplicates++; accepted++; if (accepted >= 3) break; continue; }
        if (seen[identifier] && !seen[identifier].article && (!seen[identifier].retryAfter || seen[identifier].retryAfter > now)) { result.duplicates++; result.cachedRejected++; continue; }
        if (metadataLookups >= 5) break;
        metadataLookups++;
        try {
          const metadataResponse = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, { credentials: "omit", headers: { Accept: "application/json" }, signal: metadataTimeout() });
          if (!metadataResponse.ok) throw new Error(`Metadata a répondu HTTP ${metadataResponse.status}.`);
          const metadata = await metadataResponse.json(), files = Array.isArray(metadata.files) ? metadata.files : [], language = doc.language || metadata.metadata?.language;
          if (!iaIsFrench(language)) { seen[identifier] = { at: now, retryAfter: now + 7 * 86400000, skipped: "not-french", language: iaField(language) }; result.languageRejected++; continue; }
          const pdf = files.find(file => typeof file?.name === "string" && file.name.toLowerCase().endsWith(".pdf") && file.private !== "true");
          if (!pdf) { seen[identifier] = { at: now, retryAfter: now + 7 * 86400000, skipped: "no-pdf" }; result.noPdfRejected++; continue; }
          const pdfUrl = `https://archive.org/download/${encodeURIComponent(identifier)}/${pdf.name.split("/").map(encodeURIComponent).join("/")}`;
          const head = await fetch(pdfUrl, { method: "HEAD", credentials: "omit", signal: metadataTimeout() }); result.pdfChecked++;
          if (!head.ok || !/^application\/pdf\b/i.test(head.headers.get("content-type") || "")) { seen[identifier] = { at: now, retryAfter: now + 86400000, skipped: "pdf-unavailable" }; result.unavailablePdfRejected++; continue; }
          const authors = iaField(doc.creator || metadata.metadata?.creator), summary = iaField(doc.description || metadata.metadata?.description).slice(0, 1200);
          const itemDate = iaTimestamp(doc.date || metadata.metadata?.date), canonicalUrl = `https://archive.org/details/${encodeURIComponent(identifier)}`;
          const entry = { id: MMP.stableId(canonicalUrl), canonicalUrl, title, summary, image: `https://archive.org/services/img/${encodeURIComponent(identifier)}`, categories: [], publishedAt: publicAt || now, discoveredAt: now, fetchedAt: now, dateIsFallback: !publicAt, documentKind: "pdf", documentLanguage: "fr", documentUrl: pdfUrl, documentAuthor: authors, documentDate: itemDate || 0, archiveDate: publicAt || 0, archiveIdentifier: identifier };
          await storeForWalls(entry, walls, keyword);
          seen[identifier] = { at: now, publicAt, article: entry }; accepted++; result.stored++;
          if (accepted >= 3) break;
        } catch (error) {
          result.errors.push(`${keyword} · ${identifier} : ${error.message}`);
        }
      }
    } catch (error) { result.errors.push(`${keyword} : ${error.message}`); }
  }
  const cutoff = now - 90 * 86400000;
  for (const [identifier, row] of Object.entries(seen)) if (!row?.at || row.at < cutoff) delete seen[identifier];
  await browser.storage.local.set({ internetArchiveState: { seen, lastAttemptAt: now, lastSuccessfulAt: result.errors.length ? (sync.lastSuccessfulAt || 0) : now } });
  await browser.storage.local.set({ internetArchiveCollectionDiagnostics: { at: now, ...result } });
  return result;
}
async function refreshAllImpl(wallId = "", acquisitionMode = "Automatique") {
  const current = await state(), { sources, settings } = current, active = sources.filter(s => (s.enabled || (s.method === "html" && s.extractionProfile?.kind === "publication" && s.extractionProfile?.refreshable === false)) && (!wallId || (s.wallIds || []).includes(wallId)));
  const progress = { startedAt: Date.now(), completedAt: 0, totalSources: active.length, processedSources: 0, succeededSources: 0, failedSources: 0, currentSourceIds: [] };
  let progressWrites = Promise.resolve();
  const persistProgress = () => {
    const snapshot = { ...progress, currentSourceIds: [...progress.currentSourceIds] };
    const write = progressWrites.then(() => browser.storage.local.set({ sources, refreshStatus: snapshot }));
    progressWrites = write.catch(error => { console.warn("Enregistrement de la progression d’actualisation impossible", error); });
    return progressWrites;
  };
  await browser.storage.local.set({ refreshStatus: progress });
  let cachedArticles;
  try {
    await MMPDB.pruneSourceHistory(Date.now() - SOURCE_URL_HISTORY_DAYS * 86400000);
    cachedArticles = await MMPDB.all();
  } catch (error) {
    const reason = `Préparation de la collecte impossible : ${error.message || error}`;
    for (const source of active) { source.status = "error"; source.lastError = reason; source.lastAttemptAt = Date.now(); }
    progress.processedSources = active.length; progress.failedSources = active.length;
    await persistProgress();
    throw error;
  }
  const knownImages = new Map(cachedArticles.filter(a => a.image).map(a => [a.canonicalUrl, a.image]));
  {
    const batch = active;
    progress.currentSourceIds = [];
    await persistProgress();
    for (const source of batch) {
      let previousSuccessfulSync = Number(source.lastSuccessfulSync) || 0;
      let firstCollectionStartedAt = 0;
      let attemptAt = 0, attemptStage = "préparation et accès", attemptResult = null, attemptRows = null, attemptKnownSourceUrls = null, attemptPersistenceDiagnostics = null, attemptStorageCompleted = false;
      const sourceDeadlineAt = Date.now() + 15000, remainingSourceTime = () => Math.max(0, sourceDeadlineAt - Date.now());
      progress.currentSourceIds = [source.id];
      await persistProgress();
      try {
        previousSuccessfulSync ||= Number(await MMPDB.sourceSync(source.id)) || Number(source.lastSync) || 0;
        if (!previousSuccessfulSync) firstCollectionStartedAt = Date.now();
        const needs = source.method === "html" ? source.pageUrl : source.feedUrl;
        if (!await accessible(needs)) throw new Error("Autorisation du domaine révoquée");
        attemptAt = markSourceAttempt(source);
        attemptStage = "récupération et extraction";
        const needsFeedRecovery = !source.enabled && source.method === "html" && source.extractionProfile?.kind === "publication" && source.extractionProfile?.refreshable === false;
        if (needsFeedRecovery) {
          const recovered = await rediscoverSource(source, knownImages, cachedArticles, previousSuccessfulSync, firstCollectionStartedAt, sourceDeadlineAt, acquisitionMode);
          if (!recovered) throw new Error(source.lastRediscoveryResult || "Aucune liste actualisable détectée pour cette page.");
        } else {
          if (source.faviconVersion !== 2) {
            const favicon = await sourceTimeout(discoverFavicon(source.pageUrl), Math.min(3000, remainingSourceTime()));
            source.faviconUrl = favicon.faviconUrl || "";
            source.faviconData = favicon.faviconData || "";
            source.faviconChecked = favicon.faviconChecked;
            source.faviconVersion = favicon.faviconVersion;
          }
          const result = await sourceTimeout(fetchSource(source, knownImages, cachedArticles, sourceCinemaPolicy(source,current)), remainingSourceTime()), now = Date.now();
          attemptResult = result;
          if (result.error) {
            source.status = "error"; source.lastError = result.error; source.lastAttemptAt = attemptAt;
            source.lastAcquisitionDiagnostics = sourceAcquisitionDiagnostic({ attemptedAt: attemptAt, finishedAt: now, outcome: "error", method: source.method, result, stage: "réception ou analyse" });
            if (result.diagnostics) source.lastExtractionDiagnostics = result.diagnostics;
            if (result.kind === "strategy") source.strategyFailures = (Number(source.strategyFailures) || 0) + 1;
            const knownHtmlCatalog = source.method === "html" && knownPublisherFeedCandidates(source.pageUrl).length > 0;
            const recoveryDue = (knownHtmlCatalog && !source.publisherFeedRecoveryAttempted) || (source.strategyFailures >= 3 && now - (Number(source.lastRediscoveryAt) || 0) >= 86400000);
            if (recoveryDue && remainingSourceTime() > 0) { if (knownHtmlCatalog) source.publisherFeedRecoveryAttempted = true; await rediscoverSource(source, knownImages, cachedArticles, previousSuccessfulSync, firstCollectionStartedAt, sourceDeadlineAt, acquisitionMode); }
          } else {
            attemptStage = "filtrage de première collecte";
            const wallCutoffs = await firstCollectionCutoffsFor(source, result.articles, current, cachedArticles, firstCollectionStartedAt);
            const persistenceDiagnostics = {};
            const rows = await sourceRowsToPersist(source.id, [...result.articles, ...(result.imageUpdates || [])], previousSuccessfulSync, firstCollectionStartedAt, wallCutoffs, persistenceDiagnostics);
            attemptRows = rows;
            attemptPersistenceDiagnostics = persistenceDiagnostics;
            const knownSourceUrls = await MMPDB.sourceHistory(source.id, result.articles.map(row => row.canonicalUrl));
            attemptKnownSourceUrls = [...knownSourceUrls];
            attemptStage = "stockage des articles";
            await MMPDB.putMany(rows);
            attemptStorageCompleted = true;
            attemptStage = "historique des URL";
            await MMPDB.rememberSourceArticles(source.id, result.articles, { ...sourceHistoryMetadata(source, result.method, acquisitionMode), acquiredCanonicalUrls: rows.map(row => row.canonicalUrl) });
            source.lastAcquisitionDiagnostics = sourceAcquisitionDiagnostic({ attemptedAt: attemptAt, finishedAt: Date.now(), outcome: "success", method: result.method, result, selectedRows: rows, knownSourceUrls: [...knownSourceUrls], persistenceDiagnostics, storageCompleted: true, stage: "mémorisation" });
            attemptStage = "finalisation de synchronisation";
            source.lastSuccessfulSync = now; await MMPDB.setSourceSync(source.id, now);
            source.lastSync = now;
            if (result.method === "html") await clearOrphanedReadingStates(await MMPDB.reconcileSourceArticles(source.id, result.articles), source.id, result.articles);
            source.method = result.method; source.status = "ok"; source.lastError = ""; source.strategyFailures = 0;
            source.extractionProfile = result.extractionProfile || null;
            if (result.extractionProfile) source.enabled = result.extractionProfile.refreshable !== false;
            source.lastExtractionDiagnostics = result.extractionDiagnostics || null;
            if (result.articles.length) source.lastArticleAt = Math.max(...result.articles.map(a => a.publishedAt));
          }
        }
      } catch (e) {
        source.status = "error"; source.lastError = e.message; if (!attemptAt) attemptAt = Date.now(); source.lastAttemptAt = attemptAt;
        source.lastAcquisitionDiagnostics = sourceAcquisitionDiagnostic({ attemptedAt: attemptAt, finishedAt: Date.now(), outcome: "error", method: source.method, result: attemptResult, selectedRows: attemptRows, knownSourceUrls: attemptKnownSourceUrls, persistenceDiagnostics: attemptPersistenceDiagnostics, storageCompleted: attemptStorageCompleted, stage: attemptStage, error: e.message });
        if (e.diagnostics) source.lastExtractionDiagnostics = e.diagnostics;
        if (e.kind === "strategy") source.strategyFailures = (Number(source.strategyFailures) || 0) + 1;
        const now = Date.now();
        const knownHtmlCatalog = source.method === "html" && knownPublisherFeedCandidates(source.pageUrl).length > 0;
        const recoveryDue = (knownHtmlCatalog && !source.publisherFeedRecoveryAttempted) || (source.strategyFailures >= 3 && now - (Number(source.lastRediscoveryAt) || 0) >= 86400000);
        if (recoveryDue && remainingSourceTime() > 0) { if (knownHtmlCatalog) source.publisherFeedRecoveryAttempted = true; await rediscoverSource(source, knownImages, cachedArticles, previousSuccessfulSync, firstCollectionStartedAt, sourceDeadlineAt, acquisitionMode); }
      } finally {
        progress.processedSources++;
        if (source.status === "error") progress.failedSources++;
        else progress.succeededSources++;
        progress.currentSourceIds = progress.currentSourceIds.filter(id => id !== source.id);
        await persistProgress();
      }
    }
  }
  try {
    // Revisit stored items too: many RSS sources drop older entries before
    // their seven-day reader cache expires, so feed parsing alone cannot enrich
    // those already-visible cards.
    const storedCinemaArticles=await MMPDB.all();
    await enrichExistingCinemaArticles(storedCinemaArticles,current,wallId);
  } catch(error) {
    console.warn("Enrichissement des articles cinéma déjà stockés impossible",error);
  }
  const freshState = await state();
  const youtube = freshState.automaticWalls.videos ? await refreshYouTubeKeywords(acquisitionMode) : { keywordCount: 0, successCount: 0, resultCount: 0, addedCount: 0, errors: [], disabled: true };
  const bluesky = await refreshBluesky(acquisitionMode);
  const linkedin = await refreshLinkedInNews(acquisitionMode);
  const internetArchive = freshState.automaticWalls.internetArchive ? await refreshInternetArchive(wallId, acquisitionMode) : { enabled: false, keywordCount: 0, searches: 0, results: 0, pdfChecked: 0, stored: 0, duplicates: 0, errors: [] };
  console.info("Diagnostic de collecte des PDF auto", internetArchive);
  const retentionDays = Math.max(1, ...Object.values(current.wallSettings || {}).map(item => Number(item.retentionDays) || 3));
  const cutoff = Date.now() - retentionDays * 86400000;
  await cleanReadingStates();
  const { articleStates = {} } = await browser.storage.local.get({ articleStates: {} });
  const automaticSourceIds = new Set([YOUTUBE_SOURCE_ID, PEERTUBE_SOURCE_ID, CROWDBUNKER_SOURCE_ID, RUMBLE_SOURCE_ID, BLUESKY_SOURCE_ID, LINKEDIN_SOURCE_ID, `${INTERNET_ARCHIVE_SOURCE_PREFIX}documents`]);
  const protectedUnreadAutomaticIds = (await MMPDB.all())
    .filter(article => articleStates[article.id]?.status !== "read" && (article.sourceIds || [article.sourceId]).some(id => automaticSourceIds.has(id)))
    .map(article => article.id);
  await MMPDB.removeOlderThan(cutoff, [], protectedUnreadAutomaticIds);
  await saveAutomaticSocialSnapshots();
  await cleanExpiredLikes();
  await browser.storage.local.set({ sources });
  browser.runtime.sendMessage({ type: "articlesUpdated" }).catch(() => {});
  return { sources, youtube, bluesky, linkedin, internetArchive };
}
async function uniqueSources() {
  const all = await MMPDB.all(), map = new Map();
  for (const article of all) for (const category of article.categories || []) {
    const key=MMP.normalizeText(category),entry=map.get(key)||{name:category,count:0};
    entry.count++;map.set(key,entry);
  }
  const rows=[...map.entries()].sort((a,b)=>a[1].name.localeCompare(b[1].name,"fr"));
  return {categories:rows.map(([,entry])=>entry.name),categoryCounts:Object.fromEntries(rows.map(([key,entry])=>[key,entry.count]))};
}
let discoverySearchRunning = false;
function discoveryIdentity(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref|source|campaign)/i.test(key)) url.searchParams.delete(key);
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    return url.href;
  } catch { return ""; }
}
function discoverySiteIdentity(value) {
  try {
    const raw = String(value || "");
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    return url.hostname.toLowerCase().replace(/^www\./i, "");
  } catch { return ""; }
}
function mergeProcessedDiscoveryRows(existing, candidates, now = Date.now()) {
  const byDomain = new Map();
  for (const item of [...(Array.isArray(existing) ? existing : []), ...(candidates || [])]) {
    const domain = discoverySiteIdentity(item.domain || item.pageUrl || item.feedUrl || item.identity);
    if (!domain) continue;
    const previous = byDomain.get(domain) || {};
    const feedUrls = [...new Set([...(previous.feedUrls || []), ...(item.feedUrls || []), item.feedUrl || item.identity || ""].map(discoveryIdentity).filter(Boolean))];
    byDomain.set(domain, { ...previous, ...item, id: domain, domain, feedUrls, feedUrl: item.feedUrl || previous.feedUrl || feedUrls[0] || "", pageUrl: item.pageUrl || previous.pageUrl || "", name: item.name || previous.name || domain, status: "processed", processedAt: Number(previous.processedAt || item.processedAt || item.refusedAt || now) });
  }
  return [...byDomain.values()];
}
async function ensureProcessedDiscoveryMemory(sources) {
  const stored = await browser.storage.local.get({ processedSources: [], refusedSources: [], sources: [] });
  const previous = (Array.isArray(stored.processedSources) ? stored.processedSources : []).map(item => ({ ...item, followed: false }));
  const followed = (sources || stored.sources || []).map(source => ({ ...source, domain: discoverySiteIdentity(source.pageUrl || source.feedUrl), processedAt: Date.now(), followed: true }));
  const processedSources = mergeProcessedDiscoveryRows(previous, [...stored.refusedSources, ...followed]);
  if (stored.refusedSources.length || JSON.stringify(processedSources) !== JSON.stringify(stored.processedSources)) {
    await browser.storage.local.set({ processedSources, refusedSources: [] });
  }
  return processedSources;
}
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.sources) ensureProcessedDiscoveryMemory(changes.sources.newValue || []).catch(error => console.warn("Mise à jour de l’historique des sources suivies impossible", error));
});
function selectUnprocessedDiscoveryResults(candidates, processedIds) {
  const byDomain = new Map();
  for (const candidate of candidates || []) {
    const domain = discoverySiteIdentity(candidate.domain || candidate.pageUrl || candidate.feedUrl || candidate.identity);
    if (domain && !processedIds.has(domain) && !byDomain.has(domain)) byDomain.set(domain, candidate);
  }
  return [...byDomain.values()];
}
async function runSourceDiscovery(keywords) {
  if (discoverySearchRunning) throw new Error("Une recherche de sources est déjà en cours.");
  discoverySearchRunning = true;
  let tabId;
  const reportProgress = (phase, current = 0, total = 0) => browser.runtime.sendMessage({ type: "discoveryProgress", phase, current, total }).catch(() => {});
  try {
    const processedSources = await ensureProcessedDiscoveryMemory();
    const query = keywords.join(" ").trim();
    if (!query) throw new Error("Saisissez au moins un mot-clé.");
    await reportProgress("Recherche DuckDuckGo");
    tabId = (await browser.tabs.create({ url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`, active: false })).id;
    // Only hide the temporary tab created above. It is never activated, so the
    // user's selected tab and window stay untouched even if tabHide is denied.
    if (browser.tabs.hide && await browser.permissions.contains({ permissions: ["tabHide"] }).catch(() => false)) await browser.tabs.hide(tabId).catch(() => {});
    const started = Date.now();
    while (Date.now() - started < 20000) {
      const tab = await browser.tabs.get(tabId);
      if (/duckduckgo\.com\/captcha|challenge/i.test(tab.url || "")) throw new Error("DuckDuckGo a affiché une vérification ou un blocage. Réessayez plus tard.");
      if (tab.status === "complete") break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (Date.now() - started >= 20000) throw new Error("La recherche DuckDuckGo a dépassé le délai maximal.");
    const extractResults = async () => {
      let injected;
      try { injected = await browser.scripting.executeScript({ target: { tabId }, func: () => {
      const rows = [...document.querySelectorAll(".results .result, #links .result, [data-testid='result']")];
      const out = [], seen = new Set();
      for (const row of rows) {
        if (row.matches(".result--ad, .result--sponsored, [data-testid*='ad']") || row.querySelector(".result--ad, .result--sponsored, [data-testid*='ad']")) continue;
        const anchor = row.querySelector("a.result__a, a[data-testid='result-title-a'], h2 a");
        if (!anchor?.href) continue;
        let url; try { url = new URL(anchor.href); } catch { continue; }
        if (!/^https?:$/.test(url.protocol) || /(^|\.)duckduckgo\.com$/i.test(url.hostname) || /^(?:javascript|data):/i.test(anchor.href)) continue;
        url.hash = "";
        const trackingKeys = [];
        url.searchParams.forEach((value, key) => { if (/^(utm_|fbclid|gclid|ref|source|campaign)/i.test(key)) trackingKeys.push(key); });
        for (const key of trackingKeys) url.searchParams.delete(key);
        url.searchParams.sort();
        const clean = url.href;
        if (seen.has(clean)) continue;
        seen.add(clean);
        out.push({ url: clean, title: (anchor.textContent || "").trim(), snippet: (row.querySelector(".result__snippet, [data-testid='result-snippet']")?.textContent || "").trim() });
        if (out.length >= 10) break;
      }
      const blocked = /captcha|unusual traffic|automated queries|robot/i.test(document.body?.innerText || "");
      return { results: out, blocked, rows: rows.length, title: document.title, url: location.href, readyState: document.readyState, bodyLength: document.body?.innerText?.length || 0 };
      } }); }
      catch (error) {
        const tab = await browser.tabs.get(tabId).catch(() => null);
        const hasPermission = await browser.permissions.contains({ origins: ["https://duckduckgo.com/*"] }).catch(() => false);
        const wrapped = new Error(`Lecture des résultats impossible (onglet ${tabId}; ${tab?.url || "URL inconnue"}; accès DuckDuckGo ${hasPermission ? "accordé" : "absent"}) : ${error?.message || error}`);
        wrapped.cause = error;
        throw wrapped;
      }
      const frame = injected?.[0], payload = frame?.result;
      if (frame?.error) throw new Error(typeof frame.error === "string" ? frame.error : frame.error.message || JSON.stringify(frame.error));
      if (!payload || typeof payload !== "object") return { results: [], blocked: false, rows: 0, title: "", url: "", readyState: "", bodyLength: 0, injectedFrames: injected?.length || 0, frameResultType: typeof payload, frameKeys: Object.keys(frame || {}) };
      return { ...payload, injectedFrames: injected.length };
    };
    await reportProgress("Extraction des résultats");
    // Keep the search tab in the background. Never activate it to force
    // client-side hydration; an empty result is reported for the user instead.
    let result;
    try { result = await extractResults(); }
    catch (error) {
      if (!/Missing host permission for the tab/i.test(String(error?.message || error))) throw error;
      throw error;
    }
    const resultWaitUntil = started + 20000;
    while (!result?.blocked && !result?.results?.length && Date.now() < resultWaitUntil) {
      await new Promise(resolve => setTimeout(resolve, 400));
      result = await extractResults();
    }
    if (result?.blocked) throw new Error("DuckDuckGo a signalé un blocage. Réessayez plus tard.");
    const processedIds = new Set(processedSources.map(item => discoverySiteIdentity(item.domain || item.pageUrl || item.feedUrl)).filter(Boolean));
    const out = [], explored = [], seenFeedIdentities = new Set(), permissionOrigins = new Set();
    const hits = result?.results || [];
    const diagnostics = { searchResults: hits.length, resultRows: result?.rows || 0, searchTitle: result?.title || "", searchUrl: result?.url || "", searchReadyState: result?.readyState || "", searchBodyLength: result?.bodyLength || 0, injectedFrames: result?.injectedFrames || 0, frameResultType: result?.frameResultType || "object", frameKeys: result?.frameKeys || [], checkedPages: 0, feedsFound: 0, parsedFeeds: 0, freshnessMatches: 0, rejectedPages: 0, failedFeeds: 0, emptyFeeds: 0, staleOrUnmatchedFeeds: 0 };
    for (const [index, hit] of hits.entries()) {
      await reportProgress("Vérification des sites et flux", index, hits.length);
      const exploredRow = { ...hit, domain: (() => { try { return new URL(hit.url).hostname; } catch { return "Domaine inconnu"; } })(), status: "error", reason: "Vérification non terminée.", feeds: [] };
      try {
        const page = new URL(hit.url);
        if (!/^https?:$/.test(page.protocol) || page.username || page.password || MMAffiliate?.classify(hit.url)?.status === "recognized") { exploredRow.status = "excluded"; exploredRow.reason = "Résultat non éligible."; explored.push(exploredRow); continue; }
        const identity = discoveryIdentity(hit.url);
        const hitDomain = discoverySiteIdentity(hit.url);
        if (processedIds.has(hitDomain)) { exploredRow.status = "processed"; exploredRow.reason = "Ce domaine a déjà été traité ou est déjà suivi."; explored.push(exploredRow); continue; }
        if (!identity) { exploredRow.reason = "URL de résultat invalide."; explored.push(exploredRow); continue; }
        const grant = await browser.permissions.contains({ origins: [`${page.protocol}//${page.host}/*`] });
        if (!grant && !await browser.permissions.contains({ origins: ["<all_urls>"] })) {
          permissionOrigins.add(`${page.protocol}//${page.host}/*`); exploredRow.status = "permission"; exploredRow.reason = "Autorisation Firefox requise pour vérifier ce domaine."; explored.push(exploredRow); continue;
        }
        const htmlResult = await fetchText(hit.url, 10000);
        diagnostics.checkedPages++;
        if (!/html/i.test(htmlResult.type)) { diagnostics.rejectedPages++; exploredRow.status = "error"; exploredRow.reason = "La page n’est pas un document HTML."; explored.push(exploredRow); continue; }
        const titleDoc = new DOMParser().parseFromString(htmlResult.text, "text/html");
        const siteName = titleDoc.querySelector('meta[property="og:site_name"]')?.content || titleDoc.title || page.hostname;
        const feeds = await discoverFeedCandidates(hit.url, htmlResult.text);
        exploredRow.feeds = feeds.map(feed => ({ url: feed.url, status: "unverified", reason: "Flux à vérifier." }));
        diagnostics.feedsFound += feeds.length;
        let candidate = null, lastReason = feeds.length ? "Aucun flux exploitable n’a pu être validé." : "Aucun flux RSS/Atom détecté.";
        const missingFeedOrigins = new Set();
        for (const feed of feeds.slice(0, 24)) {
          try {
            const feedUrl = discoveryIdentity(feed.url); if (!feedUrl) continue;
            const feedDomain = discoverySiteIdentity(feed.url);
            if (processedIds.has(feedDomain)) { exploredRow.feeds.find(row => row.url === feed.url).status = "processed"; exploredRow.feeds.find(row => row.url === feed.url).reason = "Site déjà traité ou suivi."; lastReason = "Site déjà traité ou suivi."; continue; }
            const feedHost = new URL(feed.url);
            if (!await browser.permissions.contains({ origins: [`${feedHost.protocol}//${feedHost.host}/*`] }) && !await browser.permissions.contains({ origins: ["<all_urls>"] })) { missingFeedOrigins.add(`${feedHost.protocol}//${feedHost.host}/*`); exploredRow.feeds.find(row => row.url === feed.url).status = "permission"; exploredRow.feeds.find(row => row.url === feed.url).reason = "Autorisation Firefox requise."; lastReason = "Autorisation Firefox requise pour lire le flux."; continue; }
            const response = await fetchText(feed.url, 8000);
            const method = /json|application\/feed\+json/i.test(`${feed.type} ${response.type} ${feed.url}`) || /^\s*\{/u.test(response.text) ? "jsonfeed" : feedMethod(feed.url, response.type);
            const entries = method === "jsonfeed" ? MMP.parseJsonFeed(response.text, feed.url, { id: "discovery-preview" }) : MMP.parseFeed(response.text, feed.url, { id: "discovery-preview" });
            if (!entries.length) { diagnostics.emptyFeeds++; exploredRow.feeds.find(row => row.url === feed.url).status = "empty"; exploredRow.feeds.find(row => row.url === feed.url).reason = "Flux valide mais sans article exploitable."; lastReason = "Flux sans article exploitable."; continue; }
            diagnostics.parsedFeeds++;
            const dated = entries.filter(item => Number(item.publishedAt) > 0 && item.dateIsFallback !== true).sort((a, b) => Number(b.publishedAt) - Number(a.publishedAt));
            const recent = entries.slice(0, 20);
            diagnostics.freshnessMatches++;
            exploredRow.feeds.find(row => row.url === feed.url).status = "valid";
            exploredRow.feeds.find(row => row.url === feed.url).lastPublishedAt = dated[0]?.publishedAt || 0;
            const lastPublishedAt = dated[0]?.publishedAt || 0;
            candidate = { ...hit, name: siteName, domain: page.hostname, pageUrl: hit.url, feedUrl: feed.url, method, status: lastPublishedAt && Date.now() - lastPublishedAt > 30 * 86400000 ? "inactive" : dated.length ? "active" : "date-unknown", identity: feedUrl, lastPublishedAt, recentTitles: recent.slice(0, 3).map(item => item.title).filter(Boolean) };
            break;
          } catch (error) { diagnostics.failedFeeds++; const feedRow = exploredRow.feeds.find(row => row.url === feed.url); if (feedRow) { feedRow.status = "error"; feedRow.reason = error?.message || "Échec de lecture du flux."; } }
        }
        const inactive = candidate?.lastPublishedAt > 0 && Date.now() - candidate.lastPublishedAt > 30 * 86400000;
        if (candidate && !seenFeedIdentities.has(candidate.identity)) { seenFeedIdentities.add(candidate.identity); out.push(candidate); exploredRow.status = inactive ? "inactive" : "new"; exploredRow.reason = inactive ? "Flux exploitable, mais dernière publication ancienne." : "Flux exploitable et activité récente confirmée."; }
        else { for (const origin of missingFeedOrigins) permissionOrigins.add(origin); exploredRow.status = candidate ? "duplicate" : (feeds.length ? "unavailable" : "no-feed"); exploredRow.reason = candidate ? "Flux déjà trouvé dans cette recherche." : lastReason; }
      } catch (error) { diagnostics.rejectedPages++; exploredRow.status = "error"; exploredRow.reason = error?.message || "Erreur pendant la vérification du site."; }
      explored.push(exploredRow);
    }
    const latest = await state();
    const latestSources = new Set(latest.sources.map(source => discoveryIdentity(source.feedUrl || source.pageUrl)).filter(Boolean));
    const latestProcessed = await ensureProcessedDiscoveryMemory();
    const latestProcessedIds = new Set(latestProcessed.map(item => discoverySiteIdentity(item.domain || item.pageUrl || item.feedUrl)).filter(Boolean));
    await reportProgress("Enregistrement des découvertes", hits.length, hits.length);
    const allProcessedIds = new Set([...latestProcessedIds, ...latestSources].map(value => discoverySiteIdentity(value)).filter(Boolean));
    const currentSearchResults = selectUnprocessedDiscoveryResults(out, allProcessedIds);
    await reportProgress("Recherche terminée", hits.length, hits.length);
    return { query, results: currentSearchResults, explored, permissionOrigins: [...permissionOrigins], diagnostics };
  } finally {
    if (Number.isInteger(tabId)) await browser.tabs.remove(tabId).catch(() => {});
    discoverySearchRunning = false;
  }
}
browser.runtime.onMessage.addListener((msg, sender) => (async () => {
  if (msg?.type === "discoverSources") return await runSourceDiscovery((msg.keywords || []).map(value => String(value).trim()).filter(Boolean).slice(0, 8));
  if (msg?.type === "processDiscoveredSource" || msg?.type === "refuseDiscoveredSource") {
    const item = msg.source || {}, domain = discoverySiteIdentity(item.domain || item.pageUrl || item.feedUrl || item.identity);
    if (!domain) throw new Error("Source invalide.");
    const stored = await browser.storage.local.get({ processedSources: [], refusedSources: [] });
    const processedSources = mergeProcessedDiscoveryRows([...stored.processedSources, ...stored.refusedSources], [{ ...item, domain, processedAt: Date.now() }]);
    await browser.storage.local.set({ processedSources, refusedSources: [] }); return processedSources;
  }
  if (msg?.type === "reconsiderProcessedSource" || msg?.type === "restoreDiscoveredSource") {
    const domain = discoverySiteIdentity(msg.domain || msg.identity), stored = await browser.storage.local.get({ processedSources: [], refusedSources: [] });
    const processedSources = mergeProcessedDiscoveryRows(stored.processedSources, stored.refusedSources).filter(row => row.domain !== domain);
    await browser.storage.local.set({ processedSources, refusedSources: [] }); return true;
  }
  if (msg?.type === "resolveAffiliateLinks") return resolveAffiliateLinks(msg.urls, msg.browserProbeUrls);
  if (msg?.type === "saveAffiliateFindings") { await MMPDB.cacheAffiliateFindings(String(msg.articleId || ""), msg.findings); return true; }
  if (msg?.type === "resetExtension") {
    blueskyRefreshController?.abort(); linkedinRefreshController?.abort(); videoRefreshController?.abort();
    await browser.alarms.clear(ALARM);
    await MMPDB.reset();
    await browser.storage.local.clear();
    const manifestHosts = new Set(browser.runtime.getManifest().host_permissions || []);
    const granted = await browser.permissions.getAll();
    const removable = (granted.origins || []).filter(origin => !manifestHosts.has(origin));
    if (removable.length) await browser.permissions.remove({ origins: removable });
    await browser.alarms.create(ALARM, { periodInMinutes: await refreshInterval() });
    return true;
  }
  if (msg?.type === "detectFaces") return await detectFaceImage(msg.url);
  if (msg.type === "state") { const current = await state(),categoryData=await uniqueSources(); return { ...current, ...categoryData }; }
  if (msg.type === "refreshIfStale") return await refreshIfStale();
  if (msg.type === "setRefreshInterval") { const minutes = Number(msg.minutes); if (!REFRESH_INTERVALS.includes(minutes)) throw new Error("Fréquence d’actualisation invalide."); await browser.storage.local.set({ refreshIntervalMinutes: minutes }); await browser.alarms.clear(ALARM); await browser.alarms.create(ALARM, { periodInMinutes: minutes }); return { refreshIntervalMinutes: minutes }; }
  if (msg.type === "rumbleEmbedUrl") return { embedUrl: await rumbleEmbedUrl(msg.url) };
  if (msg.type === "sourceHistory") {
    const [rows, current] = await Promise.all([MMPDB.sourceHistoryRows(), state()]);
    const sources = new Map(current.sources.map(source => [source.id, source]));
    const articles = await MMPDB.all(), byUrl = new Map(articles.map(article => [article.canonicalUrl, article]));
    const builtins = { [YOUTUBE_SOURCE_ID]: ["YouTube", "YouTube"], [PEERTUBE_SOURCE_ID]: ["PeerTube", "PeerTube"], [BLUESKY_SOURCE_ID]: ["Bluesky", "Bluesky"], [LINKEDIN_SOURCE_ID]: ["Google Actualités", "LinkedIn"], [CROWDBUNKER_SOURCE_ID]: ["CrowdBunker", "CrowdBunker"], [RUMBLE_SOURCE_ID]: ["Rumble", "Rumble"] };
    const wallNames = new Map([...(current.walls || []), ...AUTO_WALLS].map(wall => [wall.id, wall.name]));
    return rows.map(row => {
      const source = sources.get(row.sourceId), builtin = builtins[row.sourceId], article = byUrl.get(row.canonicalUrl);
      const sourceName = source?.name || row.sourceName || builtin?.[1] || row.sourceId;
      const configuredUrl = source?.feedUrl || source?.pageUrl || "";
      const googleNews = /(^|\.)news\.google\.com$/i.test((() => { try { return new URL(configuredUrl).hostname; } catch { return ""; } })());
      const sourceType = builtin?.[0] || (googleNews ? "Google Actualités" : source?.method === "rss" || source?.method === "atom" ? "RSS" : source?.method === "jsonfeed" ? "JSON Feed" : source?.method === "html" ? "Site web" : row.sourceType || "Source");
      const wallIds = row.wallIds?.length ? row.wallIds : source?.wallIds || [];
      return { ...row, sourceName, sourceType, title: row.title || article?.title || "", wallNames: wallIds.map(id => wallNames.get(id)).filter(Boolean) };
    }).sort((a, b) => b.firstSeenAt - a.firstSeenAt);
  }
  if (msg.type === "sidebarCounts") {
    await cleanExpiredLikes();
    const [current, articles, likes, articleStates] = await Promise.all([state(), MMPDB.all(), MMPDB.likes(), cleanReadingStates()]);
    const counts = { walls: 0, discovery: 0, sources: current.sources.filter(source => source.enabled && source.status === "error").length, likes: likes.length, later: 0, archived: 0 };
    const byId = new Map(articles.map(article => [article.id, article]));
    for (const [id, item] of Object.entries(articleStates)) if (!byId.has(id) && item.article) byId.set(id, { ...item.article, id });
    const countableArticles = deduplicateArticlesByCanonicalUrl([...byId.values()], articleStates, new Set(likes.map(item => item.normalizedUrl)));
    for (const article of countableArticles) {
      if (article.readingState?.status === "later") counts.later++;
      if (article.readingState?.status === "read") counts.archived++;
    }
    const allExcludedKeywords = [...new Map([
      ...(current.settings?.excludedKeywords || []),
      ...Object.values(current.wallSettings || {}).flatMap(config => config.excludedKeywords || [])
    ].map(item => { const term=String(typeof item === "string" ? item : item?.term || "").trim(); return [MMP.normalizeText(term), term]; }).filter(([key, term]) => key && term)).values()];
    const excludedFromAutomatic = article => allExcludedKeywords.some(term => MMP.matchTerm(`${article.title || ""} ${article.summary || ""}`, term));
    const unreadWallArticleIds = new Set();
    for (const wall of current.walls) {
      const settings = current.settings || {};
      const sourceIds = new Set(current.sources.filter(source => (source.wallIds || []).includes(wall.id)).map(source => source.id));
      const excludedKeywords = (settings.excludedKeywords || []).map(item => typeof item === "string" ? item : item.term).filter(Boolean);
      const excludedCategories = new Set((settings.excludedCategories || []).map(MMP.normalizeText));
      const config = current.wallSettings?.[wall.id] || {};
      const cutoff = Date.now() - Math.max(1, Number(config.retentionDays) || 3) * 86400000;
      for (const article of countableArticles) {
        if (article.readingState) continue;
        if (Number(article.publishedAt || article.discoveredAt || 0) < cutoff) continue;
        if (!(article.sourceIds || [article.sourceId]).some(id => sourceIds.has(id))) continue;
        if (excludedKeywords.some(term => MMP.matchTerm(`${article.title} ${article.summary || ""}`, term))) continue;
        if ((article.categories || []).some(category => excludedCategories.has(MMP.normalizeText(category)))) continue;
        unreadWallArticleIds.add(article.id);
      }
    }
    const videoProviders = current.videoProviders || {}, socialProviders = current.socialProviders || {}, languageSettings=current.settings||{}, languageCache=new Map();
    const languagePasses=async(article,kind)=>{
      if(languageSettings.languageFilterEnabled!==true)return true;
      const ids=article.sourceIds||[article.sourceId],text=kind==="bluesky"&&ids.includes("linkedin-keyword-search")?(article.title||""):kind==="bluesky"?(article.summary||article.title||""):`${article.title||""} ${article.summary||""}`;
      const input=String(text).replace(/<[^>]*>/gu," ").replace(/\b(?:https?:\/\/|www\.)[^\s<>]+/giu," ").replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/giu," ").replace(/[\u200B-\u200D\uFEFF]/gu," ").replace(/\s+/gu," ").trim().slice(0,4000);
      let language="und";
      if(input&&/[\p{L}]{2}/u.test(input)){
        if(!languageCache.has(input))languageCache.set(input,(async()=>{try{const result=await browser.i18n.detectLanguage(input);if(!result?.isReliable||!Array.isArray(result.languages)||!result.languages.length)return "und";const dominant=result.languages[0]?.language;return typeof dominant==="string"&&dominant?dominant.toLowerCase().split(/[-_]/u)[0]:"und";}catch{return "und";}})());
        language=await languageCache.get(input);
      }
      return language==="und"?languageSettings.languageFilterKeepUnknown===true:(languageSettings.languageFilterLanguages||[]).includes(language);
    };
    const autoCandidates=[];
    if (current.automaticWalls?.videos !== false) for (const article of countableArticles) {
      if (article.readingState || excludedFromAutomatic(article)) continue;
      const ids = article.sourceIds || [article.sourceId];
      if (ids.some(id => id === YOUTUBE_SOURCE_ID && videoProviders.youtube !== false || id === PEERTUBE_SOURCE_ID && videoProviders.peertube !== false || id === CROWDBUNKER_SOURCE_ID && videoProviders.crowdbunker === true || id === RUMBLE_SOURCE_ID && videoProviders.rumble === true)) autoCandidates.push([article,"youtube"]);
    }
    if (current.automaticWalls?.bluesky === true) for (const article of countableArticles) {
      if (article.readingState || article.blueskyAdult === true || excludedFromAutomatic(article)) continue;
      const ids = article.sourceIds || [article.sourceId], french = (article.blueskyLangs || []).some(language => /^fr(?:-|$)/i.test(String(language))), eligible=ids.includes(BLUESKY_SOURCE_ID)&&socialProviders.bluesky!==false&&(current.blueskyFrenchOnly!==true||(article.blueskyLangs||[]).length===0||french)&&(current.blueskyRequireImage!==true||!!article.image)||ids.includes("linkedin-keyword-search")&&socialProviders.linkedin===true&&(current.linkedinRequireImage!==true||!!article.image);
      if(eligible)autoCandidates.push([article,"bluesky"]);
    }
    if (current.automaticWalls?.internetArchive !== false) for (const article of countableArticles) {
      if (!article.readingState && !excludedFromAutomatic(article) && article.documentKind === "pdf" && article.documentLanguage === "fr" && (article.sourceIds || [article.sourceId]).includes(`${INTERNET_ARCHIVE_SOURCE_PREFIX}documents`)) autoCandidates.push([article,"documents"]);
    }
    let candidateIndex=0;
    await Promise.all(Array.from({length:Math.min(4,autoCandidates.length)},async()=>{while(candidateIndex<autoCandidates.length){const [article,kind]=autoCandidates[candidateIndex++];if(await languagePasses(article,kind))unreadWallArticleIds.add(article.id);}}));
    counts.walls = unreadWallArticleIds.size;
    return counts;
  }
  if (msg.type === "videoStarted") {
    const wallUrl = browser.runtime.getURL("wall.html");
    const tabs = await browser.tabs.query({});
    await Promise.all(tabs.filter(tab => tab.id !== sender.tab?.id && tab.url?.startsWith(wallUrl)).map(tab => browser.tabs.sendMessage(tab.id, { type: "stopWallVideo", wallId: String(msg.wallId || ""), articleId: String(msg.articleId || ""), viewId: String(msg.viewId || "") }).catch(() => {})));
    return true;
  }
  if (msg.type === "probeArticleVideo") return probeArticleVideo(msg.articleId);
  if (msg.type === "resolveFranceTvVideo") return resolveFranceTvVideo(msg.videoId, msg.pageUrl);
  if (msg.type === "articles") {
    try { await restoreAutomaticSocialSnapshots(); }
    catch (error) { console.warn("Restauration IndexedDB des publications sociales impossible, lecture de la sauvegarde locale :", error); }
    try { await cleanExpiredLikes(); } catch (error) { console.warn("Nettoyage des favoris expirés impossible :", error); }
    let articleStates;
    try { articleStates = await cleanReadingStates(); }
    catch (error) { console.warn("Nettoyage des états de lecture impossible :", error); articleStates = (await browser.storage.local.get({ articleStates: {} })).articleStates || {}; }
    const [articles, likes, snapshots] = await Promise.all([
      MMPDB.all().catch(error => { console.warn("Lecture IndexedDB des articles impossible :", error); return []; }),
      MMPDB.likes().catch(error => { console.warn("Lecture IndexedDB des favoris impossible :", error); return []; }),
      browser.storage.local.get({ [AUTOMATIC_SOCIAL_SNAPSHOT_KEY]: [] })
    ]);
    const liked = new Set(likes.map(item => item.normalizedUrl)), byId = new Map(articles.map(article => [article.id, article]));
    for (const article of snapshots[AUTOMATIC_SOCIAL_SNAPSHOT_KEY] || []) if (!byId.has(article.id) && !["read", "later"].includes(articleStates[article.id]?.status)) byId.set(article.id, article);
    for (const [id, item] of Object.entries(articleStates)) if (!byId.has(id) && item.article) byId.set(id, { ...item.article, id });
    return deduplicateArticlesByCanonicalUrl([...byId.values()], articleStates, liked);
  }
  if (msg.type === "likes") { await cleanExpiredLikes(); return (await MMPDB.likes()).sort((a,b)=>b.likedAt-a.likedAt); }
  if (msg.type === "toggleLike") {
    const article = msg.article && typeof msg.article === "object" ? msg.article : await MMPDB.get(msg.articleId);
    if (!article || typeof article.canonicalUrl !== "string") throw new Error("Contenu introuvable.");
    const normalizedUrl = MMP.normalizeContentUrl(article.canonicalUrl);
    if (!normalizedUrl) throw new Error("L’adresse de ce contenu est invalide.");
    const current = await state(), source = current.sources.find(item => (article.sourceIds || [article.sourceId]).includes(item.id));
    const sourceName = source?.name || article.videoPlatform || (() => { try { return new URL(normalizedUrl).hostname.replace(/^www\./, ""); } catch { return "Source inconnue"; } })();
    const record = { normalizedUrl, url: article.canonicalUrl, title: String(article.title || "Sans titre"), source: sourceName, likedAt: Date.now(), publishedAt: Number(article.publishedAt) || null, language: typeof article.language === "string" ? article.language : null };
    const liked = await MMPDB.setLike(record);
    browser.runtime.sendMessage({ type: "likesUpdated", normalizedUrl, liked }).catch(() => {});
    return { liked, normalizedUrl };
  }
  if (msg.type === "removeLike") { await MMPDB.removeLike(String(msg.normalizedUrl || "")); browser.runtime.sendMessage({ type: "likesUpdated", normalizedUrl: msg.normalizedUrl, liked: false }).catch(() => {}); return true; }
  if (msg.type === "videoMetadata") {
    const article = await MMPDB.get(msg.articleId);
    if (!article?.videoPlatform) return { error: "Les informations de cette vidéo sont introuvables." };
    let details = {};
    if (article.videoPlatform === "YouTube") {
      const videoId = new URL(article.canonicalUrl).searchParams.get("v");
      details = await fetchYouTubeVideoDetails(videoId);
    } else if (article.videoPlatform === "PeerTube") {
      const url = new URL(article.canonicalUrl), match = url.pathname.match(/^\/videos\/watch\/([^/]+)/);
      if (url.protocol !== "https:" || !match) return { error: "L’adresse de cette vidéo PeerTube est invalide." };
      const origin = `${url.origin}/*`;
      if (!await browser.permissions.contains({ origins: [origin] }) && !await browser.permissions.request({ origins: [origin] })) return { error: "Autorisez l’accès à cette instance PeerTube pour charger la description complète." };
      const response = await fetch(`${url.origin}/api/v1/videos/${encodeURIComponent(match[1])}`, { credentials: "omit", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`L’instance PeerTube a répondu HTTP ${response.status}.`);
      const video = await response.json();
      details = { description: String(video.description || ""), channelName: video.channel?.displayName || video.account?.displayName || article.videoChannelName || "", viewCount: String(video.views ?? ""), durationSeconds: Number(video.duration) || 0, category: video.category?.label || "", publishedAtLabel: video.publishedAt || "", tags: Array.isArray(video.tags) ? video.tags.slice(0, 20) : [] };
    }
    details.description = MMP.decodeHtmlEntities(details.description || article.summary || "");
    if (details.description || details.channelName) await MMPDB.putMany([{ ...article, summary: details.description || article.summary || "", videoChannelName: details.channelName || article.videoChannelName, videoDetails: details, videoDetailsVersion: 2 }]);
    return details;
  }
  if (msg.type === "resolveYouTubeChannel") {
    const pageUrl = MMP.cleanUrl(msg.pageUrl), url = pageUrl ? new URL(pageUrl) : null;
    if (!url || !/(^|\.)youtube\.com$/i.test(url.hostname) || !/^\/@[^/]+(?:\/(?:videos|shorts))?$|^\/channel\/UC[A-Za-z0-9_-]{22}(?:\/(?:videos|shorts))?$/i.test(url.pathname.replace(/\/$/, ""))) throw new Error("Cette URL YouTube ne correspond pas à une chaîne prise en charge.");
    const { text: html } = await fetchText(pageUrl, 15000), metadata = youtubeChannelMetadata(html);
    const channelId = metadata.channelId || url.pathname.match(/^\/channel\/(UC[A-Za-z0-9_-]{22})(?:\/|$)/)?.[1] || "";
    if (!channelId) throw new Error("YouTube ne fournit pas l’identifiant public de cette chaîne dans ses métadonnées.");
    return { channelId, channelName: metadata.channelName || "Chaîne YouTube" };
  }
  if (msg.type === "setArticleStatus" || msg.type === "setArticlesStatus") {if(!["read","later"].includes(msg.status))throw new Error("Action inconnue.");const ids=msg.type==="setArticleStatus"?[msg.articleId]:[...new Set(msg.articleIds||[])];if(!ids.length)return true;const articles=await MMPDB.all(), {articleStates={}}=await browser.storage.local.get({articleStates:{}}), byId=new Map(articles.map(a=>[a.id,a])), updatedAt=Date.now();for(const id of ids){const article=byId.get(id)||articleStates[id]?.article;if(!article)continue;articleStates[id]={status:msg.status,updatedAt,article:{id:article.id,sourceId:article.sourceId,sourceIds:article.sourceIds,canonicalUrl:article.canonicalUrl,title:article.title,summary:article.summary||"",image:article.image||"",categories:article.categories||[],publishedAt:article.publishedAt,discoveredAt:article.discoveredAt,dateIsFallback:!!article.dateIsFallback,...(article.atUri?{atUri:article.atUri,blueskyAuthor:article.blueskyAuthor,blueskyHandle:article.blueskyHandle,blueskyTopics:article.blueskyTopics,blueskyLangs:article.blueskyLangs,blueskyLink:article.blueskyLink,blueskyLinkTitle:article.blueskyLinkTitle,videoChannelName:article.videoChannelName,videoPlatform:article.videoPlatform}:{})}};}await browser.storage.local.set({articleStates});await saveAutomaticSocialSnapshots();browser.runtime.sendMessage({type:"articlesUpdated"}).catch(()=>{});return true;}
  if (msg.type === "associateLinkedInPermalink") {
    const updated = await associateLinkedInUrl(msg.articleId, msg.url);
    if (!updated) throw new Error("Utilisez le lien direct d’une publication ou d’un article LinkedIn.");
    return { linkedinOriginalUrl: updated.linkedinOriginalUrl, linkedinActivityUrn: updated.linkedinActivityUrn, embeddable: !!updated.linkedinActivityUrn };
  }
  if (msg.type === "resolveLinkedInOnExpand") return resolveLinkedInOnExpand(msg.articleId);
  if (msg.type === "cancelLinkedInResolution") return { cancelled: cancelLinkedInResolution(msg.articleId) };
  if (msg.type === "openLinkedInResult") {
    const article = await MMPDB.get(String(msg.articleId || ""));
    if (!article || !(article.sourceIds || [article.sourceId]).includes(LINKEDIN_SOURCE_ID)) throw new Error("Carte LinkedIn introuvable.");
    let url; try { url = new URL(article.linkedinOriginalUrl || article.canonicalUrl); } catch { throw new Error("Lien Google Actualités invalide."); }
    if (url.protocol !== "https:" || !/(^|\.)news\.google\.com$/i.test(url.hostname) && !/(^|\.)linkedin\.com$/i.test(url.hostname)) throw new Error("Lien de résultat non autorisé.");
    const tab = await browser.tabs.create({ url: url.href, active: true });
    pendingLinkedInTabs.set(tab.id, { articleId: article.id, expiresAt: Date.now() + 90000 });
    return { opened: true, observing: true };
  }
  if (msg.type === "setAutomaticWall") { const current = await state(), key = msg.wallId === "auto-youtube" ? "videos" : msg.wallId === "auto-bluesky" ? "bluesky" : ""; if (!key) throw new Error("Mur automatique inconnu."); const automaticWalls = { ...current.automaticWalls, [key]: !!msg.enabled }; await browser.storage.local.set({ automaticWalls }); if (!automaticWalls[key] && key === "bluesky") { blueskyRefreshController?.abort(); linkedinRefreshController?.abort(); } if (!automaticWalls[key] && key === "videos") videoRefreshController?.abort(); if (!automaticWalls[key] && current.activeWallId === msg.wallId) await browser.storage.local.set({ activeWallId: current.walls[0]?.id || "wall-actus" }); browser.runtime.sendMessage({ type: "wallsUpdated" }).catch(() => {}); if (msg.enabled) refreshAll().catch(error => console.warn("Actualisation du mur automatique :", error)); return automaticWalls; }
  if (msg.type === "setInternetArchiveEnabled") { const current = await state(), automaticWalls = { ...current.automaticWalls, internetArchive: !!msg.enabled }; await browser.storage.local.set({ automaticWalls }); if (!msg.enabled && current.activeWallId === "auto-documents") await browser.storage.local.set({ activeWallId: current.walls[0]?.id || "wall-actus" }); if (msg.enabled) refreshAll().catch(error => console.warn("Actualisation Internet Archive :", error)); browser.runtime.sendMessage({ type: "wallsUpdated" }).catch(() => {}); return automaticWalls; }
  if (msg.type === "setVideoProvider") { if (!['youtube','peertube','crowdbunker','rumble'].includes(msg.provider)) throw new Error("Flux vidéo inconnu."); const current = await state(), videoProviders = { ...current.videoProviders, [msg.provider]: !!msg.enabled }; await browser.storage.local.set({ videoProviders }); if (current.automaticWalls.videos) refreshAll().catch(error => console.warn("Actualisation des flux vidéo :", error)); return videoProviders; }
  if (msg.type === "setSocialProvider") { if (!['bluesky','linkedin'].includes(msg.provider)) throw new Error("Source de réseau social inconnue."); const current = await state(), socialProviders = { ...current.socialProviders, [msg.provider]: !!msg.enabled }; await browser.storage.local.set({ socialProviders }); if (!socialProviders[msg.provider]) { if (msg.provider === "bluesky") blueskyRefreshController?.abort(); if (msg.provider === "linkedin") linkedinRefreshController?.abort(); } else if (current.automaticWalls.bluesky) refreshAll().catch(error => console.warn("Actualisation des réseaux sociaux :", error)); browser.runtime.sendMessage({type:"wallsUpdated"}).catch(()=>{}); return socialProviders; }
  if (msg.type === "setBlueskyFrenchOnly") { const blueskyFrenchOnly=!!msg.enabled;await browser.storage.local.set({blueskyFrenchOnly});const current=await state();if(current.automaticWalls.bluesky&&current.socialProviders.bluesky)refreshAll().catch(error=>console.warn("Actualisation Bluesky :",error));browser.runtime.sendMessage({type:"wallsUpdated"}).catch(()=>{});return {blueskyFrenchOnly}; }
  if (msg.type === "setBlueskyRequireImage") { const blueskyRequireImage=!!msg.enabled;await browser.storage.local.set({blueskyRequireImage});const current=await state();if(current.automaticWalls.bluesky&&current.socialProviders.bluesky)refreshAll().catch(error=>console.warn("Actualisation Bluesky :",error));browser.runtime.sendMessage({type:"wallsUpdated"}).catch(()=>{});return {blueskyRequireImage}; }
  if (msg.type === "setLinkedInRequireImage") { const linkedinRequireImage=!!msg.enabled;await browser.storage.local.set({linkedinRequireImage});const current=await state();if(current.automaticWalls.bluesky&&current.socialProviders.linkedin)refreshAll().catch(error=>console.warn("Actualisation LinkedIn :",error));browser.runtime.sendMessage({type:"wallsUpdated"}).catch(()=>{});return {linkedinRequireImage}; }
  if (msg.type === "setActiveWall") { const current = await state(), allowedAuto = wall => wall.id === "auto-youtube" ? current.automaticWalls.videos : wall.id === "auto-bluesky" ? current.automaticWalls.bluesky : wall.id === "auto-documents" ? current.automaticWalls.internetArchive : true; if ([...current.walls,...AUTO_WALLS].some(w => w.id === msg.wallId && allowedAuto(w))) { await browser.storage.local.set({ activeWallId: msg.wallId }); browser.runtime.sendMessage({ type: "activeWallChanged", wallId: msg.wallId }).catch(() => {}); } return true; }
  if (msg.type === "setDefaultWall") { const current = await state(); if (!current.walls.some(w => w.id === msg.wallId)) throw new Error("Mur introuvable"); await browser.storage.local.set({ defaultWallId: msg.wallId }); return true; }
  if (msg.type === "saveAffiliateSettings" || msg.type === "saveSmartFilterSettings") { const operation = async () => { const stored = await browser.storage.local.get({settings:MMP.DEFAULTS.settings}); const settings = {...stored.settings}; for (const key of ["affiliateModuleEnabled", "affiliateWarningsEnabled", "hideAffiliatedContent", "persuasionDetectionEnabled", "clickbaitDetectionEnabled", "languageFilterEnabled", "languageFilterKeepUnknown", "translationEnabled"]) if (typeof msg.settings?.[key] === "boolean") settings[key] = msg.settings[key]; if (["fr", "en", "es", "it", "pt", "de", "nl", "pl"].includes(msg.settings?.translationTargetLanguage)) settings.translationTargetLanguage = msg.settings.translationTargetLanguage; if (Array.isArray(msg.settings?.languageFilterLanguages)) settings.languageFilterLanguages = [...new Set(msg.settings.languageFilterLanguages.filter(code => ["fr", "en", "es", "it", "pt", "de", "nl", "pl"].includes(code)))]; if (settings.languageFilterEnabled && !settings.languageFilterLanguages?.length) settings.languageFilterEnabled = false; if (["off", "blur", "hide"].includes(msg.settings?.faceFilterMode)) settings.faceFilterMode = msg.settings.faceFilterMode; if (Number.isFinite(Number(msg.settings?.faceDetectionThreshold))) settings.faceDetectionThreshold = Math.max(30, Math.min(90, Number(msg.settings.faceDetectionThreshold))); if (typeof msg.settings?.speechLanguage === "string") settings.speechLanguage = msg.settings.speechLanguage; if (typeof msg.settings?.speechVoiceURI === "string") settings.speechVoiceURI = msg.settings.speechVoiceURI; await browser.storage.local.set({settings}); return true; }; const result=settingsWriteQueue.then(operation,operation); settingsWriteQueue=result.catch(()=>{}); return result; }
  if (msg.type === "saveSemanticSettings") { const operation = async () => { const stored = await browser.storage.local.get({settings:MMP.DEFAULTS.settings}); const settings = {...stored.settings}; for (const key of ["excludedKeywords", "excludedCategories", "priorities", "mode"]) if (msg.settings?.[key] !== undefined) settings[key] = msg.settings[key]; await browser.storage.local.set({settings}); browser.runtime.sendMessage({type:"wallsUpdated"}).catch(()=>{}); return true; }; const result=settingsWriteQueue.then(operation,operation); settingsWriteQueue=result.catch(()=>{}); return result; }
  if (msg.type === "saveWallSettings") { const operation = async () => { const current = await state(), wallId = msg.wallId; if (!current.walls.some(w => w.id === wallId)) throw new Error("Mur introuvable"); const { archiveRetentionDays, laterRetentionDays, ...wallPatch } = msg.settings || {}; const wallSettings = { ...current.wallSettings, [wallId]: { ...defaultWallSettings(), ...current.wallSettings[wallId], ...wallPatch } }; wallSettings[wallId].retentionDays = Math.max(1, Math.min(365, Number(wallSettings[wallId].retentionDays) || 3)); const stored = await browser.storage.local.get({settings:MMP.DEFAULTS.settings}); const settings = {...stored.settings}; if (archiveRetentionDays !== undefined) settings.archiveRetentionDays = Math.max(1,Math.min(365,Number(archiveRetentionDays)||2)); if (laterRetentionDays !== undefined) settings.laterRetentionDays = Math.max(1,Math.min(365,Number(laterRetentionDays)||90)); await browser.storage.local.set({ wallSettings, settings }); browser.runtime.sendMessage({ type: "wallsUpdated", activeWallId: current.activeWallId }).catch(() => {}); return true; }; const result = settingsWriteQueue.then(operation, operation); settingsWriteQueue = result.catch(() => {}); return result; }
  if (msg.type === "manageWalls") {
    const current = await state(), walls = [...current.walls], settings = { ...current.wallSettings }, sources = current.sources.map(s => ({ ...s, wallIds: [...(s.wallIds || [])] }));
    if (msg.action === "create") { const name = String(msg.name || "").trim(); if (!name) throw new Error("Saisissez un nom de mur."); if (walls.length >= MAX_WALLS) throw new Error(`La limite de ${MAX_WALLS} murs est atteinte.`); if (walls.some(w => MMP.normalizeText(w.name) === MMP.normalizeText(name))) throw new Error("Un mur porte déjà ce nom."); const wall = { id: wallId(name), name, order: walls.length, createdAt: Date.now() }; walls.push(wall); settings[wall.id] = { ...defaultWallSettings(), type: "standard" }; }
    else if (msg.action === "rename") { const wall = walls.find(w => w.id === msg.wallId), name = String(msg.name || "").trim(); if (!wall) throw new Error("Mur introuvable."); if (!name) throw new Error("Saisissez un nom de mur."); if (walls.some(w => w.id !== wall.id && MMP.normalizeText(w.name) === MMP.normalizeText(name))) throw new Error("Un mur porte déjà ce nom."); wall.name = name; }
    else if (msg.action === "delete") { if (walls.length <= 1) throw new Error("Le dernier mur ne peut pas être supprimé."); if (!walls.some(w => w.id === msg.wallId)) throw new Error("Mur introuvable."); const kept = walls.filter(w => w.id !== msg.wallId); for (const source of sources) { source.wallIds = source.wallIds.filter(id => id !== msg.wallId); if (!source.wallIds.length) source.wallIds = [kept[0].id]; } delete settings[msg.wallId]; walls.splice(0, walls.length, ...kept); }
    else if (msg.action === "move") { const index = walls.findIndex(w => w.id === msg.wallId), next = Number(msg.index); if (index < 0 || !Number.isInteger(next) || next < 0 || next >= walls.length) throw new Error("Ordre de murs invalide."); const [wall] = walls.splice(index, 1); walls.splice(next, 0, wall); }
    walls.forEach((w, i) => w.order = i); const activeWallId = walls.some(w => w.id === current.activeWallId) ? current.activeWallId : walls[0].id, defaultWallId = walls.some(w => w.id === current.defaultWallId) ? current.defaultWallId : walls[0].id; await browser.storage.local.set({ walls, activeWallId, defaultWallId, wallSettings: settings, sources }); browser.runtime.sendMessage({ type: "wallsUpdated", activeWallId }).catch(() => {}); if (msg.action === "delete") browser.runtime.sendMessage({ type: "sourcesUpdated" }).catch(() => {}); return true;
  }
  if (msg.type === "resolveBlueskyLink") { const article=await MMPDB.get(msg.articleId);if(!article?.atUri)return {error:"Cette carte n’est pas une publication Bluesky."};const resolved=await resolveStoredBlueskyLink(article);return {url:resolved.blueskyLink||"",title:resolved.blueskyLinkTitle||"",error:resolved.blueskyLink?"":"Aucun lien externe n’a été trouvé dans cette publication."}; }
  if (msg.type === "readArticle") {
    let article = await MMPDB.get(msg.articleId);
    if (!article) return { error: "Cet article n’est plus disponible dans le mur." };
    if(article.atUri){article=await resolveStoredBlueskyLink(article);if(!article.blueskyLink)return {error:"Aucun lien externe n’a été trouvé dans cette publication."};}
    if (article.atUri && article.blueskyLink) {
      let linkedUrl;try{linkedUrl=new URL(article.blueskyLink);if(!["https:","http:"].includes(linkedUrl.protocol)||linkedUrl.username||linkedUrl.password)throw new Error();}catch{return {error:"Le lien de cette publication n’est pas une adresse Web valide."};}
      if(article.readerVersion>=11&&article.readerLinkUrl===linkedUrl.href&&article.readerCachedAt&&(article.readerHtml||article.readerVideo))return {html:article.readerHtml||"",text:article.readerText||"",source:article.readerSource,video:article.readerVideo||null,image:article.image||"",cached:true,linkedArticleUrl:linkedUrl.href};
      try{if(!await accessible(linkedUrl.href))throw new Error("Autorisez l’accès à ce site dans Firefox pour charger l’article lié.");const content=await fetchReaderContent({...article,canonicalUrl:linkedUrl.href,sourceId:"",sourceIds:[]});content.readerLinkUrl=linkedUrl.href;await MMPDB.cacheReaderContent(article.id,content);return {...content,cached:false,linkedArticleUrl:linkedUrl.href};}catch(error){return {error:error.message||"Le contenu du lien ne peut pas être récupéré.",linkedArticleUrl:linkedUrl.href};}
    }
    const current = await state(), wall = current.walls.find(w=>w.id===current.activeWallId);let cinemaLookupAttempted=false;
    if (wall && articleCinemaEnabled(wall, article, current.wallSettings[wall.id])) {
      const cinema=await fetchCinemaDetails(article,wall).catch(()=>null);
      if(cinemaMetadataRecognized(cinema))return {cinema};
      cinemaLookupAttempted=true;
    }
    if (article.readerVersion >= 11 && article.readerCachedAt && (article.readerHtml || article.readerVideo)) {
      let image=article.readerImage||article.image||"";
      if(!image&&article.readerVersion<3){image=await fetchWordPressFeaturedImage(article).catch(()=>"");await MMPDB.cacheReaderContent(article.id,{html:article.readerHtml||"",text:article.readerText||"",source:article.readerSource,video:article.readerVideo||null,image,imageChecked:true});}
      const cinema=!cinemaLookupAttempted&&wall&&articleCinemaEnabled(wall,article,current.wallSettings[wall.id])?await fetchCinemaDetails(article,wall).catch(()=>article.cinema||null):null;
      return { html: article.readerHtml || "", text: article.readerText || "", source: article.readerSource, video: article.readerVideo || null, image, event: article.event || null, cinema, cached: true };
    }
    try {
      const content = await fetchReaderContent(article);
      await MMPDB.cacheReaderContent(article.id, content);
      const cinema=!cinemaLookupAttempted&&wall&&articleCinemaEnabled(wall,article,current.wallSettings[wall.id])?await fetchCinemaDetails(article,wall).catch(()=>article.cinema||null):null;
      return { ...content, cinema, cached: false };
    } catch (error) {
      const cinema=!cinemaLookupAttempted&&wall&&articleCinemaEnabled(wall,article,current.wallSettings[wall.id])?await fetchCinemaDetails(article,wall).catch(()=>article.cinema||null):null;
      return { html: readerFallback(article), text: article.summary || "", source: "résumé", error: error.message, cinema };
    }
  }
  if (msg.type === "eventDetails") {
    const article = await MMPDB.get(msg.articleId);
    if (!article) return { error: "Cet événement n’est plus disponible dans le mur." };
    if (article.event?.place && article.event?.timeText) return { event: article.event, cached: true };
    try { return { event: await fetchEventMetadata(article), cached: false }; }
    catch (error) { return { event: article.event || null, error: error.message }; }
  }
  if (msg.type === "refresh") return await refreshAll(msg.wallId || "", "Manuel");
  if (msg.type === "preview") {
    const pageUrl = MMP.cleanUrl(msg.pageUrl); if (!pageUrl) throw new Error("URL non prise en charge");
    const html = (typeof msg.pageHtml === "string" && msg.pageHtml) || await readOpenPage(msg.tabId, pageUrl) || (await fetchText(pageUrl)).text;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const links = await discoverFeedCandidates(pageUrl, html, msg.links || []);
    const expectedYouTubeChannelId = new URL(pageUrl).pathname.match(/^\/channel\/(UC[A-Za-z0-9_-]{22})(?:\/|$)/)?.[1] || "";
    const valid = [], feedDiagnostics = { candidates: links.length, paths: links.map(link => new URL(link.url).pathname).filter(path => /rss|atom|feed|flux/i.test(path)).slice(0,12), inaccessible: 0, checked: 0, failures: [] };
    for (let i = 0; i < links.slice(0, 24).length; i += 2) {
      const batch = links.slice(i, i + 2);
      const checked = await Promise.all(batch.map(async link => {
        try {
          if (!await accessible(link.url)) { feedDiagnostics.inaccessible++; return null; }
          feedDiagnostics.checked++;
          const result = await fetchText(link.url, 5000);
          let youtubeChannelName = "";
          if (expectedYouTubeChannelId) {
            const feedDoc = new DOMParser().parseFromString(result.text, "application/xml");
            const channelLink = [...feedDoc.getElementsByTagNameNS("http://www.w3.org/2005/Atom", "link")].find(node => node.getAttribute("rel") === "alternate");
            let feedChannelId = "";
            try { feedChannelId = new URL(channelLink?.getAttribute("href") || "").pathname.match(/^\/channel\/(UC[A-Za-z0-9_-]{22})(?:\/|$)/)?.[1] || ""; } catch {}
            if (feedChannelId !== expectedYouTubeChannelId) throw new Error("Le flux YouTube appartient à une autre chaîne que la page suivie.");
            youtubeChannelName = MMP.decodeHtmlEntities(feedDoc.getElementsByTagNameNS("http://www.w3.org/2005/Atom", "title")[0]?.textContent || "").trim();
          }
          let method = feedMethod(link.url, link.type);
          if (/application\/feed\+json|application\/json/i.test(result.type || "") || /^\s*\{/.test(result.text)) method = "jsonfeed";
          const entries = method === "jsonfeed" ? MMP.parseJsonFeed(result.text, link.url, {id:"preview"}) : MMP.parseFeed(result.text, link.url, {id:"preview"});
          if (entries.length) return { ...link, type: method, ...(youtubeChannelName ? { channelName: youtubeChannelName } : {}), count: entries.length, sample: entries.slice(0,3).map(a => a.title) };
          feedDiagnostics.failures.push(`${new URL(link.url).pathname}: flux vide`); return null;
        } catch (error) { feedDiagnostics.failures.push(`${new URL(link.url).pathname}: ${String(error?.message || error).slice(0,100)}`); return null; }
      }));
      valid.push(...checked.filter(Boolean));
    }
    let htmlCount = MMP.parseHtmlArticles(html, pageUrl, {id:"preview"}).length;
    return { pageUrl, title: doc.querySelector('meta[property="og:site_name"]')?.content || doc.title || new URL(pageUrl).hostname, feeds: valid, htmlCount, feedDiagnostics };
  }
  if (msg.type === "addSource") {
    const current = await state(), source = msg.source, selected = [...new Set(msg.wallIds || [current.activeWallId])];
    if (!source?.pageUrl || !source?.name) throw new Error("Source incomplète");
    if (source.feedUrl) source.method = feedMethod(source.feedUrl, source.method || "");
    if (!selected.length || selected.some(id => !current.walls.some(w => w.id === id))) throw new Error("Choisissez au moins un mur valide.");
    source.id = MMP.stableId(source.pageUrl + "|" + (source.feedUrl || "html"));
    const existing = current.sources.find(s => s.id === source.id);
    if (existing) { existing.wallIds = [...new Set([...(existing.wallIds || []), ...selected])]; await browser.storage.local.set({ sources: current.sources }); browser.runtime.sendMessage({ type: "articlesUpdated" }).catch(() => {}); browser.runtime.sendMessage({ type: "sourcesUpdated" }).catch(() => {}); return existing; }
    if (!source.pageHtml) source.pageHtml = await readOpenPage(source.pageTabId, source.pageUrl);
    source.enabled = true; source.addedAt = Date.now(); source.wallIds = selected;
    const cinemaPolicy=sourceCinemaPolicy({...source,wallIds:selected},current);
    let selectedSource = source, check, articleAccess, validationError;
    try {
      check = await fetchSource(selectedSource, new Map(), [], cinemaPolicy);
      if (check.error) throw new Error(check.error);
      if (!check.articles.length) throw new Error("Le flux ne contient aucune fiche exploitable.");
      articleAccess = await validateArticleAccess(selectedSource, check.articles, cinemaPolicy.force && !cinemaPolicy.disabled);
    } catch (error) { validationError = error; }
    // A feed can parse correctly while linking to pages that cannot be used.
    // In that case, try the page's repeated HTML cards before rejecting it.
    if ((validationError || articleAccess?.needsPermission) && source.method !== "html") {
      const htmlSource = { ...source, method: "html", feedUrl: "" };
      selectedSource = htmlSource;
      try {
        const htmlCheck = await fetchSource(htmlSource, new Map(), [], cinemaPolicy);
        if (htmlCheck.error) throw new Error(htmlCheck.error);
        if (!htmlCheck.articles.length) throw new Error("Aucun article HTML exploitable.");
        const htmlAccess = await validateArticleAccess(htmlSource, htmlCheck.articles, cinemaPolicy.force && !cinemaPolicy.disabled);
        check = htmlCheck; articleAccess = htmlAccess; selectedSource = htmlSource; validationError = null;
      } catch (error) {
        // Keep the feed error when both strategies fail; it has the most
        // useful detail for the method the user selected.
        if (!validationError && !articleAccess?.needsPermission) validationError = error;
      }
    }
    // Preview and confirmation are separate requests. If HTML worked during
    // preview but no longer produces cards at confirmation time, rediscover
    // the publisher's feed before failing the subscription.
    if ((validationError || articleAccess?.needsPermission || check?.extractionProfile?.refreshable === false) && selectedSource.method === "html") {
      let feedChecks = 0;
      const feedFailures = [];
      try {
        const { text: homepage } = await fetchText(source.pageUrl);
        const discovered = await discoverFeedCandidates(source.pageUrl, homepage, source.feedCandidates || []);
        const feeds = discovered.map(item => ({ feedUrl: item.url, method: feedMethod(item.url, item.type) }));
        const seen = new Set();
        for (const feed of feeds) {
          if (!feed.feedUrl || feed.feedUrl === source.pageUrl || seen.has(feed.feedUrl)) continue;
          seen.add(feed.feedUrl);
          const feedSource = { ...source, ...feed };
          if (!await accessible(feed.feedUrl)) {
            selectedSource = feedSource; articleAccess = { needsPermission: new URL(feed.feedUrl).origin }; validationError = null; break;
          }
          feedChecks++;
          try {
            const feedCheck = await fetchSource(feedSource, new Map(), [], cinemaPolicy);
            const feedUrl = new URL(feed.feedUrl);
            const safeQuery = [...feedUrl.searchParams].map(([key, value]) => `${key}=${/token|secret|key|auth|pass|session|sig/i.test(key) ? "[masqué]" : value}`).join("&");
            const feedLabel = `${feedUrl.pathname}${safeQuery ? `?${safeQuery}` : ""}`;
            if (feedCheck.error) { feedFailures.push(`${feedLabel}: ${feedCheck.error}`); continue; }
            if (!feedCheck.articles.length) { feedFailures.push(`${feedLabel}: flux vide`); continue; }
            const feedAccess = await validateArticleAccess(feedSource, feedCheck.articles, cinemaPolicy.force && !cinemaPolicy.disabled);
            check = feedCheck; articleAccess = feedAccess; selectedSource = feedSource; validationError = null;
            if (!feedAccess?.needsPermission) break;
          } catch (error) {
            const failedUrl = new URL(feed.feedUrl);
            const safeQuery = [...failedUrl.searchParams].map(([key, value]) => `${key}=${/token|secret|key|auth|pass|session|sig/i.test(key) ? "[masqué]" : value}`).join("&");
            feedFailures.push(`${failedUrl.pathname}${safeQuery ? `?${safeQuery}` : ""}: ${error.message || error}`);
          }
        }
      } catch {}
      if (validationError) {
        const detail = feedChecks ? `Flux RSS testés (${feedChecks}) : ${feedFailures[0] || "aucune fiche accessible"}.` : "Aucun flux RSS candidat n’a été reçu ou trouvé sur la page.";
        validationError = new Error(`${validationError.message}. ${detail}`);
      }
    }
    if (validationError) throw validationError;
    if (articleAccess?.needsPermission) return { needsPermission: articleAccess.needsPermission };
    const selectedId = MMP.stableId(source.pageUrl + "|" + (selectedSource.feedUrl || "html"));
    const selectedExisting = current.sources.find(item => item.id === selectedId);
    if (selectedExisting) {
      selectedExisting.wallIds = [...new Set([...(selectedExisting.wallIds || []), ...selected])];
      await browser.storage.local.set({ sources: current.sources });
      browser.runtime.sendMessage({ type: "articlesUpdated" }).catch(() => {});
      browser.runtime.sendMessage({ type: "sourcesUpdated" }).catch(() => {});
      return selectedExisting;
    }
    source.id = selectedId;
    delete source.feedCandidates;
    delete source.pageHtml;
    delete source.pageTabId;
    Object.assign(source, await discoverFavicon(source.pageUrl));
    await MMPDB.pruneSourceHistory(Date.now() - SOURCE_URL_HISTORY_DAYS * 86400000);
    const sourceArticles = check.articles.map(article => ({ ...article, sourceId: selectedId })), previousSuccessfulSync = await MMPDB.sourceSync(selectedId), rows = await sourceRowsToPersist(selectedId, sourceArticles, previousSuccessfulSync);
    await MMPDB.putMany(rows);
    await MMPDB.rememberSourceArticles(selectedId, sourceArticles, { ...sourceHistoryMetadata(source, check.method, "Manuel"), acquiredCanonicalUrls: rows.map(row => row.canonicalUrl) });
    if (check.method === "html") await clearOrphanedReadingStates(await MMPDB.reconcileSourceArticles(source.id, sourceArticles), source.id, sourceArticles);
    source.method = check.method;
    source.feedUrl = selectedSource.feedUrl || "";
    source.extractionProfile = check.extractionProfile || (check.method === "html" ? null : structuredExtractionProfile(source, sourceArticles));
    source.lastExtractionDiagnostics = check.extractionDiagnostics || null;
    source.enabled = source.extractionProfile?.refreshable !== false;
    source.status = "ok";
    source.lastSync = Date.now();
    source.lastSuccessfulSync = source.lastSync;
    await MMPDB.setSourceSync(selectedId, source.lastSync);
    source.lastArticleAt = Math.max(...sourceArticles.map(a => a.publishedAt));
    await browser.storage.local.set({ sources: [...current.sources, source] }); browser.runtime.sendMessage({ type: "sourcesUpdated" }).catch(() => {}); return source;
  }
  if (msg.type === "saveSettings") { const current = await state(), { retentionDays, archiveRetentionDays, laterRetentionDays, ...wall } = msg.settings, stored = await browser.storage.local.get({ settings: MMP.DEFAULTS.settings }); const wallSettings = { ...current.wallSettings, [current.activeWallId]: { ...defaultWallSettings(), ...wall } }; await browser.storage.local.set({ settings: { ...stored.settings, retentionDays: Math.max(1, Number(retentionDays ?? stored.settings.retentionDays) || 30), archiveRetentionDays: Math.max(1, Number(archiveRetentionDays ?? stored.settings.archiveRetentionDays ?? retentionDays) || 2), laterRetentionDays: Math.max(1, Number(laterRetentionDays ?? stored.settings.laterRetentionDays ?? retentionDays) || 90) }, wallSettings }); return true; }
  if (msg.type === "setSourceWalls") { const current = await state(), source = current.sources.find(s => s.id === msg.sourceId), wallIds = [...new Set(msg.wallIds || [])]; if (!source) throw new Error("Source introuvable."); if (!wallIds.length || wallIds.some(id => !current.walls.some(w => w.id === id))) throw new Error("Choisissez au moins un mur valide."); source.wallIds = wallIds; await browser.storage.local.set({ sources: current.sources }); browser.runtime.sendMessage({ type: "articlesUpdated" }).catch(() => {}); browser.runtime.sendMessage({ type: "sourcesUpdated" }).catch(() => {}); return source; }
  if (msg.type === "saveSources") { const current = await state(), valid = new Set(current.walls.map(w => w.id)); for (const source of msg.sources) if (!source.wallIds?.length || source.wallIds.some(id => !valid.has(id))) throw new Error("Chaque source doit être associée à au moins un mur valide."); const retained = new Set(msg.sources.map(source => source.id)); for (const source of current.sources) if (!retained.has(source.id)) await clearOrphanedReadingStates(await MMPDB.reconcileSourceArticles(source.id), source.id); await browser.storage.local.set({ sources: msg.sources }); browser.runtime.sendMessage({ type: "articlesUpdated" }).catch(() => {}); browser.runtime.sendMessage({ type: "sourcesUpdated" }).catch(() => {}); return true; }
})().catch(e => ({ error: e.message || String(e) })));
browser.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) refreshAll().catch(console.error); });
async function init() {
  // state() normalizes and persists the global settings and per-wall settings.
  // Its returned `settings` also contains the active wall's filters and mode;
  // writing that merged view back as global settings would mix the two scopes.
  const current = await state(); await ensureSocialRefreshBaseline(); await browser.storage.local.remove("pendingDiscoveries"); await ensureProcessedDiscoveryMemory(current.sources); await cleanReadingStates(); await restoreAutomaticSocialSnapshots(); await saveAutomaticSocialSnapshots();
  // A newly started background context cannot still own the refresh recorded
  // by its predecessor. Clear that abandoned in-progress marker so the stale
  // refresh check below can resume collection immediately.
  const { refreshStatus = {} } = await browser.storage.local.get({ refreshStatus: {} });
  if (refreshStatus.startedAt && !refreshStatus.completedAt) {
    await browser.storage.local.set({ refreshStatus: { ...refreshStatus, startedAt: 0, completedAt: 0, currentSourceIds: [] } });
  }
  for (const source of current.sources) if (!(await MMPDB.sourceSync(source.id))) { const lastSuccessfulSync = Number(source.lastSuccessfulSync) || Number(source.lastSync) || 0; if (lastSuccessfulSync) await MMPDB.setSourceSync(source.id, lastSuccessfulSync); }
  const alarm = await browser.alarms.get(ALARM);
  const interval = await refreshInterval();
  if (!alarm || alarm.periodInMinutes !== interval) {
    if (alarm) await browser.alarms.clear(ALARM);
    await browser.alarms.create(ALARM, { periodInMinutes: interval });
  }
  if (!current.lastCleanup) await browser.storage.local.set({ lastCleanup: Date.now() });
  try { await refreshIfStale(); } catch (error) { console.error("Actualisation au démarrage impossible", error); }
}
browser.runtime.onStartup.addListener(() => init().catch(console.error));
browser.runtime.onInstalled.addListener(details => {
  (async () => {
    // Firefox may report a temporary extension reload as an install. Capture
    // the configuration before init() migrates a fresh profile to default walls.
    const beforeInit = await browser.storage.local.get({ walls: [], sources: [] });
    const needsOnboarding = details.reason === "install"
      && !(beforeInit.walls || []).length
      && !(beforeInit.sources || []).length;
    await init();
    if (needsOnboarding) {
      await browser.tabs.create({ url: browser.runtime.getURL("settings.html?onboarding=1") });
    }
  })().catch(error => console.error("Initialisation de Mon Mur impossible", error));
});

// Local BlazeFace inference used by the optional image filter. Image bytes and
// detections stay in the extension; no third-party inference service is used.
let faceDetectorPromise;
async function faceDetector() {
  if (!faceDetectorPromise) faceDetectorPromise = (async () => {
    const vision = await import(browser.runtime.getURL("vendor/vision_bundle.mjs"));
    const files = await vision.FilesetResolver.forVisionTasks(browser.runtime.getURL("vendor/wasm"));
    return vision.FaceDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: browser.runtime.getURL("models/blaze_face_short_range.tflite"), delegate: "CPU" },
      runningMode: "IMAGE", minDetectionConfidence: 0.3
    });
  })().catch(error => { faceDetectorPromise = null; throw error; });
  return faceDetectorPromise;
}
async function detectFaceImage(imageUrl) {
  return (async () => {
    const url = new URL(String(imageUrl || ""));
    if (!["http:", "https:"].includes(url.protocol) || !(await accessible(url.href))) throw new Error("Autorisation d’accès à cette image requise");
    const response = await fetch(url.href, { credentials: "omit", redirect: "follow" });
    if (!response.ok || !(await accessible(response.url || url.href))) throw new Error("Image inaccessible sans autorisation du site");
    const type = (response.headers.get("content-type") || "").split(";")[0];
    if (!type.startsWith("image/")) throw new Error("La ressource n’est pas une image");
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > 12 * 1024 * 1024) throw new Error("Image trop volumineuse");
    const bitmap = await createImageBitmap(new Blob([buffer], { type }));
    const width = bitmap.width, height = bitmap.height;
    let detections;
    try { detections = (await faceDetector()).detect(bitmap).detections || []; }
    finally { bitmap.close(); }
    const faces = detections.map(item => {
      const b = item.boundingBox;
      return { x: b.originX, y: b.originY, width: b.width, height: b.height, score: item.categories?.[0]?.score || 0 };
    });
    const bytes = new Uint8Array(buffer), chunks = [];
    for (let i = 0; i < bytes.length; i += 16384) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
    return { ok: true, data: `data:${type};base64,${btoa(chunks.join(""))}`, width, height, faces };
  })().catch(error => ({ ok: false, error: String(error?.message || error) }));
}
