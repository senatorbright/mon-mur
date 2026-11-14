const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const wall = fs.readFileSync(path.join(__dirname, "../js/wall.js"), "utf8");
const detector = fs.readFileSync(path.join(__dirname, "../js/affiliate-detection.js"), "utf8");
const core = fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8");
const settings = fs.readFileSync(path.join(__dirname, "../js/settings.js"), "utf8");
const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");

function filterHarness() {
  const context = vm.createContext({ window: {}, URL, WeakMap, JSON });
  vm.runInContext(detector, context);
  const start = wall.indexOf("const affiliateFindingCache=new WeakMap();");
  const end = wall.indexOf("function affiliateFindingsInContent(", start);
  vm.runInContext(`${wall.slice(start, end)}this.shouldHideAffiliate=shouldHideAffiliate;this.affiliateModuleActive=affiliateModuleActive;`, context);
  return context;
}

test("affiliate display and hiding defaults are independent and compatible with existing profiles", () => {
  assert.match(core, /affiliateModuleEnabled: true, affiliateWarningsEnabled: true, hideAffiliatedContent: false/);
  assert.match(settings, /function persistSmartFilterSettings\(patch\)/);
  assert.match(settings, /function persistSmartFilterSettings\(patch\)\{return sendSettingsSave\(\{type:"saveSmartFilterSettings",settings:patch\}\);\}/);
});


test("affiliation options are written to storage and restored from a read-back", async () => {
  const controls = { hide: { checked: true, disabled: false }, moduleOn: { checked: true, disabled: false }, moduleOff: { checked: false, disabled: false }, status: { textContent: "" } };
  const stored = { settings: { affiliateModuleEnabled: true, affiliateWarningsEnabled: true, hideAffiliatedContent: false, other: "kept" } };
  const context = vm.createContext({
    browser: { storage: { local: { async get() { return structuredClone(stored); }, async set(value) { stored.settings = structuredClone(value.settings); } } }, runtime: { async sendMessage(message) { if (message.type === "saveSmartFilterSettings") stored.settings = { ...stored.settings, ...message.settings }; return { settings: structuredClone(stored.settings) }; } } },
    MMP: { DEFAULTS: { settings: { affiliateModuleEnabled: true, affiliateWarningsEnabled: true, hideAffiliatedContent: false } } },
    $: selector => selector === "#hideAffiliatedContent" ? controls.hide : selector === "#affiliateModuleStateOn" ? controls.moduleOn : selector === "#affiliateModuleStateOff" ? controls.moduleOff : controls.status,
    updateAffiliateControls() {},
    showSaving: () => 1, markSaved: async () => {}, showSaveError: () => {},
    state: { settings: { affiliateModuleEnabled: true, hideAffiliatedContent: false } }
  });
  const helperStart = settings.indexOf("async function sendSettingsSave(message)");
  const helperEnd = settings.indexOf("\nfunction showSaveError", helperStart);
  const saveStart = settings.indexOf("async function saveAffiliatePreferences()");
  const saveEnd = settings.indexOf("\n$(\"#faceDetectionThreshold\").oninput=", saveStart);
  assert.notEqual(helperStart, -1); assert.notEqual(helperEnd, -1); assert.notEqual(saveStart, -1); assert.notEqual(saveEnd, -1);
  vm.runInContext(`let smartFilterSaveQueue=Promise.resolve();\n${settings.slice(helperStart, helperEnd)}\n${settings.slice(saveStart, saveEnd)};this.save=saveAffiliatePreferences;this.persist=persistSmartFilterSettings;`, context);
  await context.save();
  assert.equal(stored.settings.affiliateModuleEnabled, true);
  assert.equal(stored.settings.affiliateWarningsEnabled, true);
  assert.equal(stored.settings.hideAffiliatedContent, true);
  assert.equal(stored.settings.other, "kept");
  assert.equal(controls.hide.checked, true);
  assert.match(controls.status.textContent, /enregistrées/);
  controls.moduleOn.checked = false;
  await context.save();
  assert.equal(stored.settings.affiliateModuleEnabled, false);
  assert.equal(stored.settings.affiliateWarningsEnabled, false);
  assert.equal(stored.settings.hideAffiliatedContent, true);
});

