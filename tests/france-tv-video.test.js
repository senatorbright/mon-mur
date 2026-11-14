const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
const start = source.indexOf("async function resolveFranceTvVideo(");
const end = source.indexOf("async function readOpenPageForSource(", start);
assert.ok(start >= 0 && end > start);

function createResolver(responses) {
  const calls = [];
  const context = vm.createContext({
    URL,
    navigator: { userAgent: "Mozilla/5.0 Firefox/158.0" },
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      const payload = responses.shift();
      return { ok: payload.ok !== false, json: async () => payload.body };
    }
  });
  vm.runInContext(source.slice(start, end), context);
  return { context, calls };
}

test("France Télévisions resolution exchanges a Magnetoscope id for a signed DASH stream", async () => {
  const id = "bd9ba65e-956a-44b9-b84c-341e1363fc23";
  const manifest = "https://cloudreplay.ftven.fr/video/manifest.mpd";
  const signed = `${manifest}?hdnea=short-lived`;
  const { context, calls } = createResolver([
    { body: { video: { url: manifest, format: "dash", drm: false, token: { akamai: "https://hdfauth.ftven.fr/esi/TA?format=json" } } } },
    { body: { url: signed } }
  ]);

  const result = await vm.runInContext(`resolveFranceTvVideo("${id}", "https://france3-regions.franceinfo.fr/occitanie/programmes/story.html")`, context);

  assert.equal(result.kind, "dash");
  assert.equal(result.src, signed);
  assert.equal(calls.length, 2);
  const api = new URL(calls[0].url);
  assert.equal(api.hostname, "proxy-mediation.yatta.francetv.fr");
  assert.equal(api.pathname.endsWith(id), true);
  assert.equal(api.searchParams.get("domain"), "france3-regions.franceinfo.fr");
  assert.equal(new URL(calls[1].url).searchParams.get("url"), manifest);
});

test("France Télévisions playback rejects unrelated origins and DRM streams", async () => {
  const id = "bd9ba65e-956a-44b9-b84c-341e1363fc23";
  const { context, calls } = createResolver([{ body: { video: { url: "https://cloudreplay.ftven.fr/video/manifest.mpd", drm: true } } }]);
  const invalid = await vm.runInContext(`resolveFranceTvVideo("${id}", "https://publisher.example/story")`, context);
  assert.equal(invalid.kind, "unavailable");
  assert.equal(calls.length, 0);
  const drm = await vm.runInContext(`resolveFranceTvVideo("${id}", "https://france3-regions.franceinfo.fr/story")`, context);
  assert.equal(drm.kind, "unavailable");
  assert.equal(calls.length, 1);
});
