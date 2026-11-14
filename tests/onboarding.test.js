const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const settingsSource = fs.readFileSync(path.join(__dirname, "../js/settings.js"), "utf8");
const backgroundSource = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
const settingsStart = settingsSource.indexOf("const onboardingDialog=");
const settingsEnd = settingsSource.indexOf('$("#resetExtension")', settingsStart);
assert.notEqual(settingsStart, -1);
assert.notEqual(settingsEnd, -1);
const onboardingMarkup = fs.readFileSync(path.join(__dirname, "../settings.html"), "utf8");

function makeElement(dataset = {}) {
  return {
    dataset, hidden: false, disabled: false, textContent: "", listeners: {},
    addEventListener(type, handler) { this.listeners[type] = handler; },
    closest() { return { dataset: this.dataset }; },
    showModal() { this.open = true; }, close() { this.open = false; }
  };
}

function setup({ origins = [], consent = false, step = 1, complete = false, search = "" } = {}) {
  const panels = [1, 2, 3, 4].map(value => makeElement({ onboardingStep: String(value) }));
  const nexts = [1, 2, 3].map(value => makeElement({ onboardingStep: String(value) }));
  const backs = [2, 3, 4].map(value => makeElement({ onboardingStep: String(value) }));
  const elements = new Map([
    ["#onboardingDialog", makeElement()], ["#onboardingPermissionStatus", makeElement()],
    ["#onboardingAllowSites", makeElement()], ["#onboardingSearchConsentStatus", makeElement()],
    ["#onboardingSearchConsent", makeElement()], ["#onboardingForm", makeElement()],
    ["#onboardingBackup", makeElement()], ["#tab-data", makeElement()], ["#importPreferences", makeElement()]
  ]);
  const saved = {};
  const listeners = { added: [], removed: [] };
  const requested = [], removed = [];
  let currentOrigins = [...origins], currentConsent = consent;
  const permissions = {
    contains: async ({ origins: requestedOrigins }) => requestedOrigins.includes("<all_urls>") && currentOrigins.includes("<all_urls>"),
    getAll: async () => ({ origins: currentOrigins, data_collection: ["searchTerms"].filter(() => currentConsent) }),
    request: async request => { requested.push(request); if (request.data_collection) currentConsent = true; return true; },
    remove: async request => { removed.push(request); if (request.data_collection) currentConsent = false; return true; },
    onAdded: { addListener: handler => listeners.added.push(handler) },
    onRemoved: { addListener: handler => listeners.removed.push(handler) }
  };
  const context = vm.createContext({
    $, URL, URLSearchParams,
    document: { querySelectorAll(selector) {
      if (selector === "[data-onboarding-step]") return panels;
      if (selector === "[data-onboarding-next]") return nexts;
      if (selector === "[data-onboarding-back]") return backs;
      return [];
    } },
    browser: {
      storage: { local: { get: async () => ({ settingsOnboardingComplete: complete, settingsOnboardingStep: step }), set: async values => Object.assign(saved, values) } },
      permissions,
      runtime: { getManifest: () => ({ host_permissions: ["https://www.youtube.com/*", "https://archive.org/*"] }) }
    },
    location: { href: "", search }
  });
  function $(selector) { return elements.get(selector) || null; }
  vm.runInContext(settingsSource.slice(settingsStart, settingsEnd), context);
  return new Promise(resolve => setImmediate(() => resolve({ elements, panels, next: nexts[0], nexts, saved, requested, removed, permissions, context })));
}