test("smart-filter and speech settings use the shared background writer for partial updates", async () => {
  const stored = { settings: { unrelated: "kept", faceFilterMode: "off", faceDetectionThreshold: 75, affiliateModuleEnabled: true } };
  const context = vm.createContext({ browser: { storage: { local: { async get() { return structuredClone(stored); }, async set(value) { await new Promise(resolve => setTimeout(resolve, 2)); stored.settings = structuredClone(value.settings); } } }, runtime: { sendMessage(message) { return context.handle(message); } } }, MMP: { DEFAULTS: { settings: {} } }, settingsWriteQueue: Promise.resolve() });
  const start = settings.indexOf("async function sendSettingsSave(message)");
  const end = settings.indexOf("\nfunction showSaveError", start);
  const handlerStart = background.indexOf('if (msg.type === "saveAffiliateSettings" || msg.type === "saveSmartFilterSettings")');
  const handlerEnd = background.indexOf('\n  if (msg.type === "saveSemanticSettings")', handlerStart);
  vm.runInContext(`async function handle(msg){${background.slice(handlerStart, handlerEnd)};};\n${settings.slice(start, end)};this.persist=persistSmartFilterSettings;`, context);
  await Promise.all([context.persist({ faceFilterMode: "blur" }), context.persist({ affiliateModuleEnabled: false }), context.persist({ speechLanguage: "en-US", speechVoiceURI: "voice-en" })]);
  assert.equal(stored.settings.faceFilterMode, "blur");
  assert.equal(stored.settings.affiliateModuleEnabled, false);
  assert.equal(stored.settings.speechLanguage, "en-US");
  assert.equal(stored.settings.speechVoiceURI, "voice-en");
  assert.equal(stored.settings.faceDetectionThreshold, 75);
  assert.equal(stored.settings.unrelated, "kept");
});

test("the background writer serializes smart-filter changes and preserves unrelated settings", async () => {
  const stored = { settings: { unrelated: "kept", affiliateWarningsEnabled: true, hideAffiliatedContent: false } };
  const context = vm.createContext({
    browser: { storage: { local: { async get() { return structuredClone(stored); }, async set(value) { stored.settings = structuredClone(value.settings); } } } },
    MMP: { DEFAULTS: { settings: {} } }, settingsWriteQueue: Promise.resolve()
  });
  const start = background.indexOf('if (msg.type === "saveAffiliateSettings" || msg.type === "saveSmartFilterSettings")');
  const end = background.indexOf('\n  if (msg.type === "saveSemanticSettings")', start);
  assert.notEqual(start, -1); assert.notEqual(end, -1);
  vm.runInContext(`async function handle(msg){${background.slice(start, end)};};this.handle=handle;`, context);
  await context.handle({ type: "saveSmartFilterSettings", settings: { affiliateModuleEnabled: false, affiliateWarningsEnabled: false, hideAffiliatedContent: true, faceFilterMode: "blur", faceDetectionThreshold: 120 } });
  assert.equal(stored.settings.affiliateModuleEnabled, false);
  assert.equal(stored.settings.affiliateWarningsEnabled, false);
  assert.equal(stored.settings.hideAffiliatedContent, true);
  assert.equal(stored.settings.faceFilterMode, "blur");
  assert.equal(stored.settings.faceDetectionThreshold, 90);
  await context.handle({ type: "saveSmartFilterSettings", settings: { speechLanguage: "fr-FR", speechVoiceURI: "voice-fr" } });
  assert.equal(stored.settings.speechLanguage, "fr-FR");
  assert.equal(stored.settings.speechVoiceURI, "voice-fr");
  assert.equal(stored.settings.unrelated, "kept");
});

test("legacy per-wall smart-filter values cannot override global preferences", () => {
  const context = vm.createContext({});
  const start = background.indexOf('const GLOBAL_SETTING_KEYS =');
  const end = background.indexOf("function wallCinemaEnabled", start);
  vm.runInContext(`${background.slice(start, end)};this.combine=settingsForWall;`, context);
  const merged = context.combine({ affiliateModuleEnabled: false, faceFilterMode: "off", faceDetectionThreshold: 60, excludedKeywords: ["global"], excludedCategories: ["news"], priorities: [{ term: "topic", level: "high" }] }, { affiliateModuleEnabled: true, faceFilterMode: "blur", faceDetectionThreshold: 85, excludedKeywords: ["legacy"], excludedCategories: ["legacy"], priorities: [{ term: "old", level: "low" }], mode: "chronological" });
  assert.equal(merged.affiliateModuleEnabled, false);
  assert.equal(merged.faceFilterMode, "off");
  assert.equal(merged.faceDetectionThreshold, 60);
  assert.deepEqual(merged.excludedKeywords, ["global"]);
  assert.deepEqual(merged.excludedCategories, ["news"]);
  assert.deepEqual(merged.priorities, [{ term: "topic", level: "high" }]);
  assert.equal(merged.mode, "chronological");
});

