const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const wallSource = fs.readFileSync(path.join(__dirname, "../js/wall.js"), "utf8");
const backgroundSource = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
const sidebarSource = fs.readFileSync(path.join(__dirname, "../js/sidebar.js"), "utf8");

function section(start, end) {
  const from = wallSource.indexOf(start);
  const to = wallSource.indexOf(end, from);
  assert.notEqual(from, -1, `Missing source section: ${start}`);
  assert.notEqual(to, -1, `Missing source boundary: ${end}`);
  return wallSource.slice(from, to);
}

function wallCountHarness() {
  const id = "wall-info-locale";
  const articles = [
    { id: "one", sourceIds: ["source-fr"], publishedAt: Date.now() },
    { id: "two", sourceIds: ["source-fr"], publishedAt: Date.now() }
  ];
  let badge = null;
  const button = {
    dataset: { wallId: id },
    querySelector: () => badge,
    append: element => { badge = element; },
    setAttribute() {}
  };
  const context = vm.createContext({
    all: articles,
    visible: articles,
    shouldHideAffiliate: () => false,
    pendingArticles: [],
    switchingWallId: "",
    pendingWallSwitch: null,
    wallSwitchRunning: false,
    pendingByWall: new Map([[id, articles.map(article => ({ ...article, readingState: { status: "read" } }))]]),
    state: {
      activeWallId: "wall-actus",
      walls: [{ id, name: "Info locale" }],
      autoWalls: [],
      sources: [{ id: "source-fr", wallIds: [id] }],
      wallSettings: { [id]: { retentionDays: 3, excludedKeywords: [], excludedCategories: [] } }
    },
    MMP: { normalizeText: value => String(value || "").toLowerCase(), matchTerm: () => false },
    CSS: { escape: value => value },
    document: {
      querySelector: () => button,
      querySelectorAll: () => [button],
    createElement: () => ({ className: "", textContent: "", setAttribute() {}, remove() { badge = null; } })
    }
  });
  vm.runInContext(section("function unreadCountForWall(", "function paintWallTabs()"), context);
  return { context, articles, badge: () => badge };
}

test("a selected wall keeps its unread badge, and it decreases as articles are archived", () => {
  const { context, articles, badge } = wallCountHarness();
  context.updateWallTabCounts();
  assert.equal(badge()?.textContent, "2");

  context.state.activeWallId = "wall-info-locale";
  context.updateWallTabCounts();
  assert.equal(badge()?.textContent, "2");

  articles[0].readingState = { status: "read" };
  context.visible = articles.filter(article => !article.readingState);
  context.updateWallTabCounts();
  assert.equal(badge()?.textContent, "1");

  articles[1].readingState = { status: "read" };
  context.visible = articles.filter(article => !article.readingState);
  context.updateWallTabCounts();
  assert.equal(badge(), null);
});

test("selecting a wall keeps its badge through the active-wall broadcast", async () => {
  const { context, articles, badge } = wallCountHarness();
  context.state.settings = { mode: "chronological" };
  context.wallPinned = false;
  context.switchingWallId = "";
  context.scrollByWall = new Map();
  context.paintWallTabs = () => context.updateWallTabCounts();
  context.updateNewItemsButton = () => {};
  context.filterSort = () => {
    context.visible = articles.filter(article => !article.readingState);
    context.updateWallTabCounts();
  };
  context.afterWallChange = () => {};
  context.text = () => {};
  context.keepNavigationCollapsedAtTop = false;
  context.$ = selector => selector === ".feed" ? { scrollTop: 0, scrollTo() {} } : { value: "" };
  let setActiveCalls = 0;
  let activeId = "wall-actus";
  context.browser = { runtime: { sendMessage: async message => {
    if (message.type === "setActiveWall") {
      setActiveCalls++;
      activeId = message.wallId;
      return true;
    }
    if (message.type === "state") return { ...context.state, activeWallId: activeId };
    if (message.type === "articles") return articles;
    if (message.type === "setArticleStatus") {
      const article = articles.find(item => item.id === message.articleId);
      article.readingState = { status: message.status };
      return true;
    }
    throw new Error(`Unexpected message: ${message.type}`);
  } } };
  vm.runInContext(section("async function switchWall(", "async function load()"), context);

  context.updateWallTabCounts();
  assert.equal(badge()?.textContent, "2");
  await context.switchWall("wall-info-locale");
  assert.equal(setActiveCalls, 1);
  assert.equal(context.state.activeWallId, "wall-info-locale");
  assert.equal(badge()?.textContent, "2");

  vm.runInContext(section("async function setReadingStatus(", "function articlesForCurrentWall()"), context);
  await context.setReadingStatus(articles[0], "read");
  assert.equal(badge()?.textContent, "1");
  await context.setReadingStatus(articles[1], "read");
  assert.equal(badge(), null);
});