test("a new install opens the onboarding tab", async () => {
  const start = backgroundSource.indexOf("browser.runtime.onInstalled.addListener(details => {");
  const end = backgroundSource.indexOf("\n});", start) + 4;
  assert.notEqual(start, -1);
  const opened = [];
  let installHandler;
  const context = vm.createContext({ init: async () => {}, browser: {
    runtime: { getURL: pathName => `moz-extension://test/${pathName}`, onInstalled: { addListener: handler => { installHandler = handler; } } },
    storage: { local: { get: async () => ({ walls: [], sources: [] }) } },
    tabs: { create: options => { opened.push(options.url); return Promise.resolve({ id: 1 }); } }
  } });
  vm.runInContext(backgroundSource.slice(start, end), context);
  assert.equal(typeof installHandler, "function");
  installHandler({ reason: "install" });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(opened, ["moz-extension://test/settings.html?onboarding=1"]);
  installHandler({ reason: "update" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(opened.length, 1);
});

test("first install starts on the welcome page, then shows optional permissions", async () => {
  const { elements, nexts, panels } = await setup({ search: "?onboarding=1" });
  assert.equal(elements.get("#onboardingDialog").open, true);
  assert.equal(panels[0].hidden, false);
  assert.doesNotMatch(onboardingMarkup.slice(onboardingMarkup.indexOf('id="onboardingStep1"'), onboardingMarkup.indexOf('id="onboardingStep2"')), /Autoriser tous les sites|Autoriser les recherches automatiques/);
  await nexts[0].listeners.click();
  assert.equal(panels[1].hidden, false);
  assert.match(elements.get("#onboardingPermissionStatus").textContent, /Aucun accès ciblé/);
  assert.match(elements.get("#onboardingPermissionStatus").textContent, /global est facultatif/);
  assert.match(elements.get("#onboardingSearchConsentStatus").textContent, /Désactivé/);
  assert.equal(nexts[0].disabled, false);
});

test("a completed onboarding opens again from the help link without clearing completion", async () => {
  const { elements, panels, saved } = await setup({ complete: true, search: "?onboarding=1", step: 4 });
  assert.equal(elements.get("#onboardingDialog").open, true);
  assert.equal(panels[0].hidden, false);
  assert.equal(saved.settingsOnboardingComplete, undefined);
  for (const page of ["wall.html", "sources.html", "likes.html", "settings.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    assert.match(html, /href="settings\.html\?onboarding=1"[^>]*>.*?Guide et aide/s);
  }
});

test("completed onboarding stays closed unless the user follows the help link", async () => {
  const { elements } = await setup({ complete: true });
  assert.notEqual(elements.get("#onboardingDialog").open, true);
});

test("all four steps can be traversed and completion remains unchanged", async () => {
  const { panels, nexts, elements, saved, context } = await setup({ search: "?onboarding=1" });
  for (let step = 0; step < 3; step++) {
    await nexts[step].listeners.click();
    assert.equal(panels[step + 1].hidden, false);
  }
  await elements.get("#onboardingForm").listeners.submit({ preventDefault() {} });
  assert.equal(saved.settingsOnboardingComplete, true);
  assert.equal(context.location.href, "wall.html?wall=wall-actus");
});

test("targeted grants are shown while built-in hosts are not mistaken for user grants", async () => {
  const { elements, next, nexts } = await setup({ origins: ["https://www.youtube.com/*", "https://news.example/*"], search: "?onboarding=1" });
  await nexts[0].listeners.click();
  assert.match(elements.get("#onboardingPermissionStatus").textContent, /news.example/);
  assert.doesNotMatch(elements.get("#onboardingPermissionStatus").textContent, /youtube/);
  assert.equal(elements.get("#onboardingAllowSites").hidden, false);
  assert.equal(next.disabled, false);
});

test("global grant is reflected and its button disappears", async () => {
  const { elements, nexts } = await setup({ origins: ["<all_urls>"], search: "?onboarding=1" });
  await nexts[0].listeners.click();
  assert.match(elements.get("#onboardingPermissionStatus").textContent, /Accès global accordé/);
  assert.equal(elements.get("#onboardingAllowSites").hidden, true);
});

test("search consent can be enabled and disabled without blocking navigation", async () => {
  const { elements, next, nexts, panels, requested, removed } = await setup({ search: "?onboarding=1" });
  await nexts[0].listeners.click();
  const button = elements.get("#onboardingSearchConsent");
  await button.listeners.click();
  assert.equal(requested[0].data_collection[0], "searchTerms");
  assert.match(elements.get("#onboardingSearchConsentStatus").textContent, /Activé/);
  assert.match(button.textContent, /Désactiver/);
  await nexts[1].listeners.click();
  assert.equal(panels[2].hidden, false);
  await button.listeners.click();
  assert.equal(removed[0].data_collection[0], "searchTerms");
  assert.match(elements.get("#onboardingSearchConsentStatus").textContent, /Désactivé/);
  assert.equal(next.disabled, false);
});

test("reopening after reset reflects retained built-in access and search consent", async () => {
  const { elements, panels } = await setup({ origins: ["https://www.youtube.com/*", "https://archive.org/*"], consent: true, search: "?onboarding=1" });
  assert.equal(elements.get("#onboardingDialog").open, true);
  assert.match(elements.get("#onboardingSearchConsentStatus").textContent, /Activé/);
  assert.equal(panels[0].hidden, false);
});

test("the four pages retain wall, filtering, source-following, and backup guidance", () => {
  const pages = [1, 2, 3, 4].map(step => {
    const start = onboardingMarkup.indexOf(`id="onboardingStep${step}"`);
    const end = step < 4 ? onboardingMarkup.indexOf(`id="onboardingStep${step + 1}"`, start) : onboardingMarkup.indexOf("</form>", start);
    return onboardingMarkup.slice(start, end);
  });
  assert.equal(pages.length, 4);
  assert.match(pages[0], /gratuit.*sans compte ni abonnement/s);
  assert.match(pages[0], /besoins personnels de son développeur/);
  assert.match(pages[0], /conservées dans Firefox/);
  assert.match(pages[0], /pas de compte ni de serveur central/);
  assert.match(pages[1], /Accès aux sites web/);
  assert.match(pages[1], /mots-clés sont transmis aux services de recherche activés/);
  assert.match(pages[1], /titre de certains articles.*rechercher des informations complémentaires/s);
  assert.match(pages[1], /flux des sites suivis restent utilisables sans lui/);
  assert.match(pages[1], /peuvent voir l’adresse IP/);
  assert.doesNotMatch(pages[1], /https?:\/\//i);
  assert.match(pages[2], /onboarding-wall-preview/);
  assert.match(pages[2], /Filtrez les contenus/);
  assert.match(pages[2], /onboardingBackup/);
  assert.match(pages[3], /Visitez le site/);
  assert.match(pages[3], /barre d’outils de Firefox/);
  assert.doesNotMatch(pages[3], /popup Mon Mur|ouvrir la popup/i);
  assert.match(pages[3], /onboarding-popup-preview/);
  assert.match(pages[3], /finishOnboarding/);
});
