const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const rss = `<?xml version="1.0"?><rss><channel><item>
  <title>Publication de test - LinkedIn</title>
  <link>https://news.google.com/rss/articles/test-guid</link>
  <guid>test-guid</guid><pubDate>${new Date().toUTCString()}</pubDate>
  <source url="https://www.linkedin.com/posts/auteur_activity-1234567890123456789-test">LinkedIn</source>
</item></channel></rss>`;

function loadParser() {
  const context = vm.createContext({ Date, URL, URLSearchParams, Set, String });
  vm.runInContext(fs.readFileSync(path.join(root, "js/linkedin-news.js"), "utf8"), context);
  return vm.runInContext("MMPL", context);
}

function makeDatabase() {
  const rows = new Map();
  const indexedDB = {
    open() {
      const request = {};
      const db = {
        transaction() {
          const tx = {};
          const store = {
            getAll() {
              const result = {};
              setTimeout(() => {
                result.result = [...rows.values()].map(value => structuredClone(value));
                result.onsuccess?.();
                tx.oncomplete?.();
              }, 0);
              return result;
            },
            put(value) { rows.set(value.id, structuredClone(value)); }
          };
          tx.objectStore = () => store;
          return tx;
        }
      };
      setTimeout(() => { request.result = db; request.onsuccess?.(); }, 0);
      return request;
    }
  };
  return { indexedDB, rows };
}

