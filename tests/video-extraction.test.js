const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({
  URL, Date, Map, Set, Object, String, Number, RegExp, JSON,
  document: { createElement: () => ({ set innerHTML(value) { this.value = value; }, value: "" }) }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8"), context);
const MMP = vm.runInContext("MMP", context);

function extract({ pageUrl = "https://publisher.example/story", schema = null, video = null, iframe = null, magneto = null } = {}) {
  const scripts = schema ? [{ textContent: JSON.stringify(schema) }] : [];
  const node = (attrs, source = null) => ({
    getAttribute: name => attrs[name] || "",
    querySelector: selector => selector === "source[src]" ? source : null
  });
  const videoNode = video ? node(video) : null;
  const frameNode = iframe ? node(iframe) : null;
  const magnetoNode = magneto ? { getAttribute: name => name === "data-id" ? magneto.id : "", querySelector: selector => selector === "img[src]" && magneto.poster ? { getAttribute: () => magneto.poster } : null } : null;
  const doc = {
    querySelector: selector => selector === ".magneto[data-id]" ? magnetoNode : null,
    querySelectorAll: selector => selector.includes("script[type=") ? scripts : selector.includes("iframe") ? (frameNode ? [frameNode] : []) : selector.includes("video") ? (videoNode ? [videoNode] : []) : []
  };
  return JSON.parse(JSON.stringify(MMP.extractVideo(doc, pageUrl)));
}

test("a France Télévisions Magnetoscope video keeps its id and poster for on-click resolution", () => {
  const id = "bd9ba65e-956a-44b9-b84c-341e1363fc23", poster = "https://medias.france.tv/thumbnail.png";
  const result = extract({ pageUrl: "https://france3-regions.franceinfo.fr/occitanie/programmes/story.html", magneto: { id, poster } });
  assert.deepEqual(result, { kind: "francetv", id, poster });
});

test("Magnetoscope-looking markup on unrelated hosts is not treated as a France Télévisions video", () => {
  const result = extract({ pageUrl: "https://publisher.example/story", magneto: { id: "bd9ba65e-956a-44b9-b84c-341e1363fc23", poster: "https://publisher.example/poster.jpg" } });
  assert.equal(result, null);
});

test("a VideoObject whose contentUrl is the article page is unavailable, not a playable file", () => {
  const result = extract({
    pageUrl: "https://www.bbc.com/news/articles/cmqxnl312v34o",
    schema: {
      "@type": "VideoObject",
      contentUrl: "https://www.bbc.com/news/articles/cmqxnl312v34o",
      name: "Watch: 'Chaotic scenes' at site of Spain's deadly train crash",
      thumbnailUrl: "https://ichef.bbci.co.uk/images/ic/$recipe/p0pk3rzz.jpg"
    }
  });
  assert.equal(result.kind, "unavailable");
  assert.equal(result.src, undefined);
  assert.equal(result.poster, "https://ichef.bbci.co.uk/images/ic/$recipe/p0pk3rzz.jpg");
});

test("a nested VideoObject with a poster but no public stream is marked unavailable", () => {
  const poster = "https://medias.france.tv/example/thumbnail.png";
  const result = extract({
    schema: {
      "@type": "NewsArticle",
      video: {
        "@type": "VideoObject",
        name: "Grands travaux : stop ou encore ?",
        description: "Un reportage vidéo régional.",
        thumbnailUrl: poster
      }
    }
  });
  assert.equal(result.kind, "unavailable");
  assert.equal(result.poster, poster);
});

test("a directly embedded Vimeo iframe remains playable in the article", () => {
  const result = extract({ iframe: { src: "https://vimeo.com/123456789?h=private" } });
  assert.equal(result.kind, "embed");
  assert.equal(result.src, "https://player.vimeo.com/video/123456789?h=private&autoplay=0");
});

test("a descriptive VideoObject without a thumbnail or public stream is still recognized", () => {
  const result = extract({
    schema: {
      "@type": "NewsArticle",
      video: { "@type": "VideoObject", name: "Reportage vidéo", description: "Description du reportage." }
    }
  });
  assert.equal(result.kind, "unavailable");
  assert.equal(result.poster, "");
});

test("a declared direct MP4 remains playable", () => {
  const result = extract({
    schema: { "@type": "VideoObject", contentUrl: "https://cdn.publisher.example/video.mp4", encodingFormat: "video/mp4" }
  });
  assert.equal(result.kind, "file");
  assert.equal(result.src, "https://cdn.publisher.example/video.mp4");
});

test("direct MP4 and WebM elements remain playable", () => {
  for (const extension of ["mp4", "webm"]) {
    const result = extract({ video: { src: `https://cdn.publisher.example/video.${extension}` } });
    assert.equal(result.kind, "file");
    assert.equal(result.src, `https://cdn.publisher.example/video.${extension}`);
  }
});

function configureVideoProbe({ nodes = [], resources = [] } = {}) {
  let mutationCallback;
  context.location = { href: "https://publisher.example/story" };
  context.performance = { getEntriesByType: () => resources };
  context.MutationObserver = class {
    constructor(callback) { mutationCallback = callback; }
    observe() {}
    disconnect() {}
  };
  context.PerformanceObserver = class {
    constructor() {}
    observe() {}
    disconnect() {}
  };
  context.setTimeout = setTimeout;
  context.clearTimeout = clearTimeout;
  context.document.querySelectorAll = selector => selector === "video,source,iframe" ? nodes : [];
  return { mutation: () => mutationCallback, setNodes: next => { nodes = next; } };
}

test("the runtime probe discovers an HLS manifest from generic resource timing", async () => {
  configureVideoProbe({ resources: [{ name: "https://media.publisher.example/live/master.m3u8?signature=temporary" }] });
  const result = await MMP.probeVideoPage(1000);
  assert.equal(result.kind, "hls");
  assert.equal(result.src, "https://media.publisher.example/live/master.m3u8?signature=temporary");
});

test("the runtime probe selects the newest HLS resource instead of an older signed URL", async () => {
  configureVideoProbe({ resources: [
    { name: "https://media.publisher.example/live/old.m3u8?signature=expired", startTime: 100 },
    { name: "https://media.publisher.example/live/current.m3u8?signature=current", startTime: 900 }
  ] });
  const result = await MMP.probeVideoPage(1000);
  assert.equal(result.kind, "hls");
  assert.match(result.src, /current\.m3u8/);
  assert.match(result.src, /signature=current/);
  assert.doesNotMatch(result.src, /expired/);
});

test("the runtime probe prefers a programme HLS manifest over a preroll MP4", async () => {
  const ad = { tagName: "VIDEO", currentSrc: "https://ads.publisher.example/preroll.mp4", getAttribute: () => "", querySelectorAll: () => [] };
  configureVideoProbe({ nodes: [ad], resources: [{ name: "https://media.publisher.example/programme/master.m3u8", startTime: 900 }] });
  const result = await MMP.probeVideoPage(1000);
  assert.equal(result.kind, "hls");
  assert.match(result.src, /programme\/master\.m3u8/);
});

test("the runtime probe detects a media source added after observation starts", async () => {
  const probe = configureVideoProbe();
  const resultPromise = MMP.probeVideoPage(1000);
  const source = { tagName: "SOURCE", currentSrc: "", getAttribute: name => name === "src" ? "https://media.publisher.example/report.webm" : name === "type" ? "video/webm" : "" };
  setTimeout(() => { probe.setNodes([source]); probe.mutation()([]); }, 10);
  const result = await resultPromise;
  assert.equal(result.kind, "file");
  assert.equal(result.src, "https://media.publisher.example/report.webm");
});

test("the runtime probe returns the DASH manifest for an explicit in-wall playback attempt", async () => {
  configureVideoProbe({ resources: [{ name: "https://media.publisher.example/live/manifest.mpd" }] });
  const result = await MMP.probeVideoPage(250);
  assert.equal(result.kind, "dash");
  assert.equal(result.src, "https://media.publisher.example/live/manifest.mpd");
});

test("the runtime probe never starts a player by itself", async () => {
  let playCalls = 0;
  const video = { tagName: "VIDEO", currentSrc: "", getAttribute: () => "", querySelectorAll: () => [], play: () => { playCalls++; } };
  configureVideoProbe({ nodes: [video] });
  const result = await MMP.probeVideoPage(250);
  assert.equal(result.kind, "unavailable");
  assert.equal(result.player, true);
  assert.equal(playCalls, 0);
});

test("an unclassified iframe is detected but left to the original-page fallback", async () => {
  const frame = { tagName: "IFRAME", currentSrc: "", getAttribute: name => name === "src" ? "https://player.publisher.example/embed/opaque" : "" };
  configureVideoProbe({ nodes: [frame] });
  const result = await MMP.probeVideoPage(250);
  assert.equal(result.kind, "frame");
  assert.deepEqual(Array.from(result.srcs), ["https://player.publisher.example/embed/opaque"]);
});

test("an unknown third-party iframe is represented as unavailable", () => {
  const result = extract({ iframe: { src: "https://player.publisher.example/embed/123" } });
  assert.equal(result.kind, "unavailable");
  assert.equal(result.src, undefined);
});

test("an HLS playlist is not exposed as a native file player", () => {
  const result = extract({ video: { src: "https://cdn.publisher.example/master.m3u8" } });
  assert.equal(result.kind, "unavailable");
});
