const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
const settings = fs.readFileSync(path.join(__dirname, "../js/settings.js"), "utf8");
const page = fs.readFileSync(path.join(__dirname, "../discovery.html"), "utf8");
const script = fs.readFileSync(path.join(__dirname, "../js/discovery.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf8"));
const start = background.indexOf("function discoveryIdentity(");
const end = background.indexOf("browser.storage.onChanged.addListener(", start);
const selectorStart = background.indexOf("function selectUnprocessedDiscoveryResults(");
const selectorEnd = background.indexOf("\n}", selectorStart) + 2;
const helpers = vm.createContext({ URL, Date, MMP: { stableId: value => `id:${value}` } });
vm.runInContext(`${background.slice(start, end)}; this.feedIdentity = discoveryIdentity; this.siteIdentity = discoverySiteIdentity; this.mergeProcessed = mergeProcessedDiscoveryRows;`, helpers);
vm.runInContext(`${background.slice(selectorStart, selectorEnd)}; this.selectSearchResults = selectUnprocessedDiscoveryResults;`, helpers);

test("feed normalization removes trackers but preserves feed-specific paths and query keys", () => {
  assert.equal(helpers.feedIdentity("https://News.Example/feed.xml?utm_source=ddg#latest"), "https://news.example/feed.xml");
  assert.equal(helpers.feedIdentity("https://news.example/atom.xml?section=batteries"), "https://news.example/atom.xml?section=batteries");
  assert.notEqual(helpers.feedIdentity("https://news.example/atom.xml?section=batteries"), helpers.feedIdentity("https://news.example/atom.xml?section=general"));
});

test("site identity merges www with the apex domain and keeps independent subdomains distinct", () => {
  assert.equal(helpers.siteIdentity("https://www.it-connect.fr/article"), "it-connect.fr");
  assert.equal(helpers.siteIdentity("https://it-connect.fr/feed/"), "it-connect.fr");
  assert.notEqual(helpers.siteIdentity("https://blog.it-connect.fr"), helpers.siteIdentity("https://it-connect.fr"));
});

test("processed-source memory merges feeds per editorial domain and preserves the original processing date", () => {
  const rows = helpers.mergeProcessed([
    { domain: "www.it-connect.fr", feedUrl: "https://www.it-connect.fr/feed/", processedAt: 123 },
    { domain: "it-connect.fr", feedUrl: "https://it-connect.fr/atom.xml", processedAt: 999 },
    { domain: "blog.it-connect.fr", feedUrl: "https://blog.it-connect.fr/rss", processedAt: 456 }
  ], [], 1000);
  assert.equal(rows.length, 2);
  const site = rows.find(row => row.domain === "it-connect.fr");
  assert.equal(site.processedAt, 123);
  assert.equal(site.feedUrls.length, 2);
  assert.equal(rows.find(row => row.domain === "blog.it-connect.fr").processedAt, 456);
});

test("each search replaces the temporary result list and excludes processed or followed domains", () => {
  const processed = new Set(["done.example"]);
  const resultA = helpers.selectSearchResults([
    { domain: "alpha.example", feedUrl: "https://alpha.example/rss" },
    { domain: "done.example", feedUrl: "https://done.example/rss" }
  ], processed);
  const resultB = helpers.selectSearchResults([
    { domain: "beta.example", feedUrl: "https://beta.example/rss" },
    { domain: "beta.example", feedUrl: "https://beta.example/atom" },
    { domain: "done.example", feedUrl: "https://done.example/rss" }
  ], processed);
  assert.deepEqual([...resultA].map(row => row.domain), ["alpha.example"]);
  assert.deepEqual([...resultB].map(row => row.domain), ["beta.example"]);
  assert.match(script, /pendingRows = Array\.isArray\(result\.results\) \? result\.results : \[\]/u);
  assert.match(script, /pendingRows = \[\]; renderPending\(pendingRows\)/u);
  assert.match(script, /Aucune nouvelle source à examiner pour cette recherche/u);
});