function makeRefreshHarness({ imageRequired = false, term = "OpenAI", rssXml = rss.replace("Publication de test", "OpenAI : publication de test"), initialStorage = {} } = {}) {
  const source = fs.readFileSync(path.join(root, "js/background.js"), "utf8");
  const functions = source.slice(source.indexOf("function linkedinTopics("), source.indexOf("function iaField("));
  const { indexedDB, rows } = makeDatabase(), savedDiagnostics = {}, storageData = { ...initialStorage };
  let activeRssXml = rssXml;
  const context = vm.createContext({
    AbortController, AbortSignal, Date, Map, Set, URL, URLSearchParams, encodeURIComponent,
    linkedinRefreshController: null,
    indexedDB, structuredClone,
    hasSearchTermsConsent: async () => true,
    LINKEDIN_SOURCE_ID: "linkedin-keyword-search",
    automaticHistoryMetadata: () => ({}),
    recordAutomaticHistory: async () => {},
    MMP: {
      normalizeText: value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
      matchTerm: (haystack, value) => {
        const normalizedTerm = String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const normalizedText = String(haystack || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return new RegExp(`(^|[^\\p{L}\\p{N}])${normalizedTerm}(?=$|[^\\p{L}\\p{N}])`, "u").test(normalizedText);
      },
      stableId: value => String(value)
    },
    MMPY: { keywordsFromWalls: (_walls, settings) => {
      const items = Array.isArray(settings?.priorities) ? settings.priorities : Array.isArray(settings) ? settings : Object.values(settings || {}).flatMap(config => config?.priorities || []);
      return items.map(item => typeof item === "string" ? item : item.term).filter(Boolean);
    } },
    browser: { storage: { local: {
      get: async defaults => ({ ...defaults, ...storageData }),
      set: async value => { Object.assign(savedDiagnostics, value); Object.assign(storageData, value); }
    } } },
    state: async () => ({
      automaticWalls: { bluesky: true }, socialProviders: { linkedin: true },
      linkedinRequireImage: imageRequired, walls: [{ id: "wall-a" }], settings: { priorities: [{ term, level: "high" }] },
      wallSettings: { "wall-a": { mode: "chronological" } }
    }),
    fetch: async () => ({ ok: true, status: 200, text: async () => activeRssXml })
  });
  vm.runInContext(fs.readFileSync(path.join(root, "js/db.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "js/linkedin-news.js"), "utf8"), context);
  vm.runInContext(functions, context);
  return { context, rows, savedDiagnostics, storageData, setRssXml: value => { activeRssXml = value; } };
}

test("Google News LinkedIn RSS parses a result without inventing an image", () => {
  const [article] = loadParser().parseGoogleNewsRss(rss, "NixOS");
  assert.equal(article.title, "Publication de test");
  assert.equal(article.image, "");
  assert.equal(article.summary, "");
  assert.match(article.canonicalUrl, /^https:\/\/news\.google\.com\/rss\/articles\//);
});

test("Google News RSS metadata exposes an author, excerpt, and image when the feed provides them", () => {
  const xml = rss.replace("Publication de test - LinkedIn", "Titre de test - LinkedIn")
    .replace("</item>", "<description>Extrait distinct</description><dc:creator>Camille Martin</dc:creator><media:thumbnail url=\"https://img.example.test/post.jpg\"/></item>");
  const [item] = loadParser().parseGoogleNewsRss(xml, "OpenAI");
  assert.equal(item.title, "Titre de test");
  assert.equal(item.summary, "Extrait distinct");
  assert.equal(item.linkedinAuthor, "Camille Martin");
  assert.equal(item.image, "https://img.example.test/post.jpg");
});

test("short LinkedIn keywords reject substrings such as IA inside Patagonia", async () => {
  const rssXml = rss.replace("Publication de test", "Patagonia renouvelle sa collection");
  const { context, rows } = makeRefreshHarness({ term: "IA", rssXml });
  const result = await vm.runInContext("refreshLinkedInNews()", context);
  assert.equal(result.resultCount, 1);
  assert.equal(result.titleRejected, 1);
  assert.equal(result.stored, 0);
  assert.equal(rows.size, 0);
});

test("LinkedIn records the IA tag only when IA appears as a complete word in the result title", async () => {
  const rssXml = rss.replace("Publication de test", "Patagonia utilise l’IA pour ses prévisions");
  const { context, rows } = makeRefreshHarness({ term: "IA", rssXml });
  const result = await vm.runInContext("refreshLinkedInNews()", context);
  assert.equal(result.stored, 1);
  assert.equal(result.titleRejected, 0);
  assert.deepEqual([...rows.values()][0].linkedinKeywords, ["IA"]);
});

test("LinkedIn only stores results newer than its last successful topic refresh", async () => {
  const previous = Date.now() - 60 * 60 * 1000;
  const item = (guid, title, publishedAt) => `<item><title>${title} - LinkedIn</title><link>https://news.google.com/rss/articles/${guid}</link><guid>${guid}</guid><pubDate>${new Date(publishedAt).toUTCString()}</pubDate><source url="https://www.linkedin.com/posts/auteur_activity-${guid}-test">LinkedIn</source></item>`;
  const rssXml = `<?xml version="1.0"?><rss><channel>${item("old", "OpenAI ancienne publication", previous - 1000)}${item("new", "OpenAI publication récente", previous + 1000)}</channel></rss>`;
  const initialStorage = { linkedinSearchState: { lastSuccessfulByTopic: { openai: previous } } };
  const { context, rows, storageData } = makeRefreshHarness({ rssXml, initialStorage });
  const result = await vm.runInContext("refreshLinkedInNews()", context);
  assert.equal(result.resultCount, 2);
  assert.equal(result.olderDateRejected, 1);
  assert.equal(result.stored, 1);
  assert.equal(rows.size, 1);
  assert.match([...rows.values()][0].title, /récente/);
  assert.ok(storageData.linkedinSearchState.lastSuccessfulByTopic.openai > previous);
});

test("LinkedIn uses a successful legacy refresh timestamp when migrating its search state", async () => {
  const previous = Date.now() - 60 * 60 * 1000;
  const rssXml = rss.replace("Publication de test", "OpenAI : publication de test")
    .replace(/<pubDate>[^<]+<\/pubDate>/, `<pubDate>${new Date(previous - 1000).toUTCString()}</pubDate>`);
  const initialStorage = { linkedinCollectionDiagnostics: { at: previous, successCount: 1 } };
  const { context, rows } = makeRefreshHarness({ rssXml, initialStorage });
  const result = await vm.runInContext("refreshLinkedInNews()", context);
  assert.equal(result.olderDateRejected, 1);
  assert.equal(result.stored, 0);
  assert.equal(rows.size, 0);
});

test("LinkedIn allows its initial seven-day collection before a refresh baseline exists", async () => {
  const previousWeek = Date.now() - 6 * 86400000;
  const rssXml = rss.replace(/<pubDate>[^<]+<\/pubDate>/, `<pubDate>${new Date(previousWeek).toUTCString()}</pubDate>`)
    .replace("Publication de test", "OpenAI : publication de test");
  const { context, rows } = makeRefreshHarness({ rssXml });
  const result = await vm.runInContext("refreshLinkedInNews()", context);
  assert.equal(result.stored, 1);
  assert.equal(rows.size, 1);
});

test("a legacy LinkedIn image-only preference does not discard Google News RSS results", async () => {
  const { context, rows } = makeRefreshHarness({ imageRequired: true });
  const result = await vm.runInContext("refreshLinkedInNews()", context);
  assert.equal(result.resultCount, 1);
  assert.equal(result.imageRequired, false);
  assert.equal(result.stored, 1);
  assert.equal(rows.size, 1);
});

test("a manually associated LinkedIn permalink survives the next RSS refresh", async () => {
  const { context, rows, setRssXml } = makeRefreshHarness();
  await vm.runInContext("refreshLinkedInNews()", context);
  const article = [...rows.values()][0];
  const permalink = "https://www.linkedin.com/posts/auteur_activity-1234567890123456789-test";
  const activityUrn = "urn:li:activity:1234567890123456789";
  await vm.runInContext(`MMPDB.putMany([${JSON.stringify({ ...article, linkedinOriginalUrl: permalink, linkedinActivityUrn: activityUrn })}])`, context);
  setRssXml(rss.replace("Publication de test - LinkedIn", "OpenAI : publication de test - LinkedIn")
    .replace(/<pubDate>[^<]+<\/pubDate>/, `<pubDate>${new Date(Date.now() + 60_000).toUTCString()}</pubDate>`));

  const result = await vm.runInContext("refreshLinkedInNews()", context);
  const refreshed = [...rows.values()][0];
  assert.equal(result.duplicates, 1);
  assert.equal(refreshed.linkedinOriginalUrl, permalink);
  assert.equal(refreshed.linkedinActivityUrn, activityUrn);
});

test("the settings explain that LinkedIn image filtering is unavailable in Google News RSS", () => {
  const html = fs.readFileSync(path.join(root, "settings.html"), "utf8");
  assert.match(html, /Filtre image indisponible/);
  assert.match(html, /social-network-row/);
  assert.match(html, /socialInfoDialog/);
  assert.doesNotMatch(html, /Le flux ne fournit pas le texte complet ni d’images/);
});

test("the social wall filters LinkedIn results using the priorities saved by Preferences", () => {
  const wall = fs.readFileSync(path.join(root, "js/wall.js"), "utf8");
  assert.match(wall, /if\(autoWall\?\.kind==="bluesky"\)for\(const item of state\.settings\?\.priorities\|\|\[\]\)/);
  assert.match(wall, /MMP\.matchTerm\(article\.title\|\|"",term\)/);
  assert.match(wall, /activeLinkedInTopics/);
});

test("the LinkedIn embed has enough height to keep ordinary posts in the wall's main scroll", () => {
  const wall = fs.readFileSync(path.join(root, "js/wall.js"), "utf8");
  assert.match(wall, /frame\.style\.height="1100px"/);
  assert.match(wall, /cross-origin embed cannot be measured for auto-sizing/);
});

test("LinkedIn cards show each matching topic once and no longer expose manual permalink controls", () => {
  const wall = fs.readFileSync(path.join(root, "js/wall.js"), "utf8");
  assert.match(wall, /activeBlueskyTopics=isLinkedInResult\(article\)\?\[\]:matchesBluesky/);
  assert.doesNotMatch(wall, /linkedin-associate-link|linkedin-partial-note|associateLinkedInPermalink/);
});
