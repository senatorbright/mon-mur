"use strict";
(() => {
  const cache = new Map(), MAX_CACHE = 1200;
  const clean = value => String(value || "")
    .replace(/<[^>]*>/gu, " ")
    .replace(/\b(?:https?:\/\/|www\.)[^\s<>]+/giu, " ")
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/giu, " ")
    .replace(/[\u200B-\u200D\uFEFF]/gu, " ")
    .replace(/\s+/gu, " ").trim().slice(0, 4000);
  async function detect(text) {
    const input = clean(text);
    if (!input || !/[\p{L}]{2}/u.test(input)) return "und";
    if (cache.has(input)) return cache.get(input);
    const pending = (async () => {
      try {
        const result = await browser.i18n.detectLanguage(input);
        if (!result?.isReliable || !Array.isArray(result.languages) || !result.languages.length) return "und";
        const dominant = result.languages[0]?.language;
        return typeof dominant === "string" && dominant ? dominant.toLowerCase().split(/[-_]/u)[0] : "und";
      } catch { return "und"; }
    })();
    cache.set(input, pending);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    return pending;
  }
  window.MMLanguageDetection = Object.freeze({ clean, detect });
})();
