"use strict";
const MMP = (() => {
  const DEFAULTS = { sources: [], settings: { excludedKeywords: [], excludedCategories: [], priorities: [], mode: "chronological", faceFilterMode: "off", faceDetectionThreshold: 75, persuasionDetectionEnabled: false, clickbaitDetectionEnabled: false, languageFilterEnabled: false, languageFilterLanguages: ["fr", "en"], languageFilterKeepUnknown: false, retentionDays: 30, archiveRetentionDays: 2, laterRetentionDays: 90, speechLanguage: "fr-FR", speechVoiceURI: "", affiliateModuleEnabled: true, affiliateWarningsEnabled: true, hideAffiliatedContent: false } };
  const normalizeText = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim();
  function cleanUrl(value, base) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const u = new URL(value, base);
      if (!/^https?:$/.test(u.protocol)) return "";
      for (const key of [...u.searchParams.keys()]) if (/^utm_/i.test(key)) u.searchParams.delete(key);
      ["fbclid","gclid","mc_cid","mc_eid"].forEach(k => u.searchParams.delete(k));
      u.hash = ""; if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/$/, "");
      return u.href;
    } catch { return ""; }
  }
  function normalizeContentUrl(value) {
    const cleaned = cleanUrl(value);
    if (!cleaned) return "";
    const url = new URL(cleaned), host = url.hostname.toLowerCase();
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be", "www.youtu.be"].includes(host)) {
      const id = host.endsWith("youtu.be") ? url.pathname.split("/").filter(Boolean)[0] : /^\/watch\/?$/.test(url.pathname) ? url.searchParams.get("v") : url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})(?:\/|$)/)?.[1];
      if (/^[\w-]{11}$/.test(id || "")) return `https://www.youtube.com/watch?v=${id}`;
    }
    return cleaned;
  }
  function stableId(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
  function recoverArticleTitle(title, url) {
    const value = decodeHtmlEntities(String(title || "")).replace(/\s+/g, " ").trim();
    const generic = /^(?:la\s+)?(?:suite|lire\s+la\s+suite|en\s+savoir\s+plus|lire\s+plus|voir\s+plus|continuer\s+la\s+lecture|read\s+more|continue\s+reading|more\s+\.\.\.)\s*[»›…]*$/i;
    if (value && value.length <= 240 && !generic.test(value)) return value;
    try {
      const slug = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).at(-1) || "")
        .replace(/\.(?:html?|php|aspx?)$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
      if (slug.length >= 8 && slug.length <= 240) return slug[0].toLocaleUpperCase("fr") + slug.slice(1);
    } catch {}
    return value;
  }
  function text(el) { return (el?.textContent || "").trim(); }
  function decodeHtmlEntities(value) {
    let decoded=String(value||"");
    for(let i=0;i<3;i++){const node=document.createElement("textarea");node.innerHTML=decoded;const next=node.value;if(next===decoded)break;decoded=next;}
    return decoded;
  }
  function selectBestImage(node, baseUrl) {
    if (!node?.getAttribute) return "";
    const usable = value => {
      const candidate = String(value || "").trim();
      if (!candidate || /^data:image\/(?:gif|png);base64,/i.test(candidate) || /(?:transparent|placeholder|spacer|blank|lazy|pixel|beacon|tracking)(?:[._/-]|$)/i.test(candidate)) return "";
      const url = cleanUrl(candidate, baseUrl);
      if (!url) return "";
      try { if (/(?:^|[._/-])(?:logos?|favicons?|sprites?|avatars?|icons?)(?:[._/-]|$)/i.test(new URL(url).pathname)) return ""; } catch { return ""; }
      return url;
    };
    const score = (value, descriptor = "", preferred = false) => {
      const url = usable(value);
      if (!url) return null;
      let quality = 0;
      const path = new URL(url).pathname;
      const dimensions = path.match(/[-_](\d{2,4})x(\d{2,4})(?=\.[^/]+$)/i);
      const widthMarker = path.match(/(?:^|\/)w_(\d{2,4})(?:\/|$)/i);
      const queryWidth = Number(new URL(url).searchParams.get("width") || new URL(url).searchParams.get("w") || 0);
      if (dimensions) quality = Number(dimensions[1]) * Number(dimensions[2]);
      else if (widthMarker) quality = Number(widthMarker[1]) * 600;
      else if (queryWidth) quality = queryWidth * 600;
      const amount = Number.parseFloat(descriptor);
      if (Number.isFinite(amount) && amount > 0) quality = Math.max(quality, amount * (/x$/i.test(descriptor) ? 500000 : 600));
      return { url, score: quality + (preferred ? 1000000000 : 0) };
    };
    const candidates = [];
    const originalAttributes = ["data-full-src", "data-full", "data-zoom-image", "data-original-src", "data-original", "data-large-src"];
    for (const name of originalAttributes) { const candidate = score(node.getAttribute(name), "", true); if (candidate) candidates.push(candidate); }
    const linked = score(node.closest?.("a[href]")?.getAttribute("href"), "", true);
    if (linked) candidates.push(linked);
    const sources = [...(node.parentElement?.tagName === "PICTURE" ? node.parentElement.querySelectorAll("source") : []), node];
    for (const source of sources) {
      for (const name of ["srcset", "data-srcset", "data-lazy-srcset", "data-original-srcset"]) {
        const set = source.getAttribute(name) || "";
        for (const entry of set.split(",")) {
          const [url, descriptor = ""] = entry.trim().split(/\s+/, 2);
          const candidate = score(url, descriptor);
          if (candidate) candidates.push(candidate);
        }
      }
    }
    for (const name of ["data-src", "data-lazy-src", "src"]) { const candidate = score(node.getAttribute(name)); if (candidate) candidates.push(candidate); }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.url || "";
  }
  function sanitizeArticleHtml(html, baseUrl) {
    const doc = new DOMParser().parseFromString(`<body>${String(html || "")}</body>`, "text/html");
    const allowed = new Set(["A","ABBR","B","BLOCKQUOTE","BR","CAPTION","CITE","CODE","DEL","DIV","EM","FIGCAPTION","FIGURE","H1","H2","H3","H4","H5","HR","I","IMG","LI","OL","P","PRE","S","SMALL","SPAN","STRONG","SUB","SUP","TABLE","TBODY","TD","TFOOT","TH","THEAD","TR","U","UL"]);
    const removed = new Set(["IFRAME","OBJECT","EMBED","SCRIPT","STYLE","SVG","MATH","TEMPLATE","FORM","INPUT","BUTTON","TEXTAREA","SELECT","OPTION","NOSCRIPT"]);
    const copy = node => {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue || "");
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const tag = node.tagName;
      if (removed.has(tag)) return null;
      const children = [...node.childNodes].map(copy).filter(Boolean);
      if (!allowed.has(tag)) { const fragment = document.createDocumentFragment(); fragment.append(...children); return fragment; }
      const clean = document.createElement(tag.toLowerCase());
      if (tag === "A") {
        const href = cleanUrl(node.getAttribute("href"), baseUrl);
        if (href) { clean.href = href; clean.target = "_blank"; clean.rel = "noopener noreferrer"; }
      } else if (tag === "IMG") {
        const src = selectBestImage(node, baseUrl);
        if (!src) return null;
        clean.src = src; clean.loading = "lazy"; clean.referrerPolicy = "no-referrer";
        if (node.getAttribute("alt")) clean.alt = node.getAttribute("alt").slice(0, 500);
      }
      if ((tag === "TH" || tag === "TD") && /^[1-9]$/.test(node.getAttribute("colspan") || "")) clean.colSpan = Number(node.getAttribute("colspan"));
      if (tag === "IMG" && node.getAttribute("title")) clean.title = node.getAttribute("title").slice(0, 500);
      clean.append(...children);
      return clean;
    };
    const out = document.createElement("div");
    for (const child of [...doc.body.childNodes]) { const safe = copy(child); if (safe) out.append(safe); }
    return out.innerHTML;
  }
  function videoEmbedUrl(value, baseUrl) {
      if (typeof value !== "string" || !value.trim()) return "";
      const url = cleanUrl(value, baseUrl);
      if (!url.startsWith("https://")) return "";
      const u = new URL(url), host = u.hostname;
        if (["youtube.com", "www.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
          const id = u.pathname.match(/^\/embed\/([\w-]+)/)?.[1] || (/^\/watch\/?$/.test(u.pathname) ? u.searchParams.get("v") : "");
          if (id && /^[\w-]+$/.test(id)) return `https://${host.includes("nocookie") ? "www.youtube-nocookie.com" : "www.youtube.com"}/embed/${id}?autoplay=0&loop=0`;
        }
        if (["dailymotion.com", "www.dailymotion.com"].includes(host)) {
          const id = u.pathname.match(/^\/embed\/video\/([\w-]+)/)?.[1];
          if (id) return `https://www.dailymotion.com/embed/video/${id}?autoplay=false`;
        }
        if (host === "vimeo.com" || host === "www.vimeo.com" || host === "player.vimeo.com") {
          const id = u.pathname.match(/^(?:\/video)?\/(\d+)/)?.[1];
          if (id) { u.searchParams.delete("autoplay"); u.hostname = "player.vimeo.com"; u.pathname = `/video/${id}`; u.searchParams.set("autoplay", "0"); return u.href; }
        }
        if (host === "france.tv" || host.endsWith(".france.tv") || host === "francetv.fr" || host.endsWith(".francetv.fr")) {
          u.searchParams.delete("autoplay");
          return u.href;
        }
        if (host === "france24.com" || host.endsWith(".france24.com")) { u.searchParams.delete("autoplay"); return u.href; }
      return "";
  }
  function extractVideo(doc, baseUrl, editorialFragment = false) {
    let unavailable = null;
    const secure = value => {
      if (typeof value !== "string" || !value.trim()) return "";
      const url = cleanUrl(value, baseUrl);
      return url.startsWith("https://") ? url : "";
    };
    const fileUrl = (value, declaredType = "", allowOpaque = false) => {
      const url = secure(value);
      if (!url) return "";
      const pathname = new URL(url).pathname;
      if (/\.(?:m3u8|mpd|html?)(?:$|\/)/i.test(pathname) || cleanUrl(url) === cleanUrl(baseUrl)) return "";
      return /\.(?:mp4|webm|ogg)(?:$|\/)/i.test(pathname) || /^video\//i.test(String(declaredType || "")) || allowOpaque ? url : "";
    };
    const videoSelector = editorialFragment ? "video" : "article video,main video,[role='main'] video,[itemprop='articleBody'] video,[class*='article-body'] video,[class*='article-content'] video";
    for (const node of doc.querySelectorAll(videoSelector)) {
      const source=node.querySelector("source[src],source[data-src],source[data-lazy-src]");
      const raw=node.getAttribute("src")||node.getAttribute("data-src")||node.getAttribute("data-lazy-src")||source?.getAttribute("src")||source?.getAttribute("data-src")||source?.getAttribute("data-lazy-src")||"";
      const declaredType=source?.getAttribute("type")||node.getAttribute("type")||"",src=fileUrl(raw,declaredType,true),poster=secure(node.getAttribute("poster"));
      if(src)return {kind:"file",src,poster};
      if(raw)unavailable||=(poster?{kind:"unavailable",poster}:{kind:"unavailable"});
    }
    const frameSelector = editorialFragment ? 'iframe[src],iframe[data-src],iframe[data-lazy-src]' : 'article iframe[src],article iframe[data-src],article iframe[data-lazy-src],main iframe[src],main iframe[data-src],main iframe[data-lazy-src],[role="main"] iframe[src],[role="main"] iframe[data-src],[role="main"] iframe[data-lazy-src],[itemprop="articleBody"] iframe[src],[itemprop="articleBody"] iframe[data-src],[itemprop="articleBody"] iframe[data-lazy-src],[class*="article-body"] iframe[src],[class*="article-body"] iframe[data-src],[class*="article-body"] iframe[data-lazy-src],[class*="article-content"] iframe[src],[class*="article-content"] iframe[data-src],[class*="article-content"] iframe[data-lazy-src]';
    for (const frame of doc.querySelectorAll(frameSelector)) {
      const raw = frame.getAttribute("src")||frame.getAttribute("data-src")||frame.getAttribute("data-lazy-src"), src = videoEmbedUrl(raw, baseUrl);
      if (src) return { kind: "embed", src };
      if (raw) unavailable||={kind:"unavailable"};
    }
    const videoType = doc.querySelector('meta[property="og:video:type"]')?.content?.toLowerCase() || "";
    for (const meta of doc.querySelectorAll('meta[property="og:video"], meta[property="og:video:url"]')) {
      const file = fileUrl(meta.content, videoType), src = file || videoEmbedUrl(meta.content, baseUrl);
      if (src) return { kind: file ? "file" : "embed", src };
    }
    // France Télévisions exposes a Magnetoscope video id before its stream
    // URL is resolved. Keep that identifier so the reader can resolve it only
    // after the user asks to play the video.
    try {
      const page = new URL(baseUrl), player = doc.querySelector(".magneto[data-id]");
      const id = player?.getAttribute("data-id") || "";
      if (/(?:^|\.)(?:franceinfo\.fr|france\.tv|francetv\.fr)$/i.test(page.hostname) && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
        const poster = secure(player.querySelector("img[src]")?.getAttribute("src") || "");
        return { kind: "francetv", id, poster };
      }
    } catch {}
    const findVideo = item => {
      if (!item || typeof item !== "object") return null;
      if (Array.isArray(item)) { let deferred = null; for (const child of item) { const found = findVideo(child); if (found?.kind !== "unavailable" && found) return found; deferred ||= found; } return deferred; }
      if (String(item["@type"] || "").includes("VideoObject")) {
        const content = typeof item.contentUrl === "string" ? item.contentUrl : "", embed = typeof item.embedUrl === "string" ? item.embedUrl : "";
        const thumbnail = [].concat(item.thumbnailUrl || []).map(value => typeof value === "string" ? value : value?.url).find(Boolean), poster = secure(thumbnail);
        const integrated = videoEmbedUrl(embed, baseUrl) || videoEmbedUrl(content, baseUrl);
        if (integrated) return { kind: "embed", src: integrated, poster };
        const mediaType = item.encodingFormat || item.fileFormat || "";
        const file = fileUrl(content, mediaType) || fileUrl(embed, mediaType);
        if (file) return { kind: "file", src: file, poster };
        if (content || embed) return findVideo(item["@graph"]) || findVideo(item.mainEntity) || findVideo(item.video) || { kind: "unavailable", poster };
        // Some publishers expose a real VideoObject with a thumbnail and
        // descriptive metadata, but keep the stream URL inside their own
        // player. Preserve a video card so readers can open the source page.
        if (poster || item.name || item.description) return findVideo(item["@graph"]) || findVideo(item.mainEntity) || findVideo(item.video) || { kind: "unavailable", poster };
      }
      return findVideo(item["@graph"]) || findVideo(item.mainEntity) || findVideo(item.video);
    };
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) try {
      const found = findVideo(JSON.parse(script.textContent));
      if (found?.kind !== "unavailable") return found;
      if (found) unavailable ||= found;
    } catch {}
    return unavailable;
  }
  // This self-contained function can also be injected into a page with
  // browser.scripting.executeScript. It only observes an already-open page;
  // it never clicks a player or calls HTMLMediaElement.play().
  function probeVideoPage(maxWaitMs = 8000) {
    return new Promise(resolve => {
      const found = new Set();
      let mutationObserver, resourceObserver, timer, playerSeen = false, frameSources = [], poster = "", fileCandidate = null, dashCandidate = null, fileCandidateStart = -1, settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        mutationObserver?.disconnect();
        resourceObserver?.disconnect();
        resolve(result);
      };
      const classify = (raw, declaredType = "") => {
        if (typeof raw !== "string" || !raw.trim()) return null;
        let url;
        try { url = new URL(raw, location.href); } catch { return null; }
        if (!/^https?:$/.test(url.protocol) || url.href === location.href) return null;
        const path = url.pathname.toLowerCase();
        if (/\.m3u8$/.test(path)) return { kind: "hls", src: url.href, poster };
        if (/\.mpd$/.test(path)) return { kind: "dash", src: url.href, poster };
        if (/\.(?:mp4|webm|ogg)$/.test(path) || /^video\//i.test(declaredType)) return { kind: "file", src: url.href, poster };
        return null;
      };
      const consider = (raw, type = "", startTime = 0) => {
        const result = classify(raw, type);
        if (!result) return false;
        if (result.kind === "dash") { dashCandidate = result; return false; }
        const key = `${result.kind}|${result.src || ""}`;
        if (found.has(key)) return false;
        found.add(key);
        if (result.kind === "hls") { finish(result); return true; }
        // A page can expose advertising MP4s before its actual programme
        // manifest. Keep a direct-file candidate as fallback, but allow the
        // observation window to discover a later HLS stream first.
        if (result.kind === "file" && startTime >= fileCandidateStart) { fileCandidate = result; fileCandidateStart = startTime; }
        return false;
      };
      const scan = () => {
        for (const node of document.querySelectorAll("video,source,iframe")) {
          if (node.tagName === "VIDEO") {
            playerSeen = true;
            poster ||= node.getAttribute("poster") || "";
            if (consider(node.currentSrc) || consider(node.getAttribute("src"))) return;
            for (const source of node.querySelectorAll("source")) if (consider(source.getAttribute("src"), source.getAttribute("type"))) return;
          } else if (node.tagName === "SOURCE") {
            playerSeen = true;
            if (consider(node.getAttribute("src"), node.getAttribute("type"))) return;
          } else if (node.tagName === "IFRAME") {
            playerSeen = true;
            const raw = node.getAttribute("src");
            if (consider(raw)) return;
            try {
              const frameUrl = new URL(raw, location.href);
              if (/^https?:$/.test(frameUrl.protocol) && frameUrl.href !== location.href && !frameSources.includes(frameUrl.href) && frameSources.length < 10) frameSources.push(frameUrl.href);
            } catch {}
          }
        }
        for (const meta of document.querySelectorAll('meta[property^="og:video"],meta[name="twitter:player:stream"]')) {
          if (consider(meta.content, meta.getAttribute("type"))) return;
        }
      };
      const scanResources = entries => {
        // Resource Timing entries are returned oldest first. The HLS URL may
        // contain a short-lived signature, so prefer the most recently
        // requested manifest when the page does not expose video.currentSrc.
        for (const entry of [...(entries || [])].sort((a, b) => (Number(b.startTime) || 0) - (Number(a.startTime) || 0))) {
          if (consider(entry.name, "", Number(entry.startTime) || 0)) return;
        }
      };
      try { scan(); } catch {}
      if (settled) return;
      try {
        mutationObserver = new MutationObserver(() => { try { scan(); } catch {} });
        mutationObserver.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "data-src", "poster"] });
      } catch {}
      try {
        scanResources(performance.getEntriesByType("resource"));
        if (!settled) {
          resourceObserver = new PerformanceObserver(list => scanResources(list.getEntries()));
          resourceObserver.observe({ type: "resource", buffered: true });
        }
      } catch {}
      if (settled) return;
      timer = setTimeout(() => finish(dashCandidate || fileCandidate || (frameSources.length ? { kind: "frame", srcs: frameSources, poster } : playerSeen ? { kind: "unavailable", player: true, poster } : null)), Math.max(250, Math.min(15000, Number(maxWaitMs) || 8000)));
    });
  }
  function feedContent(node) {
    const content = node.getElementsByTagName("content:encoded")[0] || node.getElementsByTagNameNS("*", "encoded")[0] || node.getElementsByTagNameNS("*", "content")[0];
    if (!content) return "";
    const type = (content.getAttribute("type") || "").toLowerCase();
    if (type === "xhtml") return [...content.childNodes].map(n => new XMLSerializer().serializeToString(n)).join("");
    const value = text(content);
    if (/^\{full-story\}$/i.test(value.trim())) return "";
    if (type === "text") return `<p>${value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}</p>`;
    return value;
  }
  function normalizeFeedXml(xml) {
    let normalized = String(xml || "");
    const root = normalized.match(/<(rss|rdf:RDF|feed)\b[^>]*>/i);
    if (!root) return normalized;
    const namespaces = { turbo: "http://turbo.yandex.ru", dc: "http://purl.org/dc/elements/1.1/" };
    let tag = root[0];
    for (const [prefix, uri] of Object.entries(namespaces)) {
      const used = new RegExp(`(?:<\\/?${prefix}:|\\s${prefix}:)[\\w.-]+`, "i").test(normalized);
      const declared = new RegExp(`\\bxmlns:${prefix}\\s*=`, "i").test(tag);
      if (used && !declared) tag = tag.replace(/\s*\/?>(?=$)/, ` xmlns:${prefix}="${uri}">`);
    }
    return normalized.replace(root[0], tag);
  }
  function parseFeed(xml, feedUrl, source, includeContent = false) {
    const doc = new DOMParser().parseFromString(normalizeFeedXml(xml), "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("Flux XML invalide");
    const isAtom = doc.documentElement.localName.toLowerCase() === "feed";
    const descriptorNames=isAtom?["title","subtitle"]:["title","description"], feedNode=isAtom?doc.documentElement:doc.getElementsByTagName("channel")[0], feedDescriptor=[...(feedNode?.children||[])].filter(node=>descriptorNames.includes(node.localName.toLowerCase())).map(text).join(" ");
    let nodes = [...doc.getElementsByTagName(isAtom ? "entry" : "item")];
    if (!isAtom && nodes.length === 0) nodes = [...doc.getElementsByTagNameNS("*", "item")];
    return nodes.map(node => {
      const q = name => node.getElementsByTagName(name)[0] || node.getElementsByTagNameNS("*", name)[0];
      let url = "", title = "";
      if (isAtom) {
        const links = [...node.getElementsByTagName("link")];
        url = links.find(l => !l.getAttribute("rel") || l.getAttribute("rel") === "alternate")?.getAttribute("href") || "";
        title = text(q("title"));
      } else { url = text(q("link")); title = text(q("title")); }
      const canonicalUrl = cleanUrl(url, feedUrl); if (!canonicalUrl || !title) return null;
      const desc = decodeHtmlEntities(["description","summary","content:encoded","content","turbo:content"].map(name=>text(q(name))).find(value=>value.trim())||"");
      const fullContent = includeContent ? feedContent(node) : "";
      const dateText = text(q("pubDate") || q("published") || q("updated") || q("date"));
      const date = Date.parse(dateText);
      const cats = [...node.getElementsByTagName("category")].map(x => x.getAttribute("term") || text(x)).filter(Boolean);
      const looksLikeImage = value => /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i.test(String(value||""));
      const mediaNodes=[...node.getElementsByTagNameNS("*","thumbnail"),...node.getElementsByTagNameNS("*","content"),...node.getElementsByTagName("thumbnail")];
      const imageScore=(url,width=0,height=0,thumbnail=false)=>{
        const explicit=Number(width)*Number(height);
        if(explicit)return explicit;
        const dimensions=String(url||"").match(/[-_](\d{2,4})x(\d{2,4})(?=\.[^/]+(?:$|[?#]))/i);
        if(dimensions)return Number(dimensions[1])*Number(dimensions[2]);
        const widthMarker=String(url||"").match(/(?:^|\/)w_(\d{2,4})(?:\/|$)/i);
        if(widthMarker)return Number(widthMarker[1])*600;
        return thumbnail||/(?:^|[\/_-])(?:thumb|thumbnail|small|preview)(?:[\/_-]|\.)/i.test(String(url||""))?1:0;
      };
      const mediaCandidates=mediaNodes.filter(el=>el.getAttribute("url")&&(
        /image\//i.test(el.getAttribute("type")||"")||el.getAttribute("medium")?.toLowerCase()==="image"||el.localName.toLowerCase()==="thumbnail"||looksLikeImage(el.getAttribute("url"))
      )).map(el=>({url:el.getAttribute("url"),score:imageScore(el.getAttribute("url"),el.getAttribute("width"),el.getAttribute("height"),el.localName.toLowerCase()==="thumbnail")}));
      const enclosureNodes=[...node.getElementsByTagNameNS("*","enclosure"),...node.getElementsByTagName("enclosure")];
      mediaCandidates.push(...enclosureNodes.filter(el=>el.getAttribute("url")&&(/image\//i.test(el.getAttribute("type")||"")||looksLikeImage(el.getAttribute("url")))).map(el=>({url:el.getAttribute("url"),score:imageScore(el.getAttribute("url"),el.getAttribute("width"),el.getAttribute("height"))})));
      if(isAtom)mediaCandidates.push(...[...node.getElementsByTagName("link")].filter(el=>el.getAttribute("rel")==="enclosure"&&el.getAttribute("href")&&(/image\//i.test(el.getAttribute("type")||"")||looksLikeImage(el.getAttribute("href")))).map(el=>({url:el.getAttribute("href"),score:imageScore(el.getAttribute("href"),el.getAttribute("width"),el.getAttribute("height"))})));
      let img=mediaCandidates.sort((a,b)=>b.score-a.score)[0]?.url||"";
      if(!img){const html=feedContent(node)||text(q("description")||q("summary"));if(html){const imageDoc=new DOMParser().parseFromString(html,"text/html"),image=imageDoc.querySelector("img[src],img[srcset]");const candidates=String(image?.getAttribute("srcset")||"").split(",").map(entry=>{const [url,descriptor=""]=entry.trim().split(/\s+/,2),amount=Number.parseFloat(descriptor);return {url,score:amount*(/x$/i.test(descriptor)?1000:1)};}).filter(item=>item.url);img=candidates.sort((a,b)=>b.score-a.score)[0]?.url||image?.getAttribute("src")||"";}}
      const guid = text(q("guid") || q("id"));
      const author = text(q("author") || q("creator") || q("dc:creator") || q("name"));
      const plainFeedContent=feedContent(node).replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
      const summary=decodeHtmlEntities(desc.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 1200);
      // Detect cinema feeds from feed metadata and item fields. The manual
      // Standard wall setting can still disable enrichment for ordinary walls.
      // A news summary can mention a film or series without being a cinema
      // listing. Use feed-level and category labels as signals instead.
      const cinemaHint=isCinemaSignal([feedDescriptor,...cats].join(" "));
      return { id: stableId(guid && guid.length > 4 ? `${source.id}:${guid}` : canonicalUrl), sourceId: source.id, canonicalUrl, title: decodeHtmlEntities(title), summary, feedContentHtml: fullContent, image: img ? cleanUrl(img, feedUrl) : "", author: author.trim(), categories: [...new Set(cats)], cinemaHint, publishedAt: Number.isFinite(date) ? date : Date.now(), dateIsFallback: !Number.isFinite(date), discoveredAt: Date.now(), fetchedAt: Date.now() };
    }).filter(Boolean);
  }
  function parseJsonFeed(json, feedUrl, source, includeContent = false) {
    let feed;
    try { feed = typeof json === "string" ? JSON.parse(json) : json; }
    catch { throw new Error("Flux JSON Feed invalide"); }
    if (!feed || typeof feed !== "object" || !/^https?:\/\/jsonfeed\.org\/version\/1(?:\.1)?\/?$/.test(String(feed.version || "")) || !Array.isArray(feed.items)) throw new Error("Document JSON incompatible avec JSON Feed");
    const seen = new Set(), output = [];
    for (const item of feed.items) {
      if (!item || typeof item !== "object") continue;
      const canonicalUrl = cleanUrl(item.url || item.external_url, feedUrl), title = decodeHtmlEntities(String(item.title || "").trim());
      if (!canonicalUrl || !title || seen.has(canonicalUrl)) continue;
      seen.add(canonicalUrl);
      const attachments = Array.isArray(item.attachments) ? item.attachments : [];
      const imageAttachment = attachments.find(attachment => /^image\//i.test(attachment?.mime_type || "") || /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i.test(attachment?.url || ""));
      const videoAttachment = attachments.find(attachment => /^video\//i.test(attachment?.mime_type || "") || /\.(?:mp4|webm|m3u8)(?:$|[?#])/i.test(attachment?.url || ""));
      const contentHtml = String(item.content_html || "");
      const contentText = String(item.content_text || "");
      const escapedTextContent = contentText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
      const rawSummary = String(item.summary || item.content_text || "").trim() || contentHtml.replace(/<[^>]*>/g, " ");
      const summary = decodeHtmlEntities(rawSummary.replace(/\s+/g, " ").trim()).slice(0, 1200);
      const publishedAt = Date.parse(item.date_published || "");
      const authors = [].concat(item.authors || item.author || []).map(author => typeof author === "string" ? author : author?.name || "").filter(Boolean);
      const tags = [].concat(item.tags || []).map(tag => typeof tag === "string" ? tag : "").filter(Boolean);
      const image = cleanUrl(item.image || item.banner_image || imageAttachment?.url || "", feedUrl);
      const video = cleanUrl(videoAttachment?.url || "", feedUrl);
      output.push({
        id: stableId(item.id && String(item.id).length > 4 ? `${source.id}:${item.id}` : canonicalUrl), sourceId: source.id,
        canonicalUrl, title, summary, feedContentHtml: includeContent ? (contentHtml || (contentText ? `<p>${escapedTextContent}</p>` : "")) : "", author: authors.join(", "),
        image, video, categories: [...new Set(tags)], cinemaHint: false,
        publishedAt: Number.isFinite(publishedAt) ? publishedAt : Date.now(), dateIsFallback: !Number.isFinite(publishedAt),
        datePrecision: Number.isFinite(publishedAt) ? (/^\d{4}-\d\d-\d\d(?:$|T)/.test(String(item.date_published || "")) ? (String(item.date_published).includes("T") ? "instant" : "day") : "instant") : "unknown", discoveredAt: Date.now(), fetchedAt: Date.now()
      });
    }
    return output;
  }
  function publicationDateFromUrl(url) {
    try {
      const parsed = new URL(url);
      const day = parsed.pathname.match(/(?:^|\/)(\d{4})(?:(\d{2})(\d{2})|(\d{2})\/(\d{2}))(?=\/|$)/);
      if (!day) return NaN;
      const year = Number(day[1]), month = Number(day[2] || day[4]), date = Number(day[3] || day[5]);
      const timestamp = Date.UTC(year, month - 1, date);
      const check = new Date(timestamp);
      return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === date ? timestamp : NaN;
    } catch { return NaN; }
  }
  function publicationDateFromText(value) {
    const input = normalizeText(value).replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
    const months = { january: 1, jan: 1, janvier: 1, janv: 1, february: 2, feb: 2, fevrier: 2, fevr: 2, march: 3, mar: 3, mars: 3, april: 4, apr: 4, avril: 4, avr: 4, may: 5, mai: 5, june: 6, jun: 6, juin: 6, july: 7, jul: 7, juillet: 7, juil: 7, august: 8, aug: 8, aout: 8, september: 9, sep: 9, sept: 9, octobre: 10, oct: 10, october: 10, november: 11, nov: 11, decembre: 12, dec: 12, december: 12 };
    let match = input.match(/^([\p{L}.]+)\s+(\d{1,2}),?\s+(\d{4})$/u), day, month, year;
    if (match) {
      month = months[match[1].replace(/\.$/, "")]; day = Number(match[2]); year = Number(match[3]);
    } else {
      match = input.match(/^(\d{1,2})\s+([\p{L}.]+)[.]?\s*'?\s*(\d{2}|\d{4})$/u);
      if (!match) return NaN;
      day = Number(match[1]); month = months[match[2].replace(/\.$/, "")]; year = Number(match[3]);
      if (year < 100) year += 2000;
    }
    if (!month || day < 1 || day > 31) return NaN;
    const timestamp = Date.UTC(year, month - 1, day), date = new Date(timestamp);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? timestamp : NaN;
  }
  const HTML_PROFILE_VERSION = 1;
  function profileSelector(node, within) {
    if (!node?.localName) return "";
    const tag = String(node.localName).toLowerCase();
    const classes = [...(node.classList || [])].filter(value => /^[\w-]+$/.test(value)).slice(0, 4);
    const candidates = [...new Set([
      ...classes.map(value => `${tag}.${value}`),
      ...(classes.length ? [`${tag}${classes.map(value => `.${value}`).join("")}`] : []),
      tag
    ])];
    for (const selector of candidates) {
      try {
        const matches = [...within.querySelectorAll(selector)];
        if (matches.length === 1 && matches[0] === node) return selector;
      } catch {}
    }
    return "";
  }
  function htmlCardRecord(card, pageUrl) {
    const page = cleanUrl(pageUrl);
    const anchors = [...card.querySelectorAll("a[href]")].map(anchor => ({
      node: anchor,
      url: cleanUrl(anchor.getAttribute("href"), pageUrl),
      title: text(anchor).replace(/\s+/g, " ").trim() || anchor.getAttribute("title") || ""
    })).filter(item => item.url && item.url !== page);
    const links = [...new Map(anchors.map(item => [item.url, item])).values()];
    const cardText = text(card).replace(/\s+/g, " ").trim();
    if (links.length !== 1 || cardText.length < 20 || cardText.length > 3000) return null;
    const titleNode = card.querySelector("[itemprop='headline'], h1, h2, h3, h4, [class*='headline' i], [class*='title' i]") || links[0].node;
    const title = text(titleNode).replace(/\s+/g, " ").trim() || links[0].title;
    if (title.length < 5 || title.length > 240) return null;
    const dateNode = card.querySelector('time[datetime], [itemprop*="datePublished" i], [property*="published_time" i], [class*="date" i], [class*="time" i]');
    const summaryNode = card.querySelector("[itemprop='description'], [class*='excerpt' i], [class*='summary' i], p");
    const imageNode = card.querySelector("img[src], img[data-src], img[data-original]");
    const authorNode = card.querySelector("[itemprop='author'], [rel='author'], [class*='author' i]");
    const categoryNode = card.querySelector("[itemprop='articleSection'], [rel='tag'], [class*='category' i]");
    if (!dateNode && !summaryNode && !imageNode) return null;
    return { card, linkNode: links[0].node, url: links[0].url, titleNode, title, dateNode, summaryNode, imageNode, authorNode, categoryNode };
  }
  function profileChildSelector(records, field) {
    const first = records[0]?.[field];
    if (!first) return "";
    const selector = profileSelector(first, records[0].card);
    if (!selector) return "";
    return records.every(record => {
      try { const matches = [...record.card.querySelectorAll(selector)]; return matches.length === 1 && matches[0] === record[field]; }
      catch { return false; }
    }) ? selector : "";
  }
  function extractHtmlPublication(html, pageUrl, source) {
    const doc = new DOMParser().parseFromString(html, "text/html"), matches = [];
    const articleTypes = new Set(["article", "newsarticle", "reportagenewsarticle", "analysisnewsarticle", "askpublicnewsarticle", "backgroundnewsarticle", "opinionnewsarticle", "reviewnewsarticle", "blogposting", "liveblogposting", "report", "scholarlyarticle", "medicalscholarlyarticle", "techarticle", "apireference", "socialmediaposting", "discussionforumposting"]);
    const visit = value => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      const types = [].concat(value["@type"] || []).map(type => String(type).split(/[\/#]/).pop().toLowerCase());
      if (types.some(type => articleTypes.has(type))) matches.push(value);
      if (value["@graph"]) visit(value["@graph"]);
      if (value.mainEntity) visit(value.mainEntity);
      if (value.itemListElement) visit(value.itemListElement);
    };
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) try { visit(JSON.parse(script.textContent || "")); } catch {}
    const schemaUrl = item => cleanUrl(item.url || item.mainEntityOfPage?.["@id"] || item.mainEntityOfPage || item["@id"], pageUrl);
    const pageCanonical = cleanUrl(pageUrl, pageUrl);
    const schema = matches.find(item => String(item.headline || item.name || "").trim() && schemaUrl(item) === pageCanonical)
      || matches.find(item => String(item.headline || item.name || "").trim());
    const meta = selector => doc.querySelector(selector)?.getAttribute("content") || "";
    const published = schema?.datePublished || schema?.dateCreated || meta('meta[property="article:published_time"]') || doc.querySelector('[itemprop="datePublished"]')?.getAttribute("content") || "";
    const canonical = cleanUrl(schema ? schemaUrl(schema) : doc.querySelector('link[rel~="canonical"][href]')?.getAttribute("href") || pageUrl, pageUrl);
    const structuredOrArticleSignal = !!schema || !!published || !!meta('meta[property="article:author"]') || !!doc.querySelector('article [itemprop="headline"], article h1');
    if (!structuredOrArticleSignal) return { article: null, diagnostics: { singlePublication: false, reason: "Aucun signal structuré ne prouve qu’il s’agit d’une publication isolée." } };
    const titleCandidates = [schema?.headline, schema?.name, meta('meta[property="og:title"]'), meta('meta[name="twitter:title"]'), doc.querySelector("article h1, main h1, h1")?.textContent, doc.title];
    const title = recoverArticleTitle(titleCandidates.find(candidate => candidate && !/^(?:la\s+)?(?:suite|lire\s+la\s+suite|en\s+savoir\s+plus|read\s+more)\s*[»›…]*$/i.test(String(candidate).trim())) || titleCandidates.find(Boolean), pageUrl);
    if (!title || title.length > 300) return { article: null, diagnostics: { singlePublication: false, reason: "La publication isolée ne fournit pas de titre exploitable." } };
    const rawDate = Date.parse(published), hasDate = !!published && Number.isFinite(rawDate);
    const rawImage = schema?.image?.url || (Array.isArray(schema?.image) ? schema.image[0]?.url || schema.image[0] : schema?.image) || meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]');
    const authorValue = schema?.author;
    const authors = [].concat(authorValue || []).map(author => typeof author === "string" ? author : author?.name || "").filter(Boolean);
    const author = authors.join(", ") || meta('meta[property="article:author"]') || "";
    const categories = [...new Set([].concat(schema?.articleSection || []).flatMap(value => typeof value === "string" ? value.split(/[,;|]/) : []).map(value => value.trim()).filter(Boolean))];
    const keywords = [].concat(schema?.keywords || []).flatMap(value => typeof value === "string" ? value.split(/[,;|]/) : []).map(value => value.trim()).filter(Boolean);
    const image = cleanUrl(rawImage, pageUrl);
    const video = cleanUrl(schema?.video?.contentUrl || schema?.video?.embedUrl || meta('meta[property="og:video"]'), pageUrl);
    const article = {
      id: stableId(canonical), sourceId: source.id, sourceOrder: 0, sourceOrderSourceId: source.id, canonicalUrl: canonical,
      title, summary: String(schema?.description || meta('meta[property="og:description"]') || meta('meta[name="description"]') || "").replace(/\s+/g, " ").trim().slice(0, 1200),
      image, author, categories, keywords: [...new Set(keywords)], video, publishedAt: hasDate ? rawDate : Date.now(),
      dateIsFallback: !hasDate, datePrecision: hasDate ? (/^\d{4}-\d\d-\d\d(?:$|T)/.test(published) ? (published.includes("T") ? "instant" : "day") : "instant") : "unknown",
      cinemaHint: false, discoveredAt: Date.now(), fetchedAt: Date.now()
    };
    return {
      article,
      diagnostics: { singlePublication: true, refreshable: false, structured: !!schema, fields: { title: true, date: hasDate, author: !!author, categories: categories.length > 0, keywords: keywords.length > 0, image: !!image, video: !!video, description: !!article.summary }, reason: "Publication isolée extraite ; la page ne prouve pas une liste actualisable." }
    };
  }
  function htmlSchemaArticleFields(doc, pageUrl) {
    const byUrl = new Map(), articleTypes = new Set(["article", "newsarticle", "reportagenewsarticle", "analysisnewsarticle", "askpublicnewsarticle", "backgroundnewsarticle", "opinionnewsarticle", "reviewnewsarticle", "blogposting", "liveblogposting", "report", "scholarlyarticle", "medicalscholarlyarticle", "techarticle", "apireference", "socialmediaposting", "discussionforumposting"]);
    const visit = value => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      const types = [].concat(value["@type"] || []).map(type => String(type).split(/[\/#]/).pop().toLowerCase());
      if (types.some(type => articleTypes.has(type))) {
        const url = cleanUrl(value.url || value.mainEntityOfPage?.["@id"] || value.mainEntityOfPage, pageUrl);
        if (url) {
          const authors = [].concat(value.author || []).map(author => typeof author === "string" ? author : author?.name || "").filter(Boolean);
          const keywords = [].concat(value.keywords || []).flatMap(item => typeof item === "string" ? item.split(/[,;|]/) : []).map(item => item.trim()).filter(Boolean);
          const video = [].concat(value.video || []).map(item => typeof item === "string" ? item : item?.contentUrl || item?.embedUrl || item?.url || "").find(Boolean) || "";
          const rawImage = value.image || value.thumbnailUrl;
          const image = typeof rawImage === "string" ? rawImage : Array.isArray(rawImage) ? rawImage[0]?.url || rawImage[0] || "" : rawImage?.url || "";
          byUrl.set(url, {
            author: authors.join(", "), keywords,
            categories: [].concat(value.articleSection || []).map(item => typeof item === "string" ? item : item?.name || "").filter(Boolean),
            summary: String(value.description || value.articleBody || "").replace(/\s+/g, " ").trim().slice(0, 1200),
            image: cleanUrl(image, pageUrl),
            video: cleanUrl(video, pageUrl), date: Date.parse(value.datePublished || ""),
            datePrecision: /^\d{4}-\d\d-\d\d(?:$|T)/.test(String(value.datePublished || "")) ? (String(value.datePublished).includes("T") ? "instant" : "day") : "instant"
          });
        }
      }
      for (const key of ["@graph", "mainEntity", "itemListElement", "item"]) if (value[key]) visit(value[key]);
    };
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) try { visit(JSON.parse(script.textContent || "")); } catch {}
    return byUrl;
  }
  function extractHtmlProfile(html, pageUrl, source, profile) {
    const diagnostics = { profileVersion: profile?.version || 0, profileUsed: false, expectedItems: 0, matchedItems: 0, validItems: 0, reason: "" };
    if (!profile || profile.version !== HTML_PROFILE_VERSION || profile.method !== "html" || profile.kind !== "listing" || !profile.itemSelector || !profile.linkSelector || !profile.titleSelector) {
      diagnostics.reason = "Profil HTML absent ou version inconnue.";
      return { articles: [], diagnostics };
    }
    let doc, items;
    try {
      doc = new DOMParser().parseFromString(html, "text/html");
      items = [...doc.querySelectorAll(profile.itemSelector)];
    } catch {
      diagnostics.reason = "Sélecteur du profil HTML invalide.";
      return { articles: [], diagnostics };
    }
    diagnostics.profileUsed = true;
    diagnostics.expectedItems = Number(profile.validation?.minimumItems) || 2;
    diagnostics.matchedItems = items.length;
    const articles = [];
    for (const item of items) {
      try {
        const links = [...item.querySelectorAll(profile.linkSelector)];
        const urls = [...new Set(links.map(link => cleanUrl(link.getAttribute("href"), pageUrl)).filter(url => url && url !== cleanUrl(pageUrl)))];
        const titleNode = item.querySelector(profile.titleSelector);
        const title = recoverArticleTitle(text(titleNode), urls[0]);
        if (urls.length !== 1 || title.length < 5 || title.length > 240) continue;
        const dateNode = profile.dateSelector ? item.querySelector(profile.dateSelector) : null;
        const dateText = dateNode?.getAttribute("datetime") || dateNode?.getAttribute("content") || dateNode?.getAttribute("data-date") || text(dateNode);
        const textualDate = publicationDateFromText(dateText), parsedDate = Number.isFinite(textualDate) ? textualDate : Date.parse(dateText);
        const summaryNode = profile.descriptionSelector ? item.querySelector(profile.descriptionSelector) : null;
        const imageNode = profile.imageSelector ? item.querySelector(profile.imageSelector) : null;
        const summary = text(summaryNode).replace(/\s+/g, " ").trim().slice(0, 1200);
        const image = cleanUrl(imageNode?.getAttribute("data-src") || imageNode?.getAttribute("data-original") || imageNode?.getAttribute("src"), pageUrl);
        const categories = profile.categorySelector ? [...item.querySelectorAll(profile.categorySelector)].map(text).map(value => value.trim()).filter(Boolean) : [];
        const authorNode = profile.authorSelector ? item.querySelector(profile.authorSelector) : null;
        const urlDate = Number.isFinite(parsedDate) ? NaN : publicationDateFromUrl(urls[0]);
        const publishedAt = Number.isFinite(parsedDate) ? parsedDate : Number.isFinite(urlDate) ? urlDate : Date.now();
        articles.push({
          id: stableId(urls[0]), sourceId: source.id, sourceOrder: articles.length, sourceOrderSourceId: source.id,
          canonicalUrl: urls[0], title, summary, image, author: text(authorNode).trim(), categories, cinemaHint: false, cinemaMetadata: "", event: null,
          publishedAt, dateIsFallback: !Number.isFinite(parsedDate), datePrecision: Number.isFinite(parsedDate) ? (/^\d{4}-\d\d-\d\d(?:$|T)/.test(dateText) ? (dateText.includes("T") ? "instant" : "day") : "day") : Number.isFinite(urlDate) ? "day" : "unknown",
          discoveredAt: Date.now(), fetchedAt: Date.now()
        });
      } catch {}
    }
    const structured = htmlSchemaArticleFields(doc, pageUrl);
    for (const article of articles) {
      const fields = structured.get(article.canonicalUrl);
      if (!fields) continue;
      article.author ||= fields.author;
      article.summary ||= fields.summary;
      article.image ||= fields.image;
      article.video ||= fields.video;
      article.categories = [...new Set([...(article.categories || []), ...fields.categories])];
      article.keywords = [...new Set(fields.keywords)];
      if (article.dateIsFallback && Number.isFinite(fields.date)) {
        article.publishedAt = fields.date; article.dateIsFallback = false;
        article.datePrecision = fields.datePrecision;
      }
    }
    diagnostics.validItems = articles.length;
    if (items.length < diagnostics.expectedItems || articles.length < diagnostics.expectedItems) diagnostics.reason = `Le profil attend au moins ${diagnostics.expectedItems} blocs cohérents ; ${articles.length} exploitable(s) trouvé(s).`;
    else if (articles.length < items.length * 0.8) diagnostics.reason = `La cohérence du profil a baissé (${articles.length}/${items.length} blocs exploitables).`;
    else diagnostics.reason = "Profil HTML validé pour cette collecte.";
    if (items.length < diagnostics.expectedItems || articles.length < diagnostics.expectedItems || articles.length < items.length * 0.8) return { articles: [], diagnostics };
    return { articles: articles.slice(0, 80), diagnostics };
  }
  function learnHtmlProfile(html, pageUrl) {
    const diagnostics = { profileLearned: false, candidateBlocks: 0, reason: "Aucune structure répétitive suffisamment cohérente." };
    try {
      const doc = new DOMParser().parseFromString(html, "text/html"), grouped = new Map();
      const roots = [...doc.querySelectorAll("main, [role='main'], article, body")];
      const anchors = [...new Set(roots.flatMap(root => [...root.querySelectorAll("a[href]")]))].slice(0, 500);
      for (const anchor of anchors) {
        let card = anchor.parentElement;
        for (let depth = 0; card && depth < 7; depth++, card = card.parentElement) {
          const record = htmlCardRecord(card, pageUrl);
          if (!record || !record.url || !profileSelector(record.linkNode, card)) continue;
          const itemSelectors = new Set([
            ...[...(card.classList || [])].filter(value => /^[\w-]+$/.test(value)).map(value => `${card.localName}.${value}`),
            ...(card.classList?.length ? [`${card.localName}${[...card.classList].filter(value => /^[\w-]+$/.test(value)).map(value => `.${value}`).join("")}`] : []),
            String(card.localName || "").toLowerCase()
          ].filter(Boolean));
          const parent = card.parentElement;
          if (parent) {
            const parentSelector = profileSelector(parent, doc);
            if (parentSelector) itemSelectors.add(`${parentSelector} > ${String(card.localName).toLowerCase()}`);
          }
          for (const selector of itemSelectors) {
            if (!grouped.has(selector)) grouped.set(selector, new Map());
            grouped.get(selector).set(record.url, record);
          }
        }
      }
      const candidates = [];
      for (const [itemSelector, recordsByUrl] of grouped) {
        let nodes;
        try { nodes = [...doc.querySelectorAll(itemSelector)]; } catch { continue; }
        if (nodes.length < 2 || nodes.length > 80) continue;
        const records = nodes.map(node => htmlCardRecord(node, pageUrl));
        if (records.some(record => !record) || new Set(records.map(record => record.url)).size !== records.length) continue;
        const profile = {
          version: HTML_PROFILE_VERSION, method: "html", kind: "listing", status: "validated", refreshable: true,
          sourceUrl: cleanUrl(pageUrl), urlNormalization: { removeTrackingParameters: true, stripFragment: true, trimTrailingSlash: true },
          itemSelector,
          linkSelector: profileChildSelector(records, "linkNode"),
          titleSelector: profileChildSelector(records, "titleNode"),
          dateSelector: profileChildSelector(records, "dateNode"),
          descriptionSelector: profileChildSelector(records, "summaryNode"),
          imageSelector: profileChildSelector(records, "imageNode"),
          authorSelector: profileChildSelector(records, "authorNode"),
          categorySelector: profileChildSelector(records, "categoryNode"),
          fields: { title: true, date: records.every(record => !!record.dateNode), author: records.every(record => !!record.authorNode), description: records.every(record => !!record.summaryNode), image: records.every(record => !!record.imageNode), categories: records.every(record => !!record.categoryNode), keywords: false, video: false },
          validation: { minimumItems: 2, sampleCount: records.length, distinctLinks: records.length, validatedAt: Date.now() }
        };
        if (!profile.linkSelector || !profile.titleSelector) continue;
        const checked = extractHtmlProfile(html, pageUrl, { id: "profile-check" }, profile);
        if (checked.articles.length < 2) continue;
        for (const field of ["date", "author", "description", "image", "categories", "keywords", "video"]) {
          if (checked.articles.some(article => field === "date" ? !article.dateIsFallback : field === "categories" || field === "keywords" ? !!article[field]?.length : !!article[field === "description" ? "summary" : field])) profile.fields[field] = true;
        }
        const fieldScore = Object.values(profile.fields).filter(Boolean).length;
        candidates.push({ profile, score: records.length * 10 + fieldScore + itemSelector.length / 1000 });
      }
      diagnostics.candidateBlocks = candidates.length;
      candidates.sort((a, b) => b.score - a.score);
      if (candidates.length) {
        diagnostics.profileLearned = true;
        diagnostics.reason = `Structure répétitive validée sur ${candidates[0].profile.validation.sampleCount} blocs.`;
        return { profile: candidates[0].profile, diagnostics };
      }
    } catch {}
    return { profile: null, diagnostics };
  }
  function parseHtmlArticles(html, pageUrl, source) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const found = [];
    const pagePath = new URL(pageUrl).pathname;
    const cinemaPathSignal = /(?:^|\/)(?:films?|movies?|cinema|series?|tv-shows?|vod)(?:\/|$)/i.test(pagePath);
    const pageCinemaWords = isCinemaSignal(`${pagePath} ${doc.title} ${doc.body.textContent.slice(0, 12000)}`);
    const cinemaTypes = new Set(["movie", "tvseries", "tvepisode", "creativeworkseries"]);
    const cinemaNodes = [];
    const schemaUrl = value => cleanUrl(typeof value === "string" ? value : value?.url || value?.["@id"], pageUrl);
    const schemaImage = value => cleanUrl(typeof value === "string" ? value : Array.isArray(value) ? value[0]?.url || value[0] : value?.url, pageUrl);
    const schemaKinds = new Set();
    let hasEditorialSchema = false;
    const agendaUrl = /\/(?:agenda|evenement|evenements|events?)(?:\/|$)/i.test(new URL(pageUrl).pathname);
    const mergeListingCandidate = candidate => {
      const existing = found.find(item => item.url === candidate.url);
      if (existing) Object.assign(existing, { title: candidate.title || existing.title, summary: candidate.summary || existing.summary, image: candidate.image || existing.image, date: Number.isFinite(candidate.date) ? candidate.date : existing.date, datePrecision: candidate.datePrecision || existing.datePrecision });
      else found.push(candidate);
    };
    // Find editorial cards by their structure, regardless of publisher or URL.
    for (const anchor of doc.querySelectorAll("main a[href], [role='main'] a[href], .main-content a[href]")) {
      const url = cleanUrl(anchor.getAttribute("href"), pageUrl);
      if (!url || url === cleanUrl(pageUrl) || new URL(url).origin !== new URL(pageUrl).origin) continue;
      const dateSelector = 'time[datetime], [itemprop*="datePublished" i], [property*="published_time" i], [class*="date" i], [class*="time" i]';
      let card = null, parent = anchor.parentElement;
      for (let depth = 0; parent && depth < 8; depth++, parent = parent.parentElement) {
        const candidateTitle = parent.querySelector("[itemprop='headline'], h1, h2, h3, h4, [class*='headline' i], [class*='title' i]");
        const candidateText = text(parent).replace(/\s+/g, " ").trim();
        if (!candidateTitle || candidateText.length < 20 || candidateText.length > 3000) continue;
        const targets = new Set([...parent.querySelectorAll("a[href]")].map(link => cleanUrl(link.getAttribute("href"), pageUrl)).filter(href => href && new URL(href).origin === new URL(pageUrl).origin));
        if (targets.size > 2 || !targets.has(url)) continue;
        if (!parent.querySelector(dateSelector) && !parent.querySelector("img[src], img[data-src], img[data-original]") && !parent.querySelector("[itemprop='description'], [class*='excerpt' i], [class*='summary' i], p")) continue;
        card = parent;
        break;
      }
      if (!card) card = anchor.closest("article, li, [itemtype*='Article' i], [class*='article' i], [class*='news-item' i], [class*='story' i]");
      if (!card) {
        const anchorTitle = text(anchor).replace(/\s+/g, " ").trim();
        const anchorImage = anchor.querySelector("img[src], img[data-src], img[data-original]");
        if (anchorTitle.length >= 8 && anchorTitle.length <= 240 && (anchorImage || anchor.querySelector(dateSelector) || anchor.querySelector("[itemprop='description'], [class*='excerpt' i], [class*='summary' i], p"))) card = anchor;
      }
      if (!card || card === doc.body) continue;
      const titleNode = card.querySelector("[itemprop='headline'], h1, h2, h3, h4, [class*='headline' i], [class*='title' i]");
      const title = text(titleNode) || text(anchor);
      if (title.length < 8 || title.length > 240) continue;
      const cardText = text(card).replace(/\s+/g, " ").trim();
      if (cardText.length < 20 || cardText.length > 3000) continue;
      const dateNode = card.querySelector(dateSelector);
      const dateText = dateNode?.getAttribute("datetime") || dateNode?.getAttribute("content") || dateNode?.getAttribute("data-date") || text(dateNode);
      const textualDate = publicationDateFromText(dateText), date = Number.isFinite(textualDate) ? textualDate : Date.parse(dateText);
      const image = card.querySelector("img[src], img[data-src], img[data-original]");
      const summaryNode = card.querySelector("[itemprop='description'], [class*='excerpt' i], [class*='summary' i], p");
      const summary = text(summaryNode).replace(/\s+/g, " ").trim().slice(0, 1200);
      if (!Number.isFinite(date) && !summary && !image) continue;
      mergeListingCandidate({ url, title, summary, image: cleanUrl(image?.getAttribute("data-src") || image?.getAttribute("data-original") || image?.getAttribute("src"), pageUrl), date: Number.isFinite(date) ? date : NaN, datePrecision: Number.isFinite(date) ? (/^\d{4}-\d\d-\d\d(?:$|T)/.test(dateText) ? (dateText.includes("T") ? "instant" : "day") : "day") : "unknown", categories: [] });
    }
    const dateLead = /^(?:\d{1,2}\s*)?(?:janv(?:ier)?|févr(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|août|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|déc(?:embre)?)[.]?\s*(?:\d{1,2}\s*(?:janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)[.]?)?\s*/i;
    const eventDetails = anchor => {
      let card = anchor.closest(".card, [data-sheetid], [itemtype*='Event'], [class*='event-card' i], [class*='agenda-item' i]");
      if (card && card.querySelectorAll("a[href*='/agenda/']").length > 1) card = null;
      if (!card) {
        let parent = anchor;
        for (let depth = 0; depth < 6 && parent?.parentElement; depth++) {
          parent = parent.parentElement;
          const cardText = text(parent).replace(/\s+/g, " ").trim();
          if (cardText.length > 20 && cardText.length < 1800 && /\b\d{1,2}\s*(?:janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)/i.test(cardText) && parent.querySelectorAll("a[href*='/agenda/']").length <= 1) { card = parent; break; }
        }
      }
      if (!card) return {};
      const cardText = text(card).replace(/\s+/g, " ").trim();
      const dateNode = card.querySelector('time[datetime], time, [class*="date" i], [class*="period" i]');
      const startDateNode = dateNode?.querySelector(".card-startDate");
      const endDateNode = dateNode?.querySelector(".card-endDate");
      const readableDate = node => text(node).replace(/(\d)(?=[\p{L}])/gu, "$1 ").trim();
      const dateText = (dateNode?.getAttribute("datetime") || (startDateNode ? [readableDate(startDateNode), readableDate(endDateNode)].filter(Boolean).join(" – ") : text(dateNode)) || cardText.match(/\b\d{1,2}\s*(?:janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)[^\s]?(?:\s*\d{1,2}\s*(?:janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)[^\s]?)?/i)?.[0] || "").trim();
      const excerptNode = [...card.querySelectorAll("p,[class*='description' i],[class*='excerpt' i]")].find(node => node !== anchor && text(node).trim().length > 35);
      const categoryNodes = [...card.querySelectorAll("[class*='category' i],[class*='thematic' i]")].map(text).filter(Boolean);
      const imageNode = card.querySelector("img[src],img[data-src],img[data-original]");
      const image = cleanUrl(imageNode?.getAttribute("data-src") || imageNode?.getAttribute("data-original") || imageNode?.getAttribute("src"), pageUrl);
      let title = text(anchor).replace(/\s+/g, " ").trim();
      if (agendaUrl) title = title.replace(dateLead, "").trim();
      return { summary: text(excerptNode).replace(/\s+/g, " ").trim().slice(0,1200), image, categories: categoryNodes, eventDateText: dateText };
    };
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(script.textContent);
        const visit = item => {
          if (!item || typeof item !== "object") return;
          if (Array.isArray(item)) return item.forEach(visit);
          const types = [].concat(item["@type"] || []).map(x => String(x).split(/[\/#]/).pop().toLowerCase());
          if (types.some(type => cinemaTypes.has(type))) {
            const url = schemaUrl(item.url || item.mainEntityOfPage || item["@id"]);
            const title = String(item.name || item.headline || "").trim();
            const image = schemaImage(item.image || item.thumbnailUrl);
            if (url && title && url !== cleanUrl(pageUrl)) {
              const genres = [].concat(item.genre || []).map(value => typeof value === "string" ? value : value?.name || "").filter(Boolean);
              const year = String(item.datePublished || item.dateCreated || item.releaseDate || "").match(/\b\d{4}\b/)?.[0] || "";
              const metadata = [year, ...genres].filter(Boolean).join(" · ");
              cinemaNodes.push({ url, title, summary: String(item.description || "").slice(0,1200) || metadata, image, date: NaN, categories: genres, cinemaHint: true, cinemaMetadata: metadata });
              types.filter(type => cinemaTypes.has(type)).forEach(type => schemaKinds.add(type));
            }
          }
          if (types.some(x => ["article","newsarticle","reportagenewsarticle","analysisnewsarticle","askpublicnewsarticle","backgroundnewsarticle","opinionnewsarticle","reviewnewsarticle","blogposting","liveblogposting","report","scholarlyarticle","medicalscholarlyarticle","techarticle","apireference","socialmediaposting","discussionforumposting"].includes(x))) {
            hasEditorialSchema = true;
            const url = cleanUrl(item.url || item.mainEntityOfPage?.["@id"] || item.mainEntityOfPage, pageUrl);
            const title = String(item.headline || item.name || "").trim();
            const dateText = String(item.datePublished || "");
            const author = [].concat(item.author || []).map(value => typeof value === "string" ? value : value?.name || "").filter(Boolean).join(", ");
            const keywords = [].concat(item.keywords || []).flatMap(value => typeof value === "string" ? value.split(/[,;|]/) : []).map(value => value.trim()).filter(Boolean);
            const videoValue = [].concat(item.video || []).map(value => typeof value === "string" ? value : value?.contentUrl || value?.embedUrl || value?.url || "").find(Boolean) || "";
            if (url && title && url !== cleanUrl(pageUrl)) found.push({ url, title, summary: String(item.description || item.articleBody || "").slice(0,1200), image: schemaImage(item.image || item.thumbnailUrl), author, video: cleanUrl(videoValue, pageUrl), keywords, date: Date.parse(dateText), datePrecision: /^\d{4}-\d\d-\d\d(?:$|T)/.test(dateText) ? (dateText.includes("T") ? "instant" : "day") : "instant", categories: [].concat(item.articleSection || []).map(value => typeof value === "string" ? value : value?.name || "").filter(Boolean) });
          }
          if (item.itemListElement) visit(item.itemListElement);
          if (item.item) visit(item.item);
          if (item["@graph"]) visit(item["@graph"]);
        }; visit(parsed);
      } catch {}
    }
    // Infer repeated movie/series cards without relying on a publisher or CSS class.
    const cardCandidates = [];
    const pageOrigin = new URL(pageUrl).origin;
    for (const anchor of doc.querySelectorAll("a[href]")) {
      const url = cleanUrl(anchor.getAttribute("href"), pageUrl);
      if (!url || url === cleanUrl(pageUrl)) continue;
      const target = new URL(url);
      if (target.origin === pageOrigin && target.pathname === "/" && !target.search) continue;
      let card = null, image = null, cursor = anchor;
      for (let depth = 0; depth < 6 && cursor; depth++, cursor = cursor.parentElement) {
        const candidateImage = cursor.querySelector("img[src],img[data-src],img[data-original],img[data-lazy-src]");
        const linkCount = cursor.querySelectorAll("a[href]").length;
        if (candidateImage && linkCount <= 4) {
          card = cursor; image = candidateImage;
          if (/\b(?:19|20)\d{2}\b/.test(text(cursor)) || cursor.querySelector("[itemprop='genre'],[class*='genre' i],[class*='category' i]")) break;
        }
        else if (card && linkCount > 4) break;
      }
      if (!image || !card || card === doc.body) continue;
      const imageUrl = cleanUrl(image.getAttribute("data-src") || image.getAttribute("data-original") || image.getAttribute("data-lazy-src") || image.getAttribute("src") || image.getAttribute("srcset")?.split(",").at(-1)?.trim().split(/\s+/)[0], pageUrl);
      if (!imageUrl || /(?:logo|favicon|sprite|avatar|icon)/i.test(new URL(imageUrl).pathname)) continue;
      const titleNode = card.querySelector("[itemprop='name'],[class*='title' i],h2,h3,h4") || anchor;
      if (!anchor.contains(image) && !titleNode.contains(anchor) && !anchor.contains(titleNode)) continue;
      const title = (text(titleNode) || anchor.getAttribute("title") || image.getAttribute("alt") || "").replace(/\s+/g," ").trim();
      if (title.length < 2 || title.length > 180 || /^(?:php\s+)?hit\s+counter$/i.test(title)) continue;
      if (/histats|counter|pixel|beacon|analytics/i.test(`${new URL(imageUrl).hostname}${new URL(imageUrl).pathname}`) || /(?:^|\/)\d+\.gif$/i.test(new URL(imageUrl).pathname)) continue;
      const cardText = text(card).replace(/\s+/g," ").trim();
      const year = cardText.match(/\b(?:19|20)\d{2}\b/)?.[0] || "";
      const genres = [...card.querySelectorAll("[itemprop='genre'],[class*='genre' i],[class*='category' i]")].map(text).filter(Boolean).slice(0,4);
      cardCandidates.push({ url, title, image: imageUrl, card, cardText, year, genres });
    }
    const distinctCards = [...new Map(cardCandidates.map(item => [item.url, item])).values()];
    const hasSchemaCatalog = distinctCards.filter(item => cinemaNodes.some(node => node.url === item.url)).length >= 2 || cinemaNodes.length >= 2;
    const metadataCount = distinctCards.filter(item => item.year || item.genres.length).length;
    const repeatedCatalog = distinctCards.length >= 3 && metadataCount >= 2 && (cinemaPathSignal || schemaKinds.size > 0 || (pageCinemaWords && !hasEditorialSchema));
    if (hasSchemaCatalog || repeatedCatalog) {
      for (const item of distinctCards) {
        const schema = cinemaNodes.find(node => node.url === item.url);
        const metadata = [item.year, ...item.genres].filter(Boolean).join(" · ");
        const candidate = schema || { url: item.url, title: item.title, summary: metadata, image: item.image, date: NaN, categories: item.genres, cinemaHint: true, cinemaMetadata: metadata };
        candidate.cinemaHint = true;
        if (!candidate.image) candidate.image = item.image;
        if (!candidate.summary) candidate.summary = metadata;
        const existing = found.find(entry => entry.url === candidate.url);
        if (existing) Object.assign(existing, candidate);
        else found.push(candidate);
      }
      for (const item of cinemaNodes) if (!found.some(entry => entry.url === item.url)) found.push(item);
    }
    const linkSelector = agendaUrl ? "a[href*='/agenda/']" : "main article a[href], article a[href]";
    for (const a of doc.querySelectorAll(linkSelector)) {
      const url = cleanUrl(a.getAttribute("href"), pageUrl), title = text(a).replace(/\s+/g," ").trim();
      if (url && title.length > 8 && url !== cleanUrl(pageUrl)) {
        const details = agendaUrl ? eventDetails(a) : {};
        const candidate = { url, title: agendaUrl ? title.replace(dateLead, "").trim() : title, summary: details.summary || "", image: details.image || "", date: NaN, categories: details.categories || [], eventDateText: details.eventDateText || "" };
        const existing = found.find(item => item.url === url);
        if (existing) Object.assign(existing, { title: candidate.title.length < existing.title.length ? candidate.title : existing.title, summary: candidate.summary || existing.summary, image: candidate.image || existing.image, categories: candidate.categories.length ? candidate.categories : existing.categories, eventDateText: candidate.eventDateText || existing.eventDateText });
        else found.push(candidate);
      }
    }
    // Recognize dated article links without relying on a publisher hostname.
    {
      for (const a of doc.querySelectorAll("a[href]")) {
        const url = cleanUrl(a.getAttribute("href"), pageUrl);
        const title = text(a).replace(/\s+/g, " ").trim() || a.getAttribute("title") || "";
        if (url && /\/\d{8}\/[a-f\d]{32}\/c\.html(?:$|[?#])/i.test(url) && title.length > 10 &&
            url !== cleanUrl(pageUrl) && !found.some(x => x.url === url)) {
          let image = "";
          // Use a nearby thumbnail only when its smallest shared container
          // contains links to this article alone. Broader modules can mix
          // unrelated headlines and images, as Xinhua's front page does.
          let card = a;
          for (let depth = 0; depth < 6 && card && !image; depth++, card = card.parentElement) {
            const linkedArticles = [...new Set([...card.querySelectorAll("a[href]")]
              .map(link => cleanUrl(link.getAttribute("href"), pageUrl))
              .filter(href => href && /\/\d{8}\/[a-f\d]{32}\/c\.html(?:$|[?#])/i.test(href)))];
            if (linkedArticles.length !== 1 || linkedArticles[0] !== url) continue;
            for (const img of card.querySelectorAll("img")) {
              const src = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-original") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original-src") || img.getAttribute("srcset")?.split(",").at(-1)?.trim().split(/\s+/)[0];
              const candidate = cleanUrl(src, pageUrl);
              if (candidate && !/(?:logo|favicon|sprite|avatar)/i.test(new URL(candidate).pathname)) { image = candidate; break; }
            }
          }
          found.push({ url, title, summary: "", image, date: NaN, categories: [] });
        }
      }
    }
    return found.slice(0, 80).map((a, sourceOrder) => {
      const urlDate = Number.isFinite(a.date) ? NaN : publicationDateFromUrl(a.url);
      const publishedAt = Number.isFinite(a.date) ? a.date : Number.isFinite(urlDate) ? urlDate : Date.now();
      return { id: stableId(a.url), sourceId: source.id, sourceOrder, sourceOrderSourceId: source.id, canonicalUrl: a.url, title: recoverArticleTitle(a.title, a.url), summary: a.summary, image: a.image, author: a.author || "", keywords: a.keywords || [], video: a.video || "", categories: a.categories, cinemaHint: !!a.cinemaHint, cinemaMetadata: a.cinemaMetadata || "", event: a.eventDateText ? { dateText: a.eventDateText } : null, publishedAt, dateIsFallback: !Number.isFinite(a.date), datePrecision: Number.isFinite(a.date) ? (a.datePrecision || "instant") : Number.isFinite(urlDate) ? "day" : "unknown", discoveredAt: Date.now(), fetchedAt: Date.now() };
    });
  }
  function matchTerm(haystack, term) {
    const query = normalizeText(term);
    const phrases = [];
    const remainder = query.replace(/"([^"]*)"/gu, (_, phrase) => {
      const normalized = phrase.trim().replace(/\s+/gu, " ");
      if (normalized) phrases.push(normalized);
      return " ";
    }).replace(/"/gu, " ");
    const words = remainder.split(/\s+/u).filter(Boolean);
    if (!words.length && !phrases.length) return false;
    const text = normalizeText(haystack);
    const matchesWhole = value => {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "u").test(text);
    };
    return words.every(matchesWhole) && phrases.every(phrase => {
      const escaped = phrase.split(/\s+/u).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
      return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "u").test(text);
    });
  }
  const cinemaTerms=["film","films","cinema","cine","movie","movies","serie","series",'"tv shows"',"stream","streaming","vod","svod"];
  const isCinemaSignal = value => cinemaTerms.some(term=>matchTerm(value,term));
  const isCinemaWall = name => isCinemaSignal(name);
  return { DEFAULTS, normalizeText, cleanUrl, normalizeContentUrl, stableId, decodeHtmlEntities, recoverArticleTitle, normalizeFeedXml, parseFeed, parseJsonFeed, parseHtmlArticles, learnHtmlProfile, extractHtmlProfile, extractHtmlPublication, publicationDateFromUrl, publicationDateFromText, sanitizeArticleHtml, selectBestImage, extractVideo, videoEmbedUrl, probeVideoPage, matchTerm, isCinemaWall, isCinemaSignal };
})();
