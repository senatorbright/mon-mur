"use strict";

// Local, auditable signatures. Keep weak marketing parameters out of the
// recognized rules; they are reported separately as unconfirmed signals.
(() => {
  const rules = [
    { id: "amazon-tag", label: "Paramètre de suivi Amazon (tag)", test: url => /(^|\.)amazon\.[a-z.]+$/i.test(url.hostname) && url.searchParams.has("tag") },
    { id: "amazon-short-link", label: "Lien court Amazon utilisé pour le suivi partenaire", test: url => /(^|\.)amzn\.to$/i.test(url.hostname) },
    { id: "amazon-creator-short-link", label: "Lien court Amazon Creator Connections", test: url => /(^|\.)amzlink\.to$/i.test(url.hostname) },
    { id: "amazon-influencer-storefront", label: "Boutique Amazon d’un créateur avec paramètres d’attribution", test: url => /(^|\.)amazon\.[a-z.]+$/i.test(url.hostname) && /^\/shop\/[^/]+(?:\/|$)/i.test(url.pathname) && (url.searchParams.has("ascsubtag") || /aipsfshop/i.test(url.searchParams.get("ref_") || "")) },
    { id: "aliexpress-tracking", label: "Lien de suivi commercial AliExpress", test: url => /(^|\.)s\.click\.aliexpress\.com$/i.test(url.hostname) },
    { id: "explicit-affiliate-id", label: "Paramètre explicite d’identifiant affilié", test: url => ["aff_id", "affiliate_id", "affiliateid", "affid", "partner_affiliate_id"].some(key => url.searchParams.has(key)) },
    { id: "utm-affiliate-attribution", label: "Paramètres UTM explicites d’affiliation", test: url => /^(?:affiliate|influencer|creator)$/i.test(url.searchParams.get("utm_medium") || "") && /^aff(?:iliate)?[-_]?\d+$/i.test(url.searchParams.get("utm_source") || ""), evidence: url => [`utm_medium=${url.searchParams.get("utm_medium")}`, `utm_source=${url.searchParams.get("utm_source")}`] },
    { id: "youtube-description-campaign", label: "Lien de campagne suivi depuis une description YouTube", test: url => /^youtube$/i.test(url.searchParams.get("utm_source") || "") && /^(?:videodesc|video[-_ ]?description|description)$/i.test(url.searchParams.get("utm_medium") || "") && Boolean(url.searchParams.get("utm_campaign") && url.searchParams.get("utm_content")) },
    { id: "igraal-referral", label: "Lien de parrainage iGraal", test: url => /(^|\.)igraal\.com$/i.test(url.hostname) && /\/parrainage\/?$/i.test(url.pathname) && url.searchParams.has("parrain") },
    { id: "awin", label: "Lien de suivi Awin", test: url => /(^|\.)awin1\.com$/i.test(url.hostname) && /^(?:cread\.php|click\.php)$/i.test(url.pathname.split("/").pop()) && (url.searchParams.has("awinmid") || url.searchParams.has("awinaffid")) },
    { id: "shareasale", label: "Lien de suivi ShareASale", test: url => /(^|\.)shareasale\.com$/i.test(url.hostname) && /^(?:r\.cfm|r\.html)$/i.test(url.pathname.split("/").pop()) && url.searchParams.has("u") },
    { id: "rakuten-linkshare", label: "Lien de suivi Rakuten Advertising (LinkShare)", test: url => /(^|\.)linksynergy\.com$/i.test(url.hostname) && url.searchParams.has("id") && url.searchParams.has("offerid") },
    { id: "impact", label: "Lien de suivi Impact", test: url => /(^|\.)impact\.com$/i.test(url.hostname) && /^(?:click|campaign-promo)$/i.test(url.pathname.split("/").filter(Boolean).pop() || "") && [...url.searchParams.keys()].some(key => /^(?:irclickid|irgwc|subid|sharedid)$/i.test(key)) },
    { id: "partnerize", label: "Lien de suivi Partnerize", test: url => /(^|\.)(?:prf\.hn|pntrs\.com)$/i.test(url.hostname) },
    { id: "tiddly", label: "Lien court d’affiliation Tidd.ly", test: url => /(^|\.)tidd\.ly$/i.test(url.hostname) }
  ];
  // Short referral keys are common in creator links, but are too ambiguous
  // to confirm affiliation on their own. Keep them as reviewable findings.
  const weakKeys = new Set(["r", "ref", "referrer", "source", "via", "aff", "affiliate", "partner", "campaign"]);
  const commercialCopy = /\b(?:code(?:\s+(?:promo(?:tionnel)?|de\s+réduction))?|coupon|réduction|remise|promotion|promo|profitez|offre)\b|(?:-\s?\d{1,2}\s?%)/iu;

  function classify(raw) {
    let url;
    // Descriptions can contain URL text copied from HTML or Markdown. Decode
    // only the query separators for matching; keep the original URL string in
    // the finding and in the rendered link.
    const candidate = String(raw).replace(/\\&/gu, "&").replace(/&amp;/giu, "&").replace(/&#0*38;/giu, "&").replace(/&#x0*26;/giu, "&");
    try { url = new URL(candidate); } catch { return null; }
    if (!/^https?:$/.test(url.protocol)) return null;
    const rule = rules.find(candidate => candidate.test(url));
    if (rule) return { url: String(raw), status: "recognized", ruleId: rule.id, reason: rule.label, ...(rule.evidence ? { evidence: rule.evidence(url) } : {}) };
    if (/^link\./i.test(url.hostname) && url.pathname !== "/") {
      return { url: String(raw), status: "suspected", ruleId: "branded-redirect-link", reason: "Lien de redirection de marque; destination à vérifier" };
    }
    if ([...url.searchParams.keys()].some(key => weakKeys.has(key.toLowerCase()))) {
      return { url: String(raw), status: "suspected", ruleId: "ambiguous-marketing-parameter", reason: "Paramètre commercial ambigu, insuffisant pour confirmer une affiliation" };
    }
    return null;
  }

  function inspectLink(raw, label = "") {
    const direct = classify(raw);
    if (direct) return direct;
    let url;
    try { url = new URL(String(raw || "")); } catch { return null; }
    if (!/^https?:$/.test(url.protocol) || !commercialCopy.test(String(label || ""))) return null;
    return { url: String(raw), status: "suspected", ruleId: "commercial-link-context", reason: "Lien présenté comme une offre commerciale; destination non vérifiée" };
  }

  function urlsInText(value) {
    return [...String(value || "").matchAll(/https?:\/\/[^\s<>"'`]+/giu)].map(match => match[0].replace(/[),.;!?\]}]+$/u, ""));
  }

  function inspectText(value) {
    const source = String(value || ""), found = new Map();
    for (const match of source.matchAll(/https?:\/\/[^\s<>"'`]+/giu)) {
      const url = match[0].replace(/[),.;!?\]}]+$/u, ""), direct = classify(url);
      let result = direct;
      const lines = source.split(/\r?\n/u), lineIndex = source.slice(0, match.index).split(/\r?\n/u).length - 1;
      const context = lines[lineIndex] || "";
      const adjacentCommercialCue = [lines[lineIndex - 1], lines[lineIndex + 1]].filter(Boolean);
      if (!result && (commercialCopy.test(context) || adjacentCommercialCue.some(line => !/https?:\/\//iu.test(line) && commercialCopy.test(line)))) {
        result = { url, status: "suspected", ruleId: "promotional-context", reason: "URL proche d’un code promo ou d’une offre commerciale; affiliation non confirmée" };
      }
      if (result && (!found.has(result.url) || result.status === "recognized")) found.set(result.url, result);
    }
    return [...found.values()];
  }

  function inspect(article) {
    const candidates = [article?.canonicalUrl, article?.blueskyLink];
    const found = new Map();
    for (const candidate of candidates) {
      if (!candidate) continue;
      const result = classify(candidate);
      if (result && (!found.has(result.url) || result.status === "recognized")) found.set(result.url, result);
    }
    for (const result of [...inspectText(article?.summary), ...inspectText(article?.videoDetails?.description)]) {
      if (!found.has(result.url) || result.status === "recognized") found.set(result.url, result);
    }
    return [...found.values()];
  }

  const api = Object.freeze({ rules: rules.map(({ id, label }) => ({ id, label })), classify, inspectLink, inspect, inspectText, urlsInText });
  if (typeof window !== "undefined") window.MMAffiliate = api;
  globalThis.MMAffiliate = api;
})();
