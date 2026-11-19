"use strict";
const MMPDB = (() => {
  const NAME = "mon-mur-presse", VERSION = 8;
  let opening, connection;
  function forgetConnection(db) {
    if (connection !== db) return;
    connection = null;
    opening = null;
  }
  function open() {
    if (connection) {
      // Firefox can close an IndexedDB connection while the extension is
      // suspended. The resolved `opening` promise used to keep handing that
      // closed connection back to every later operation.
      try {
        connection.transaction("sourceSync", "readonly");
        return Promise.resolve(connection);
      } catch {
        forgetConnection(connection);
      }
    }
    if (opening) return opening;
    const pending = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = event => {
        const db = req.result, upgradeTx = event.target.transaction;
        if (!db.objectStoreNames.contains("articles")) {
          const store = db.createObjectStore("articles", { keyPath: "id" });
          store.createIndex("publishedAt", "publishedAt");
          store.createIndex("sourceId", "sourceId");
          store.createIndex("canonicalUrl", "canonicalUrl", { unique: false });
        }
        if (!db.objectStoreNames.contains("likes")) {
          const likes = db.createObjectStore("likes", { keyPath: "normalizedUrl" });
          likes.createIndex("likedAt", "likedAt");
        }
        const history = db.objectStoreNames.contains("sourceHistory")
          ? upgradeTx.objectStore("sourceHistory")
          : db.createObjectStore("sourceHistory", { keyPath: ["sourceId", "canonicalUrl"] });
        if (!history.indexNames.contains("firstSeenAt")) history.createIndex("firstSeenAt", "firstSeenAt");
        if (!history.indexNames.contains("lastSeenAt")) history.createIndex("lastSeenAt", "lastSeenAt");
        const cursorRequest = history.openCursor(), migratedAt = Date.now();
        cursorRequest.onsuccess = () => { const cursor = cursorRequest.result; if (!cursor) return; const firstSeenAt = Number(cursor.value.firstSeenAt || cursor.value.lastSeenAt) || migratedAt; cursor.update({ ...cursor.value, firstSeenAt, lastSeenAt: Number(cursor.value.lastSeenAt) || firstSeenAt }); cursor.continue(); };
        if (!db.objectStoreNames.contains("sourceSync")) db.createObjectStore("sourceSync", { keyPath: "sourceId" });
        if (!db.objectStoreNames.contains("expiredArticles")) db.createObjectStore("expiredArticles", { keyPath: "canonicalUrl" });
      };
      req.onsuccess = () => {
        const db = req.result;
        connection = db;
        db.onclose = () => forgetConnection(db);
        db.onversionchange = () => {
          db.close();
          forgetConnection(db);
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
    opening = pending;
    pending.catch(() => { if (opening === pending) opening = null; });
    return pending;
  }
  async function transaction(store, mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode), req = action(tx.objectStore(store));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = tx.onabort = () => reject(tx.error || req?.error);
    });
  }
  function retainByAge(article, cutoff, preservedSourceIds = [], preservedArticleIds = []) {
    const sourceIds = article.sourceIds || [article.sourceId];
    return Number(article.publishedAt || 0) > cutoff || preservedArticleIds.includes(article.id) || sourceIds.some(id => preservedSourceIds.includes(id));
  }
  return {
    retainByAge,
    async reset() {
      const db = await open();
      const stores = [...db.objectStoreNames];
      return new Promise((resolve, reject) => {
        const tx = db.transaction(stores, "readwrite");
        for (const name of stores) tx.objectStore(name).clear();
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    },
    async sourceHistory(sourceId, urls) {
      const unique = [...new Set(urls.filter(Boolean))];
      if (!unique.length) return new Set();
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("sourceHistory", "readonly"), store = tx.objectStore("sourceHistory"), seen = new Set();
        for (const canonicalUrl of unique) {
          const req = store.get([sourceId, canonicalUrl]);
          req.onsuccess = () => { if (req.result) seen.add(canonicalUrl); };
        }
        tx.oncomplete = () => resolve(seen);
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    },
    async expiredArticleUrls(urls) {
      const unique = [...new Set(urls.filter(Boolean))];
      if (!unique.length) return new Set();
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("expiredArticles", "readonly"), store = tx.objectStore("expiredArticles"), expired = new Set();
        for (const canonicalUrl of unique) { const req = store.get(canonicalUrl); req.onsuccess = () => { if (req.result) expired.add(canonicalUrl); }; }
        tx.oncomplete = () => resolve(expired); tx.onerror = tx.onabort = () => reject(tx.error);
      });
    },
    async rememberSourceArticles(sourceId, rows, metadata = {}) {
      const unique = [...new Set(rows.map(row => row.canonicalUrl).filter(Boolean))];
      if (!unique.length) return;
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("sourceHistory", "readwrite"), store = tx.objectStore("sourceHistory");
        const firstSeenAt = Date.now(), rowsByUrl = new Map(rows.filter(row => row.canonicalUrl).map(row => [row.canonicalUrl, row]));
        for (const canonicalUrl of unique) {
          const req = store.get([sourceId, canonicalUrl]);
          req.onsuccess = () => {
            const old = req.result || {};
            store.put({ ...old, sourceId, canonicalUrl, firstSeenAt: Number(old.firstSeenAt) || firstSeenAt, lastSeenAt: firstSeenAt,
              title: rowsByUrl.get(canonicalUrl)?.title || old.title || "",
              sourceType: metadata.sourceType || old.sourceType || "",
              sourceName: metadata.sourceName || old.sourceName || "",
              wallIds: metadata.wallIds || old.wallIds || [], acquisitionMode: old.acquisitionMode || metadata.acquisitionMode || "",
              acquired: Array.isArray(metadata.acquiredCanonicalUrls) ? metadata.acquiredCanonicalUrls.includes(canonicalUrl) || old.acquired === true : old.acquired });
          };
        }
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    },
    async pruneSourceHistory(cutoff) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("sourceHistory", "readwrite"), req = tx.objectStore("sourceHistory").index("lastSeenAt").openCursor(IDBKeyRange.upperBound(cutoff));
        req.onsuccess = () => { const cursor = req.result; if (!cursor) return; cursor.delete(); cursor.continue(); };
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(tx.error || req.error);
      });
    },
    async sourceHistoryRows() {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("sourceHistory", "readonly"), req = tx.objectStore("sourceHistory").getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },
    async sourceSync(sourceId) {
      const row = await transaction("sourceSync", "readonly", store => store.get(sourceId));
      return Number(row?.lastSuccessfulSync) || 0;
    },
    async setSourceSync(sourceId, lastSuccessfulSync) {
      return transaction("sourceSync", "readwrite", store => store.put({ sourceId, lastSuccessfulSync }));
    },
    async removeArticles(ids) {
      const unique = [...new Set(ids.filter(Boolean))];
      if (!unique.length) return;
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(["articles", "expiredArticles"], "readwrite"), store = tx.objectStore("articles"), expired = tx.objectStore("expiredArticles");
        for (const id of unique) { const req = store.get(id); req.onsuccess = () => { if (req.result?.canonicalUrl) expired.put({ canonicalUrl: req.result.canonicalUrl, expiredAt: Date.now() }); store.delete(id); }; }
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    },
    async putMany(rows) {
      if (!rows.length) return;
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("articles", "readwrite"), store = tx.objectStore("articles"), request = store.getAll();
        request.onsuccess = () => {
          const byUrl = new Map(request.result.map(a => [a.canonicalUrl, a])), byId = new Map(request.result.map(a => [a.id, a]));
          for (const incoming of rows) {
            const old = byUrl.get(incoming.canonicalUrl) || byId.get(incoming.id);
            if (old) {
              old.sourceIds = [...new Set([...(old.sourceIds || [old.sourceId]), incoming.sourceId])];
              if (incoming.title && incoming.title.length < old.title.length) old.title = incoming.title;
              if (old.dateIsFallback && !incoming.dateIsFallback) { old.publishedAt = incoming.publishedAt; old.dateIsFallback = false; }
              else if (!incoming.dateIsFallback && incoming.datePrecision === "instant" && old.datePrecision === "day") { old.publishedAt = incoming.publishedAt; old.datePrecision = "instant"; }
              if (incoming.dateIsFallback && old.dateIsFallback) old.publishedAt = old.discoveredAt || old.publishedAt;
              if (incoming.replaceImage) { old.image = incoming.image || ""; delete old.readerImage; delete old.imageQualityCheckImage; delete old.imageQualityCheckedAt; }
              else if (incoming.feedImageFallbackUrl && old.image === incoming.feedImageFallbackUrl) old.image = incoming.image || "";
              else if (!old.image && incoming.image) old.image = incoming.image;
              delete old.replaceImage;
              if (!old.summary && incoming.summary) old.summary = incoming.summary;
              if (incoming.summary && incoming.summary.length > (old.summary || "").length) old.summary = incoming.summary;
              if (incoming.categories?.length) old.categories = [...new Set([...(old.categories || []), ...incoming.categories])];
              if (incoming.cinemaHint !== undefined) old.cinemaHint = !!incoming.cinemaHint;
              if (incoming.cinema && (!old.cinema || old.cinema.status || old.cinema.source === "linked-page" && incoming.cinema.source !== "linked-page")) old.cinema = incoming.cinema;
              if (incoming.cinemaCheckedAt) old.cinemaCheckedAt = incoming.cinemaCheckedAt;
              if (incoming.cinemaCatalogCheckedAt) old.cinemaCatalogCheckedAt = incoming.cinemaCatalogCheckedAt;
              if (Number.isInteger(incoming.sourceOrder)) { old.sourceOrder = incoming.sourceOrder; old.sourceOrderSourceId = incoming.sourceOrderSourceId || incoming.sourceId; }
              if (incoming.event) old.event = { ...(old.event || {}), ...incoming.event };
              if (incoming.blueskyTopics?.length) old.blueskyTopics = [...new Set([...(old.blueskyTopics || []), ...incoming.blueskyTopics])];
              for (const key of ["linkedinPublisherUrl", "linkedinPublisher", "linkedinAuthor", "googleNewsGuid", "googleNewsDate", "linkedinDateLabelSource", "linkedinDedupeKey", "linkedinContentPartial", "linkedinOriginalUrl", "linkedinActivityUrn"]) if (incoming[key] !== undefined) old[key] = incoming[key];
              if (incoming.linkedinKeywords?.length) old.linkedinKeywords = [...new Set([...(old.linkedinKeywords || []), ...incoming.linkedinKeywords])];
              if (incoming.atUri) old.canonicalUrl = incoming.canonicalUrl;
              byUrl.set(incoming.canonicalUrl, old); byId.set(old.id, old);
              store.put(old);
            } else {
              const stored = { ...incoming, sourceIds: [incoming.sourceId] };
              delete stored.feedContentHtml; delete stored.feedImageFallbackUrl; delete stored.replaceImage;
              byUrl.set(incoming.canonicalUrl, stored); byId.set(stored.id, stored); store.put(stored);
            }
          }
        };
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
      });
    },
    async reconcileSourceArticles(sourceId, incomingRows = []) {
      const keep = new Set(incomingRows.map(row => row.canonicalUrl));
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("articles", "readwrite"), store = tx.objectStore("articles"), request = store.getAll(), removed = [];
        request.onsuccess = () => {
          for (const article of request.result) {
            const sourceIds = article.sourceIds || [article.sourceId];
            if (!sourceIds.includes(sourceId) || keep.has(article.canonicalUrl)) continue;
            const remaining = sourceIds.filter(id => id !== sourceId);
            if (remaining.length) {
              article.sourceIds = remaining;
              if (article.sourceId === sourceId) article.sourceId = remaining[0];
              store.put(article);
            } else {
              removed.push(article.id);
              store.delete(article.id);
            }
          }
        };
        tx.oncomplete = () => resolve(removed);
        tx.onerror = tx.onabort = () => reject(tx.error || request.error);
      });
    },
    get: id => transaction("articles", "readonly", s => s.get(id)),
    async cacheEventMetadata(id, event) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("articles", "readwrite"), store = tx.objectStore("articles"), req = store.get(id);
        req.onsuccess = () => {
          if (!req.result) { tx.abort(); return; }
          req.result.event = { ...(req.result.event || {}), ...(event || {}) };
          if (!req.result.summary && event?.description) req.result.summary = event.description;
          store.put(req.result);
        };
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || req.error);
      });
    },
    async cacheCinemaMetadata(id, cinema) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("articles", "readwrite"), store = tx.objectStore("articles"), req = store.get(id);
        req.onsuccess = () => { if (!req.result) { tx.abort(); return; } req.result.cinema = cinema || null; store.put(req.result); };
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || req.error);
      });
    },
    async cacheReaderContent(id, content) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("articles", "readwrite"), store = tx.objectStore("articles"), req = store.get(id);
        req.onsuccess = () => {
          if (!req.result) { tx.abort(); return; }
          Object.assign(req.result, { readerHtml: content.html, readerText: content.text, readerSource: content.source, readerVideo: content.video || null, readerVersion: 11, readerCachedAt: Date.now(), readerImageChecked: content.imageChecked !== false });
          if (content.readerLinkUrl) req.result.readerLinkUrl = content.readerLinkUrl;
          if (content.event) req.result.event = { ...(req.result.event || {}), ...content.event };
          if (!req.result.summary && content.event?.description) req.result.summary = content.event.description;
          if (content.image) { req.result.image = content.image; req.result.readerImage = content.image; }
          store.put(req.result);
        };
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || req.error);
      });
    },
    async cacheAffiliateFindings(id, findings) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("articles", "readwrite"), store = tx.objectStore("articles"), req = store.get(id);
        req.onsuccess = () => { if (!req.result) { tx.abort(); return; } req.result.affiliateFindings = Array.isArray(findings) ? findings.slice(0, 32) : []; store.put(req.result); };
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || req.error);
      });
    },
    all: () => transaction("articles", "readonly", s => s.getAll()),
    likes: () => transaction("likes", "readonly", s => s.getAll()),
    async setLike(record) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("likes", "readwrite"), store = tx.objectStore("likes");
        const request = store.get(record.normalizedUrl);
        request.onsuccess = () => request.result ? store.delete(record.normalizedUrl) : store.put(record);
        tx.oncomplete = () => resolve(!request.result);
        tx.onerror = tx.onabort = () => reject(tx.error || request.error);
      });
    },
    async removeLike(normalizedUrl) { return transaction("likes", "readwrite", s => s.delete(normalizedUrl)); },
    async removeExpiredLikes(cutoff) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("likes", "readwrite"), req = tx.objectStore("likes").index("likedAt").openCursor(IDBKeyRange.upperBound(cutoff)), removed = [];
        req.onsuccess = () => { const cursor = req.result; if (cursor) { removed.push(cursor.value.normalizedUrl); cursor.delete(); cursor.continue(); } };
        tx.oncomplete = () => resolve(removed); tx.onerror = tx.onabort = () => reject(tx.error || req.error);
      });
    },
    async removeOlderThan(cutoff, preservedSourceIds = [], preservedArticleIds = []) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(["articles", "expiredArticles"], "readwrite"), expired = tx.objectStore("expiredArticles"), req = tx.objectStore("articles").index("publishedAt").openCursor(IDBKeyRange.upperBound(cutoff));
        req.onsuccess = () => { const c = req.result; if (c) { if (retainByAge(c.value, cutoff, preservedSourceIds, preservedArticleIds)) { c.continue(); return; } if (c.value?.canonicalUrl) expired.put({ canonicalUrl: c.value.canonicalUrl, expiredAt: Date.now() }); c.delete(); c.continue(); } };
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
      });
    }
  };
})();
