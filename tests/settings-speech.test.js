const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "../js/settings.js"), "utf8");
const speechCode = script.slice(script.indexOf("function normalizeSpeechLanguage("), script.indexOf("async function saveSpeechPreference("));

function makeSelect() {
  return {
    options: [],
    _value: "",
    replaceChildren(...options) { this.options = options; this._value = ""; },
    append(option) { this.options.push(option); },
    set value(value) { this._value = this.options.some(option => option.value === value) ? value : ""; },
    get value() { return this._value; },
    disabled: false
  };
}

function renderHarness(voices = []) {
  const elements = {
    "#speechLanguage": makeSelect(),
    "#speechVoice": makeSelect(),
    "#speechTest": { disabled: false },
    "#speechPreferenceStatus": { textContent: "" }
  };
  const speech = {
    synth: {},
    language: "",
    voiceURI: "",
    voices: () => voices,
    setLanguage(value) { this.language = value; },
    setVoice(value) { this.voiceURI = value; }
  };
  const context = vm.createContext({
    Intl,
    Map,
    Array,
    String,
    document: { createElement: () => ({ value: "", textContent: "" }) },
    $: selector => elements[selector],
    settingsSpeech: speech,
    state: undefined
  });
  vm.runInContext(`${speechCode};this.renderSpeechPreferences=renderSpeechPreferences;this.normalizeSpeechLanguage=normalizeSpeechLanguage;`, context);
  return { context, elements, speech };
}

test("legacy fr_FR language is normalized for display and speech while preserving the voice URI", () => {
  const { context, elements, speech } = renderHarness([{ name: "Piper FR", lang: "fr-FR", voiceURI: "piper:fr_FR", isDefault: true }]);
  context.renderSpeechPreferences({ speechLanguage: "fr_FR", speechVoiceURI: "piper:fr_FR" });

  assert.equal(elements["#speechLanguage"].value, "fr-FR");
  assert.equal(speech.language, "fr-FR");
  assert.equal(elements["#speechVoice"].value, "piper:fr_FR");
  assert.equal(speech.voiceURI, "piper:fr_FR");
});

test("valid fr-FR remains selected", () => {
  const { context, elements, speech } = renderHarness();
  context.renderSpeechPreferences({ speechLanguage: "fr-FR", speechVoiceURI: "" });

  assert.equal(elements["#speechLanguage"].value, "fr-FR");
  assert.equal(speech.language, "fr-FR");
});

test("unknown or unavailable saved language safely falls back to fr-FR", () => {
  const { context, elements, speech } = renderHarness([{ name: "English", lang: "en-US", voiceURI: "voice-en", isDefault: true }]);
  context.renderSpeechPreferences({ speechLanguage: "zz-ZZ", speechVoiceURI: "" });

  assert.equal(elements["#speechLanguage"].value, "fr-FR");
  assert.equal(speech.language, "fr-FR");
});

test("invalid speech preference does not interrupt subsequent preferences initialization", () => {
  const { context, elements } = renderHarness();
  let laterSettingsInitialized = false;

  assert.doesNotThrow(() => {
    context.renderSpeechPreferences({ speechLanguage: "fr_FR", speechVoiceURI: "" });
    laterSettingsInitialized = true;
  });
  assert.equal(elements["#speechLanguage"].value, "fr-FR");
  assert.equal(laterSettingsInitialized, true);
});

test("empty tab request does not pass an empty ID to getElementById", () => {
  const tabLookup = script.match(/targetTab=([^;]+);activateSettingsTab/);
  assert.ok(tabLookup);
  assert.match(tabLookup[1], /requestedTab\?/);
  assert.match(tabLookup[1], /document\.getElementById\(id\)/);
});