test("the master switch gates affiliate effects while retaining the two saved choices", () => {
  const context = filterHarness();
  const article = { canonicalUrl: "https://shop.example/product?aff_id=123" };
  context.state = { settings: { affiliateModuleEnabled: false, affiliateWarningsEnabled: false, hideAffiliatedContent: true } };
  assert.equal(context.affiliateModuleActive(), false);
  assert.equal(context.shouldHideAffiliate(article), false);
  assert.match(fs.readFileSync(path.join(__dirname, "../settings.html"), "utf8"), /id="affiliateModuleStateOn"[\s\S]*?id="affiliateModuleStateOff"/);
  assert.match(settings, /control\.disabled=!enabled/);
});

test("an inactive master switch disables internal controls without clearing their values", () => {
  const on = { value: "on", checked: false, disabled: false }, off = { value: "off", checked: true, disabled: false };
  const hide = { checked: true, disabled: false };
  const classes = () => ({ values: new Set(), toggle(name, enabled) { enabled ? this.values.add(name) : this.values.delete(name); } });
  const group = { querySelectorAll: () => [on, off] }, controls = { classList: classes(), setAttribute() {}, querySelectorAll: () => [hide] };
  const card = { classList: classes() }, notice = { hidden: true };
  const context = vm.createContext({
    state: { settings: { affiliateModuleEnabled: false, affiliateWarningsEnabled: false, hideAffiliatedContent: true } },
    $: selector => ({ ".affiliate-state-toggle": group, ".affiliate-settings-card": card, "#affiliateFilterInactiveNotice": notice, "#affiliateControls": controls })[selector],
    syncSmartStateToggle(group, enabled) { on.checked = enabled; off.checked = !enabled; }
  });
  const start = settings.indexOf("function updateAffiliateControls()");
  const end = settings.indexOf("\nfunction updateSensitivityHelp", start);
  vm.runInContext(`${settings.slice(start, end)};this.update=updateAffiliateControls;`, context);
  context.update();
  assert.equal(hide.disabled, true);
  assert.equal(hide.checked, true);
  assert.equal(notice.hidden, false);
  assert.equal(on.disabled, false);
  context.state.settings.affiliateModuleEnabled = true;
  context.update();
  assert.equal(hide.disabled, false);
  assert.equal(hide.checked, true);
});

test("hiding requires a confirmed detector result; suspicious links stay visible", () => {
  const context = filterHarness();
  const article = { canonicalUrl: "https://publisher.example/story?ref=homepage" };
  context.state = { settings: { hideAffiliatedContent: true } };
  assert.equal(context.shouldHideAffiliate(article), false);
  article.canonicalUrl = "https://shop.example/product?aff_id=123";
  assert.equal(context.shouldHideAffiliate(article), true);
  context.state.settings.hideAffiliatedContent = false;
  assert.equal(context.shouldHideAffiliate(article), false);
});

test("a confirmed redirect finding saved on the article remains visible to collapsed-card filtering", () => {
  const context = filterHarness();
  context.state = { settings: { affiliateModuleEnabled: true, hideAffiliatedContent: true } };
  const article = { canonicalUrl: "https://publisher.example/story", affiliateFindings: [{ url: "https://short.example/deal", status: "recognized", ruleId: "aliexpress-tracking", reason: "Destination affiliée" }] };
  assert.equal(context.shouldHideAffiliate(article), true);
  assert.match(background, /cacheAffiliateFindings\(String\(msg\.articleId/);
  assert.match(fs.readFileSync(path.join(__dirname, "../js/db.js"), "utf8"), /async cacheAffiliateFindings\(id, findings\)/);
});

test("the same confirmed-affiliate predicate is applied to every wall rendering path and read-all count", () => {
  const renderFilter = wall.slice(wall.indexOf("function filterSort()"), wall.indexOf("async function setReadingStatus(", wall.indexOf("function filterSort()")));
  const currentWallList = wall.slice(wall.indexOf("function articlesForCurrentWall()"), wall.indexOf("function updateMarkAllReadButton()", wall.indexOf("function articlesForCurrentWall()")));
  assert.match(renderFilter, /visible=all\.filter\(a=>\{if\(pendingIds\.has\(a\.id\)\|\|shouldHideAffiliate\(a\)\)/);
  assert.equal((currentWallList.match(/!shouldHideAffiliate\(a\)/g) || []).length, 4);
  assert.match(wall, /if\(state\?\.settings\?\.hideAffiliatedContent===true&&shouldHideAffiliate\(article\)\)filterSort\(\)/);
});
