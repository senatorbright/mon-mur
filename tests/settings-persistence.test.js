const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
const settingsScript = fs.readFileSync(path.join(__dirname, "../js/settings.js"), "utf8");
const core = fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8");
const defaults = vm.runInNewContext(`(${core.match(/const DEFAULTS = (\{[^\n]+\});/)[1]})`);
const stateStart = background.indexOf("function stableStateJson(");
const stateEnd = background.indexOf("async function cleanReadingStates", stateStart);
const stateCode = background.slice(stateStart, stateEnd);

function backgroundHarness(seed) {
  const stored = structuredClone(seed);
  const writes = [];
  let failNextWrite = false;
  const browser = {
    storage: {
      local: {
        async get(defaultsOrKey) {
          if (defaultsOrKey === null) return structuredClone(stored);
          if (typeof defaultsOrKey === "object") {
            return Object.fromEntries(Object.entries(defaultsOrKey).map(([key, fallback]) => [
              key,
              key in stored ? structuredClone(stored[key]) : structuredClone(fallback)
            ]));
          }
          return { [defaultsOrKey]: structuredClone(stored[defaultsOrKey]) };
        },
        async set(update) {
          if (failNextWrite) {
            failNextWrite = false;
            throw new Error("Écriture refusée");
          }
          writes.push(structuredClone(update));
          Object.assign(stored, structuredClone(update));
        }
      }
    },
    runtime: { sendMessage: async () => true, getURL: file => `moz-extension://test/${file}` },
    permissions: { onRemoved: { addListener() {} } },
    webRequest: { onBeforeSendHeaders: { addListener() {} } }
  };
  const context = vm.createContext({
    URL,
    browser,
    MMP: { DEFAULTS: defaults, normalizeText: value => String(value || "").normalize("NFD").toLowerCase() },
    MAX_WALLS: 10,
    REFRESH_INTERVALS: [5, 10, 15, 30, 60, 1440],
    DEFAULT_REFRESH_INTERVAL: 15
  });
  vm.runInContext(stateCode, context);
  return { context, stored, writes, failNextWrite() { failNextWrite = true; } };
}

function registerSemanticSaveHandler(context) {
  const handlerStart = background.indexOf('if (msg.type === "saveSemanticSettings") {');
  const handlerEnd = background.indexOf('\n  if (msg.type === "saveWallSettings")', handlerStart);
  assert.notEqual(handlerStart, -1);
  assert.notEqual(handlerEnd, -1);
  vm.runInContext(`let settingsWriteQueue = Promise.resolve(); async function handleMessage(msg) { ${background.slice(handlerStart, handlerEnd)} }; this.handleMessage = handleMessage;`, context);
  context.browser.runtime.sendMessage = async message => {
    if (message.type === "state") return context.state();
    try {
      return await context.handleMessage(message);
    } catch (error) {
      return { error: error.message };
    }
  };
}

function configuredSeed(archiveRetentionDays, laterRetentionDays) {
  return {
    sources: [],
    walls: [{ id: "wall-personal", name: "Personnel", order: 0 }],
    activeWallId: "wall-personal",
    defaultWallId: "wall-personal",
    wallSettings: {
      "wall-personal": {
        excludedKeywords: [], excludedCategories: [], priorities: [],
        mode: "chronological", type: "standard", retentionDays: 19, faceFilterEnabled: false
      }
    },
    settings: {
      ...structuredClone(defaults.settings),
      excludedKeywords: ["résilience"],
      excludedCategories: ["Politique"],
      priorities: [{ term: "climat", level: "high" }],
      archiveRetentionDays,
      laterRetentionDays
      // Deliberately omit retentionSplitVersion, as in affected old profiles.
    },
    automaticWalls: { videos: false, bluesky: true, internetArchive: false },
    videoProviders: { youtube: false, peertube: true, crowdbunker: false, rumble: false },
    socialProviders: { bluesky: false },
    blueskyRequireImage: false,
    refreshIntervalMinutes: 60,
    wallFiltersMigrationVersion: 1,
    semanticFiltersMigrationVersion: 1
  };
}

test("migration preserves explicit 30-day archive and later retention values", async () => {
  const { context, stored } = backgroundHarness(configuredSeed(30, 30));
  const state = await context.state();

  assert.equal(stored.settings.archiveRetentionDays, 30);
  assert.equal(stored.settings.laterRetentionDays, 30);
  assert.equal(stored.settings.retentionSplitVersion, 1);
  assert.equal(state.settings.archiveRetentionDays, 30);
  assert.equal(state.settings.laterRetentionDays, 30);
});

test("migration preserves customized archive and later retention values", async () => {
  const { context, stored } = backgroundHarness(configuredSeed(47, 128));
  const state = await context.state();

  assert.equal(stored.settings.archiveRetentionDays, 47);
  assert.equal(stored.settings.laterRetentionDays, 128);
  assert.equal(state.settings.archiveRetentionDays, 47);
  assert.equal(state.settings.laterRetentionDays, 128);
});