test("wall badges stay attached to the right wall across manual and automatic walls", () => {
  const walls = [
    { id: "wall-actus", name: "Actu" },
    { id: "wall-infotech", name: "InfoTech" },
    { id: "wall-empty", name: "Vide" }
  ];
  const videoWall = { id: "auto-youtube", name: "Vidéo", kind: "youtube" };
  const sources = [
    { id: "src-actu", wallIds: ["wall-actus"] },
    { id: "src-tech", wallIds: ["wall-infotech"] }
  ];
  const articles = [
    ...Array.from({ length: 6 }, (_, index) => ({ id: `actu-${index}`, sourceIds: ["src-actu"], publishedAt: Date.now() })),
    ...Array.from({ length: 5 }, (_, index) => ({ id: `tech-${index}`, sourceIds: ["src-tech"], publishedAt: Date.now() })),
    { id: "video", sourceIds: ["youtube-keyword-search"], publishedAt: Date.now() }
  ];
  const buttons = new Map();
  for (const wall of [...walls, videoWall]) {
    let badge = null;
    buttons.set(wall.id, {
      dataset: { wallId: wall.id },
      querySelector: () => badge,
      append: element => { badge = element; element.remove = () => { badge = null; }; },
      setAttribute() {},
      get badge() { return badge; }
    });
  }
  const context = vm.createContext({
    all: articles,
    visible: articles.slice(0, 6),
    shouldHideAffiliate: () => false,
    pendingArticles: [],
    pendingByWall: new Map(),
    state: {
      activeWallId: "wall-actus",
      walls,
      autoWalls: [videoWall],
      sources,
      videoProviders: { youtube: true },
      wallSettings: Object.fromEntries(walls.map(wall => [wall.id, { retentionDays: 3 }]))
    },
    isEligibleVideo: article => article.sourceIds.includes("youtube-keyword-search"),
    automaticExcludedKeywords: () => [],
    matchesExcludedKeyword: () => false,
    passesLanguageFilter: () => true,
    MMP: { normalizeText: value => String(value || "").toLowerCase(), matchTerm: () => false },
    CSS: { escape: value => value },
    document: {
      querySelectorAll: () => [...buttons.values()],
      createElement: () => ({ className: "", textContent: "", setAttribute() {}, remove() { this.removed = true; } })
    }
  });
  vm.runInContext(section("function unreadCountForWall(", "function paintWallTabs()"), context);
  const badgeCounts = () => Object.fromEntries([...buttons].map(([id, button]) => [id, button.badge?.textContent || "0"]));

  context.updateWallTabCounts();
  assert.deepEqual(badgeCounts(), { "wall-actus": "6", "wall-infotech": "5", "wall-empty": "0", "auto-youtube": "1" });

  context.state.activeWallId = "wall-infotech";
  context.visible = articles.slice(6, 11);
  context.updateWallTabCounts();
  assert.deepEqual(badgeCounts(), { "wall-actus": "6", "wall-infotech": "5", "wall-empty": "0", "auto-youtube": "1" });

  context.state.activeWallId = "auto-youtube";
  context.visible = [articles[11]];
  context.updateWallTabCounts();
  assert.deepEqual(badgeCounts(), { "wall-actus": "6", "wall-infotech": "5", "wall-empty": "0", "auto-youtube": "1" });
});

test("the global unread count applies the language filter to automatic walls", () => {
  const start = backgroundSource.indexOf('if (msg.type === "sidebarCounts")');
  const end = backgroundSource.indexOf('if (msg.type === "videoStarted")', start);
  assert.notEqual(start, -1);
  const countHandler = backgroundSource.slice(start, end);
  assert.match(countHandler, /const languagePasses=async\(article,kind\)/u);
  assert.match(countHandler, /browser\.i18n\.detectLanguage\(input\)/u);
  assert.match(countHandler, /await Promise\.all\(Array\.from\(\{length:Math\.min\(4,autoCandidates\.length\)\}/u);
  assert.match(countHandler, /if\(await languagePasses\(article,kind\)\)unreadWallArticleIds\.add\(article\.id\)/u);
  assert.match(sidebarSource, /"automaticWalls", "settings"/u);
});
