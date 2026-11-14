"use strict";
const MMPL = (() => {
  function decodeXml(value) {
    return String(value || "")
      .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  }
  function tag(block, name) {
    const match = String(block || "").match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
    return match ? decodeXml(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim() : "";
  }
  function sourceUrl(block) {
    const source = String(block || "").match(/<source\b([^>]*)>/i), value = source?.[1]?.match(/\burl\s*=\s*(["'])(.*?)\1/i)?.[2] || "";
    try {
      const url = new URL(decodeXml(value));
      return url.protocol === "https:" && /(^|\.)linkedin\.com$/i.test(url.hostname) ? url.href : "";
    } catch { return ""; }
  }
  function plainText(value) {
    return decodeXml(String(value || "").replace(/<[^>]*>/g, " "))
      .replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
  }
  function mediaUrl(block) {
    for (const match of String(block || "").matchAll(/<(media:thumbnail|media:content|enclosure)\b([^>]*)\/?\s*>/gi)) {
      const kind = match[1].toLowerCase(), attrs = match[2];
      const url = attrs.match(/\burl\s*=\s*(["'])(.*?)\1/i)?.[2] || "";
      try {
        const parsed = new URL(decodeXml(url)), type = attrs.match(/\btype\s*=\s*(["'])(.*?)\1/i)?.[2] || "", medium = attrs.match(/\bmedium\s*=\s*(["'])(.*?)\1/i)?.[2] || "";
        const image = kind === "media:thumbnail" || /^image\//i.test(type) || medium.toLowerCase() === "image" || /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i.test(parsed.href);
        if (parsed.protocol === "https:" && image) return parsed.href;
      } catch {}
    }
    return "";
  }
  function parseGoogleNewsRss(xml, keyword = "") {
    const items = [], seen = new Set(), now = Date.now();
    for (const match of String(xml || "").matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
      const block = match[1], source = sourceUrl(block), title = tag(block, "title"), link = tag(block, "link"), guid = tag(block, "guid");
      if (!source || !title || !/^https:\/\/news\.google\.com\/rss\/articles\//i.test(link)) continue;
      let parsedLink;
      try { parsedLink = new URL(link); } catch { continue; }
      const id = guid || parsedLink.pathname;
      if (seen.has(id)) continue;
      seen.add(id);
      const dateValue = Date.parse(tag(block, "pubDate"));
      const cleanTitle = title.replace(/\s+-\s+LinkedIn$/i, "").trim();
      if (!cleanTitle) continue;
      const description = plainText(tag(block, "description"));
      const excerpt = description.replace(/\s*LinkedIn$/i, "").trim();
      const author = plainText(tag(block, "author") || tag(block, "dc:creator"));
      const image = mediaUrl(block);
      items.push({
        id,
        title: cleanTitle,
        canonicalUrl: parsedLink.href,
        linkedinPublisherUrl: source,
        linkedinPublisher: plainText(tag(block, "source")),
        linkedinAuthor: author,
        image,
        googleNewsGuid: guid,
        googleNewsDate: Number.isFinite(dateValue) && dateValue > 0 ? dateValue : 0,
        keyword: String(keyword || "").trim(),
        // Google News RSS does not return the post body or an image URL.
        summary: excerpt && excerpt.toLocaleLowerCase() !== cleanTitle.toLocaleLowerCase() ? excerpt : "",
        discoveredAt: now
      });
    }
    return items;
  }
  function queryUrl(keyword, { language = "fr", country = "FR", window = "7d" } = {}) {
    const query = `site:linkedin.com (posts OR feed/update OR pulse) "${String(keyword || "").replace(/["\\]/g, " ").trim()}" when:${window}`;
    const params = new URLSearchParams({ q: query, hl: language, gl: country, ceid: `${country}:${language}` });
    return `https://news.google.com/rss/search?${params}`;
  }
  return { decodeXml, parseGoogleNewsRss, queryUrl };
})();
