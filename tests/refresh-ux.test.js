const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/sources.js"), "utf8");
const start = source.indexOf("function formatRefreshTime(");
const end = source.indexOf("function calculateSourceArticleCounts(", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);

function element() {
  return {
    textContent: "", children: [], disabled: false, dataset: {}, scrollIntoView() {},
    setAttribute(name, value) { this[name] = value; },
    replaceChildren(...children) { this.children = children; this.textContent = children.map(child => typeof child === "string" ? child : child.textContent).join(""); },
    append(...children) { this.children.push(...children); this.textContent += children.map(child => typeof child === "string" ? child : child.textContent).join(""); }
  };
}

function harness(state) {
  const elements = Object.fromEntries(["#sourceLastRefresh", "#sourceNextRefresh", "#sourceRefreshFrequency", "#sourceRefreshSummary", "#refreshSourcesNow", "#list"].map(id => [id, element()]));
  const statusFilter = { dataset: { filterKey: "status" }, focus() { this.focused = true; } };
  let renders = 0;
  const context = vm.createContext({
    state, filters: {}, Number, Date,
    $: selector => elements[selector],
    document: {
      createTextNode: textContent => ({ textContent }),
      createElement: () => element(),
      querySelectorAll: () => [statusFilter]
    },
    renderTable: () => renders++,
    scrollIntoView() {}
  });
  vm.runInContext(source.slice(start, end), context);
  return { context, elements, statusFilter, get renders() { return renders; } };
}

test("sources panel summarizes failures and its error count filters the source table", () => {
  const ui = harness({
    refreshIntervalMinutes: 15,
    refreshStatus: { startedAt: 1000, completedAt: 2000, totalSources: 22, succeededSources: 21, failedSources: 1 },
    sources: []
  });
  vm.runInContext("paintRefreshProgress()", ui.context);
  assert.match(ui.elements["#sourceRefreshSummary"].textContent, /21 sources réussies · 1 en erreur/);
  assert.equal(ui.elements["#sourceRefreshFrequency"].textContent, "15 minutes");
  assert.equal(ui.elements["#sourceNextRefresh"].textContent, new Date(2000 + 15 * 60000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
  ui.elements["#sourceRefreshSummary"].children[1].onclick();
  assert.equal(vm.runInContext("filters.status", ui.context), "Échec de synchronisation");
  assert.equal(ui.renders, 1);
  assert.equal(ui.statusFilter.focused, true);
});

test("sources panel shows collection progress and supports the daily frequency", () => {
  const ui = harness({
    refreshIntervalMinutes: 1440,
    refreshStatus: { startedAt: 1000, completedAt: 0, totalSources: 22, processedSources: 7, succeededSources: 6, failedSources: 1 },
    sources: []
  });
  vm.runInContext("paintRefreshProgress()", ui.context);
  assert.equal(ui.elements["#sourceRefreshSummary"].textContent, "Actualisation en cours · 7 sur 22 sources traitées.");
  assert.equal(ui.elements["#sourceRefreshFrequency"].textContent, "1 fois par jour");
  assert.equal(ui.elements["#refreshSourcesNow"].disabled, true);
});

test("wall preferences follow the requested section order and keep the compact 15-minute recommendation", () => {
  const html = fs.readFileSync(path.join(__dirname, "../settings.html"), "utf8");
  const panel = html.slice(html.indexOf('id="panel-walls"'), html.indexOf('id="panel-filters"'));
  const positions = ["wall-list-card", "automatic-walls-panel", "refresh-frequency-card", "Conservation des articles classés"].map(marker => panel.indexOf(marker));
  assert.ok(positions.every(position => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(panel, /<option value="15">15 min · recommandé<\/option>/);
  for (const control of ["wallManagement", "autoInternetArchiveEnabled", "videoWallCard", "videoProviderYoutube", "socialWallCard", "socialProviderBluesky", "refreshIntervalMinutes", "archiveRetention", "laterRetention"]) {
    assert.match(panel, new RegExp(`id="${control}"`), `missing preference control: ${control}`);
  }
  assert.match(panel, /class="wall-extra-settings"><h2>Réglages supplémentaires<\/h2>/);
});

test("new configurations default to 15 minutes while a saved frequency is retained", async () => {
  const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const start = background.indexOf("const ALARM =");
  const end = background.indexOf("const MAX_WALLS", start);
  const context = vm.createContext({
    Number,
    stored: {},
    browser: { storage: { local: { get: async defaults => ({ ...defaults, ...context.stored }) } } }
  });
  vm.runInContext(background.slice(start, end), context);
  assert.equal(await vm.runInContext("refreshInterval()", context), 15);
  context.stored = { refreshIntervalMinutes: 30 };
  assert.equal(await vm.runInContext("refreshInterval()", context), 30);
  assert.match(background, /REFRESH_INTERVALS = \[5, 10, 15, 30, 60, 1440\]/);
  const settings = fs.readFileSync(path.join(__dirname, "../js/settings.js"), "utf8");
  assert.match(settings, /type:"setRefreshInterval",minutes:Number\(control\.value\)/);
  assert.match(settings, /refreshIntervalMinutes:current\.refreshIntervalMinutes\|\|15/);
});

test("startup preserves a matching refresh alarm and repairs a stale interval before collecting", async () => {
  const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const constantsStart = background.indexOf("const ALARM =");
  const constantsEnd = background.indexOf("const MAX_WALLS", constantsStart);
  const initStart = background.indexOf("async function init() {");
  const initEnd = background.indexOf("\nbrowser.runtime.onStartup.addListener", initStart);
  const initSource = background.slice(initStart, initEnd);
  assert.notEqual(constantsStart, -1);
  assert.notEqual(constantsEnd, -1);
  assert.notEqual(initStart, -1);
  assert.notEqual(initEnd, -1);

  async function run(existingPeriod) {
    const actions = [], stored = { refreshIntervalMinutes: 15 };
    const context = vm.createContext({
      Date,
      Number,
      state: async () => ({ sources: [], lastCleanup: 1 }),
      ensureSocialRefreshBaseline: async () => false,
      restoreAutomaticSocialSnapshots: async () => 0,
      saveAutomaticSocialSnapshots: async () => {},
      ensureProcessedDiscoveryMemory: async () => [],
      cleanReadingStates: async () => {},
      MMPDB: { sourceSync: async () => true },
      refreshIfStale: async () => { actions.push("refresh"); },
      browser: {
        storage: { local: { get: async defaults => ({ ...defaults, ...stored }), set: async values => Object.assign(stored, values), remove: async key => { actions.push(["remove", key]); delete stored[key]; } } },
        alarms: {
          get: async () => existingPeriod === null ? null : { periodInMinutes: existingPeriod },
          clear: async name => { actions.push(["clear", name]); },
          create: async (name, options) => { actions.push(["create", name, options]); }
        }
      }
    });
    vm.runInContext(background.slice(constantsStart, constantsEnd) + initSource, context);
    await vm.runInContext("init()", context);
    return JSON.parse(JSON.stringify(actions));
  }

  assert.deepEqual(await run(15), [["remove", "pendingDiscoveries"], "refresh"]);
  assert.deepEqual(await run(5), [["remove", "pendingDiscoveries"], ["clear", "mmp-refresh"], ["create", "mmp-refresh", { periodInMinutes: 15 }], "refresh"]);
  assert.deepEqual(await run(null), [["remove", "pendingDiscoveries"], ["create", "mmp-refresh", { periodInMinutes: 15 }], "refresh"]);
});