test("old pending data is cleared on startup and never restored in discovery", () => {
  assert.match(background, /browser\.storage\.local\.remove\("pendingDiscoveries"\)/u);
  assert.match(script, /browser\.storage\.local\.get\(\{ processedSources: \[\] \}\)/u);
  assert.doesNotMatch(script, /pendingDiscoveries:/u);
  const searchStart = background.indexOf("async function runSourceDiscovery("), listenerStart = background.indexOf("browser\.runtime\.onMessage\.addListener((msg, sender)", searchStart);
  assert.doesNotMatch(background.slice(searchStart, listenerStart), /pendingDiscoveries/u);
  assert.match(script, /window\.addEventListener\("pagehide"/u);
  assert.match(script, /window\.addEventListener\("pageshow"/u);
});

test("candidate selection deduplicates domains and excludes durable treated or followed history", () => {
  const treated = helpers.mergeProcessed([
    { domain: "www.it-connect.fr", feedUrl: "https://www.it-connect.fr/feed/", processedAt: 123 }
  ], [{ domain: "it-connect.fr", feedUrl: "https://it-connect.fr/atom.xml", followed: true }], 1000);
  const candidates = helpers.selectSearchResults([
    { domain: "it-connect.fr", feedUrl: "https://it-connect.fr/rss.xml" },
    { domain: "fresh.example", feedUrl: "https://fresh.example/rss" },
    { domain: "fresh.example", feedUrl: "https://fresh.example/atom" }
  ], new Set(treated.map(row => row.domain)));
  assert.deepEqual([...candidates].map(row => row.domain), ["fresh.example"]);
  assert.match(background, /await browser\.storage\.local\.set\(\{ processedSources, refusedSources: \[\] \}\)/u);
  assert.doesNotMatch(background, /pendingDiscoveries\s*:/u);
});

test("discovery tables constrain long text and keep previews inside one shared table row", () => {
  const css = fs.readFileSync(path.join(__dirname, "../css/app.css"), "utf8");
  assert.match(script, /const row = document\.createElement\("tr"\), sourceCell/u);
  assert.match(script, /source\.recentTitles \|\| \[\]\)\.slice\(0, 3\)/u);
  assert.match(css, /\.discovery-table\{[^}]*table-layout:fixed/u);
  assert.match(css, /\.discovery-preview-text\{[^}]*-webkit-line-clamp:2/u);
  assert.match(css, /\.discovery-secondary-link\{[^}]*overflow:hidden/u);
});

test("explored domains show compact summaries and put feed URLs and diagnostics behind details", () => {
  assert.match(script, /const diagnosticsSummary = document\.createElement\("summary"\)/u);
  assert.match(script, /for \(const feed of row\.feeds \|\| \[\]\)/u);
  assert.match(script, /labels = \{[\s\S]*?"Aucun flux validé"/u);
  assert.match(script, /explored-diagnostics/u);
});

test("DuckDuckGo search keeps its temporary tab inactive and always cleans it up", () => {
  assert.match(background, /browser\.tabs\.create\(\{ url: `https:\/\/duckduckgo\.com\/\?q=\$\{encodeURIComponent\(query\)\}&ia=web`, active: false \}\)/u);
  assert.match(background, /browser\.tabs\.hide\(tabId\)/u);
  assert.doesNotMatch(background, /browser\.tabs\.update\(tabId, \{ active: true \}\)/u);
  assert.match(background, /finally \{\s*if \(Number\.isInteger\(tabId\)\) await browser\.tabs\.remove\(tabId\)/u);
});

test("source processing is persistent, reversible, and automatically applied to followed sources", () => {
  assert.match(background, /type === "processDiscoveredSource" \|\| msg\?\.type === "refuseDiscoveredSource"/u);
  assert.match(background, /type === "reconsiderProcessedSource" \|\| msg\?\.type === "restoreDiscoveredSource"/u);
  assert.match(background, /await ensureProcessedDiscoveryMemory\(current\.sources\)/u);
  assert.match(background, /processedSources, refusedSources: \[\]/u);
  assert.match(background, /processedIds\.has\(hitDomain\)/u);
  assert.match(background, /processedIds\.has\(feedDomain\)/u);
  assert.match(script, /pendingRows = pendingRows\.filter\(row => discoverySiteIdentity/u);
  assert.match(script, /await browser\.runtime\.sendMessage\(\{ type: "processDiscoveredSource", source \}\)/u);
});

test("adding a source preserves the durable followed-source memory without a pending queue", () => {
  assert.match(background, /await browser\.storage\.local\.set\(\{ sources: \[\.\.\.current\.sources, source\] \}\)/u);
  assert.match(background, /const current = await state\(\); await browser\.storage\.local\.remove\("pendingDiscoveries"\); await ensureProcessedDiscoveryMemory\(current\.sources\)/u);
  assert.match(background, /changes\.sources\) ensureProcessedDiscoveryMemory\(changes\.sources\.newValue \|\| \[\]\)/u);
  assert.doesNotMatch(background, /reconcilePendingDiscoveries/u);
});

test("v8 refused rows migrate to v9 processed domains in exported and imported backups", () => {
  const helperStart = settings.indexOf("function normalizeDiscoveryIdentity(");
  const helperEnd = settings.indexOf("function normalizeBackupSources(", helperStart);
  const sandbox = vm.createContext({ URL, Date });
  vm.runInContext(`${settings.slice(helperStart, helperEnd)}; this.normalizeProcessed = normalizeBackupProcessedSources;`, sandbox);
  const rows = sandbox.normalizeProcessed([
    { domain: "www.it-connect.fr", feedUrl: "https://www.it-connect.fr/feed/", refusedAt: 123 },
    { domain: "it-connect.fr", feedUrl: "https://it-connect.fr/atom.xml", refusedAt: 456 }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].domain, "it-connect.fr");
  assert.equal(rows[0].feedUrls.length, 2);
  assert.equal(rows[0].processedAt, 123);
  assert.match(settings, /version:9/u);
  assert.match(settings, /processedSources:normalizeBackupProcessedSources\(\[\.\.\.\(Array\.isArray\(backup\.processedSources\)/u);
  assert.match(settings, /\.\.\.\(Array\.isArray\(backup\.refusedSources\)\?backup\.refusedSources:\[\]\)/u);
  assert.match(settings, /\[1,2,3,4,5,6,7,8,9\]\.includes\(backup\.version\)/u);
});

test("discovery offers visit and process actions plus a reversible processed history", () => {
  assert.match(script, /makeButton\("Visiter"/u);
  assert.match(script, /makeButton\("Traiter"/u);
  assert.match(script, /makeButton\("Réexaminer"/u);
  assert.doesNotMatch(script, /makeButton\("Refuser"/u);
  assert.match(page, /Afficher les sources traitées/u);
  assert.match(page, /id="processedSources"/u);
  assert.ok(manifest.optional_host_permissions.includes("https://duckduckgo.com/*"));
});
