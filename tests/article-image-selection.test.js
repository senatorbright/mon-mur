const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({
  URL, Date, Intl, Set, Map, Object, String, Number, RegExp, JSON,
  document: { createElement: () => ({ set innerHTML(value) { this.value = value; }, value: "" }) }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8"), context);

function image(attrs = {}, pictureSources = []) {
  return {
    tagName: "IMG",
    attrs,
    getAttribute(name) { return this.attrs[name] || ""; },
    parentElement: pictureSources.length ? {
      tagName: "PICTURE",
      querySelectorAll: () => pictureSources.map(attrs => ({ getAttribute: name => attrs[name] || "" }))
    } : null
  };
}

function select(node) {
  context.node = node;
  return vm.runInContext('MMP.selectBestImage(node, "https://publisher.example/story")', context);
}

test("srcset selects its largest intrinsic rendition", () => {
  assert.equal(select(image({ src: "/photo-320x180.jpg", srcset: "/photo-640x360.jpg 640w, /photo-1280x720.jpg 1280w" })), "https://publisher.example/photo-1280x720.jpg");
});

test("lazy data-srcset is considered when choosing an image", () => {
  assert.equal(select(image({ src: "/photo-320x180.jpg", "data-srcset": "/photo-800x450.jpg 800w, /photo-1600x900.jpg 1600w" })), "https://publisher.example/photo-1600x900.jpg");
});

test("picture sources participate in image selection", () => {
  const node = image({ src: "/photo-320x180.jpg" }, [
    { srcset: "/photo-640x360.jpg 640w" },
    { srcset: "/photo-1440x810.jpg 1440w" }
  ]);
  assert.equal(select(node), "https://publisher.example/photo-1440x810.jpg");
});

test("a lazy image source beats a smaller placeholder src", () => {
  assert.equal(select(image({ src: "/lazy_standard.jpg", "data-src": "https://images.publisher.example/photo-1200x800.jpg" })), "https://images.publisher.example/photo-1200x800.jpg");
});

test("an explicit full image is preferred over a thumbnail src", () => {
  assert.equal(select(image({ src: "/photo-320x180.jpg", "data-full-src": "/photo-1800x1200.jpg" })), "https://publisher.example/photo-1800x1200.jpg");
});

test("a link around the image remains available as the full image fallback", () => {
  const node = image({ src: "/photo-320x180.jpg" });
  node.closest = () => ({ getAttribute: () => "https://publisher.example/photo-original.jpg" });
  assert.equal(select(node), "https://publisher.example/photo-original.jpg");
});

test("a correctly selected high resolution src is retained", () => {
  assert.equal(select(image({ src: "/photo-1600x900.jpg", "data-src": "/photo-640x360.jpg" })), "https://publisher.example/photo-1600x900.jpg");
});

test("no usable image returns an empty string", () => {
  assert.equal(select(image({ src: "/tracking/pixel.gif", "data-src": "data:image/png;base64,AAAA" })), "");
});

test("lazy placeholder and plural logo paths are not treated as editorial images", () => {
  assert.equal(select(image({ src: "/img/lazy_standard.jpg" })), "");
  assert.equal(select(image({ src: "/img/logos/mobile-1024.png" })), "");
});

test("display dimensions do not disqualify the source image", () => {
  const node = image({ src: "/photo-1200x800.jpg", width: "80", height: "54" });
  assert.equal(select(node), "https://publisher.example/photo-1200x800.jpg");
});

test("the background article extractor uses the shared selector", () => {
  const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const start = background.indexOf("function articleImage(");
  const end = background.indexOf("function eventMetadata(", start);
  assert.ok(start >= 0 && end > start);
  const sandbox = vm.createContext({
    URL,
    MMP: {
      cleanUrl: (value, base) => { try { const url = new URL(value, base); return /^https?:$/.test(url.protocol) ? url.href : ""; } catch { return ""; } },
      selectBestImage: (node, base) => {
        const value = node.getAttribute("data-src") || node.getAttribute("src");
        try { return new URL(value, base).href; } catch { return ""; }
      }
    }
  });
  vm.runInContext(background.slice(start, end), sandbox);
  const node = image({ src: "/placeholder.jpg", "data-src": "/editorial.jpg" });
  const doc = {
    querySelector: () => null,
    querySelectorAll: () => [node]
  };
  sandbox.doc = doc;
  assert.equal(vm.runInContext('articleImage(doc, "https://publisher.example/story")', sandbox), "https://publisher.example/editorial.jpg");
});

test("the background article extractor rejects a logo-only social metadata image", () => {
  const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const start = background.indexOf("function articleImage(");
  const end = background.indexOf("function eventMetadata(", start);
  const sandbox = vm.createContext({
    URL,
    MMP: {
      cleanUrl: (value, base) => { try { const url = new URL(value, base); return /^https?:$/.test(url.protocol) ? url.href : ""; } catch { return ""; } },
      selectBestImage: () => ""
    }
  });
  vm.runInContext(background.slice(start, end), sandbox);
  const doc = {
    querySelector: () => ({ content: "https://publisher.example/img/logos/mobile-1024.png" }),
    querySelectorAll: () => []
  };
  sandbox.doc = doc;
  assert.equal(vm.runInContext('articleImage(doc, "https://publisher.example/story")', sandbox), "");
});