test("legacy wall and semantic-filter migrations still initialize walls and retain saved filters", async () => {
  const seed = {
    sources: [],
    settings: {
      ...structuredClone(defaults.settings),
      excludedKeywords: ["ancienne règle"],
      excludedCategories: ["Culture"],
      priorities: [{ term: "logement", level: "medium" }],
      archiveRetentionDays: 2,
      laterRetentionDays: 90
    }
  };
  const { context, stored } = backgroundHarness(seed);
  const state = await context.state();

  assert.deepEqual(Array.from(state.walls, wall => wall.id), ["wall-actus", "wall-info-locale"]);
  assert.deepEqual(Array.from(state.settings.excludedKeywords), ["ancienne règle"]);
  assert.deepEqual(Array.from(state.settings.excludedCategories), ["Culture"]);
  assert.deepEqual(JSON.parse(JSON.stringify(state.settings.priorities)), [{ term: "logement", level: "medium" }]);
  assert.equal(stored.wallFiltersMigrationVersion, 1);
  assert.equal(stored.semanticFiltersMigrationVersion, 1);
  assert.equal(stored.settings.archiveRetentionDays, 2);
  assert.equal(stored.settings.laterRetentionDays, 90);
});

test("semantic filters attached to legacy walls are merged when a backup import triggers migration", async () => {
  const seed = {
    sources: [],
    walls: [
      { id: "wall-agenda", name: "Agenda", order: 0 },
      { id: "wall-local", name: "Info locale", order: 1 }
    ],
    activeWallId: "wall-agenda",
    defaultWallId: "wall-agenda",
    wallSettings: {
      "wall-agenda": { excludedKeywords: ["grève"], excludedCategories: ["Culture"], priorities: [{ term: "climat", level: "medium" }] },
      "wall-local": { excludedKeywords: ["grève", "travaux"], excludedCategories: ["Culture", "Local"], priorities: [{ term: "climat", level: "high" }] }
    },
    settings: { ...structuredClone(defaults.settings), excludedKeywords: [], excludedCategories: [], priorities: [] },
    semanticFiltersMigrationVersion: 0,
    wallFiltersMigrationVersion: 1
  };
  const { context, stored } = backgroundHarness(seed);
  const state = await context.state();

  assert.deepEqual(Array.from(state.settings.excludedKeywords), ["grève", "travaux"]);
  assert.deepEqual(Array.from(state.settings.excludedCategories), ["Culture", "Local"]);
  assert.deepEqual(JSON.parse(JSON.stringify(state.settings.priorities)), [{ term: "climat", level: "high" }]);
  assert.equal(stored.semanticFiltersMigrationVersion, 1);
});

async function settingsSaveHarness(shouldFail) {
  const seed = configuredSeed(30, 30);
  seed.settings.excludedKeywords = ["avant"];
  const backend = backgroundHarness(seed);
  registerSemanticSaveHandler(backend.context);
  const storedState = await backend.context.state();
  const messages = [];
  const context = vm.createContext({
    structuredClone,
    messages,
    shouldFail,
    saveQueue: Promise.resolve(),
    saveSequence: 0,
    browser: {
      storage: { local: { async set() {} } },
      runtime: {
        async sendMessage(message) {
          messages.push(message.type);
          return backend.context.browser.runtime.sendMessage(message);
        }
      }
    },
    effects: [],
    state: { settings: { ...storedState.settings, excludedKeywords: ["après"] } }
  });
  if (shouldFail) backend.failNextWrite();
  const helperStart = settingsScript.indexOf("async function sendSettingsSave(");
  const helperEnd = settingsScript.indexOf("\nfunction showSaveError", helperStart);
  const saveLine = settingsScript.split("\n").find(line => line.startsWith("function save(){"));
  assert.notEqual(helperStart, -1);
  assert.notEqual(helperEnd, -1);
  assert.ok(saveLine);
  vm.runInContext(`
    function wallSettings(){ return state.settings; }
    function showSaving(){ return ++saveSequence; }
    function showSaveError(error){ effects.push("error:" + error.message); }
    function paint(){ effects.push("paint"); }
    async function markSaved(){ effects.push("success"); }
    ${settingsScript.slice(helperStart, helperEnd)}
    ${saveLine}
    this.savePreferences = save;
    this.currentSettings = () => state.settings;
  `, context);
  return { context, backend, messages, effects: context.effects };
}

test("semantic preference save persists successfully before showing confirmation", async () => {
  const { context, backend, messages, effects } = await settingsSaveHarness(false);

  await context.savePreferences();

  assert.deepEqual(backend.stored.settings.excludedKeywords, ["après"]);
  assert.ok(messages.includes("saveSemanticSettings"));
  assert.ok(messages.includes("state"));
  assert.ok(effects.includes("success"));
  assert.ok(!effects.some(effect => effect.startsWith("error:")));
});

test("semantic preference save shows an error and rolls back when the handler returns an error", async () => {
  const { context, backend, messages, effects } = await settingsSaveHarness(true);

  await context.savePreferences();

  assert.deepEqual(backend.stored.settings.excludedKeywords, ["avant"]);
  assert.deepEqual(context.currentSettings().excludedKeywords, ["avant"]);
  assert.ok(messages.includes("saveSemanticSettings"));
  assert.ok(messages.includes("state"));
  assert.ok(!effects.includes("success"));
  assert.ok(effects.includes("error:Écriture refusée"));
});
