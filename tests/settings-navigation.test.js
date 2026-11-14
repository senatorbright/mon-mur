const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "../settings.html"), "utf8");
const script = fs.readFileSync(path.join(__dirname, "../js/settings.js"), "utf8");
const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*id="([^"]+)"[^>]*aria-controls="([^"]+)"/g)];
const panels = [...html.matchAll(/<section[^>]*id="([^"]+)"[^>]*role="tabpanel"[^>]*aria-labelledby="([^"]+)"[^>]*>/g)];

test("tab click handlers are installed before other settings initialization can fail", () => {
  assert.ok(script.indexOf("const settingsTabList=") < script.indexOf("const settingsSpeech="));
  assert.ok(script.indexOf("smartFilterSaveQueue=Promise.resolve()") < script.indexOf("function persistSmartFilterSettings(patch)"));
  assert.ok(script.indexOf('id of ["hideAffiliatedContent"') < script.indexOf("const settingsSpeech="));
  assert.ok(script.indexOf('$("#faceFilterMode").addEventListener') < script.indexOf("const settingsSpeech="));
});

test("every preferences tab points to one labelled panel, including wall and smart-filter controls", () => {
  assert.equal(tabs.length, 4);
  assert.equal(panels.length, 4);
  for (const [, tabId, panelId] of tabs) {
    assert.ok(panels.some(([, id, labelledBy]) => id === panelId && labelledBy === tabId), `${tabId} must control ${panelId}`);
  }
  assert.match(html, /id="panel-walls"[\s\S]*?id="autoInternetArchiveEnabled"[\s\S]*?class="wall-extra-settings"[\s\S]*?<\/section>\s*<section id="panel-filters"/);
  assert.match(html, /id="panel-smart"[\s\S]*?id="faceFilterMode"[\s\S]*?id="hideAffiliatedContent"[\s\S]*?<\/section>\s*<section id="panel-data"/);
  assert.match(html, /id="affiliateModuleStateOn"[^>]*checked/);
});

test("activating each preferences tab shows only its panel and updates keyboard focus state", () => {
  const tabElements = tabs.map(([, id, controls]) => ({ id, controls, attrs: {}, setAttribute(name, value) { this.attrs[name] = value; }, getAttribute(name) { return name === "aria-controls" ? this.controls : this.attrs[name]; } }));
  const panelElements = panels.map(([, id]) => ({ id, hidden: true }));
  const context = vm.createContext({ document: { querySelectorAll(selector) { return selector === "[role=tab]" ? tabElements : panelElements; } } });
  const start = script.indexOf("function activateSettingsTab(");
  const end = script.indexOf("const settingsTabList=", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  vm.runInContext(`${script.slice(start, end)};this.activateSettingsTab=activateSettingsTab;`, context);

  for (const tab of tabElements) {
    context.activateSettingsTab(tab);
    assert.equal(tab.attrs["aria-selected"], "true");
    assert.equal(tab.tabIndex, 0);
    for (const other of tabElements.filter(item => item !== tab)) {
      assert.equal(other.attrs["aria-selected"], "false");
      assert.equal(other.tabIndex, -1);
    }
    for (const panel of panelElements) assert.equal(panel.hidden, panel.id !== tab.controls);
  }
});
