const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ArticleSpeech, splitSpeechText, MAX_CHUNK_LENGTH } = require("../js/article-speech.js");

function harness(voices = []) {
  const utterances = [];
  const synth = {
    speaking: false, paused: false, canceled: 0,
    getVoices: () => voices,
    addEventListener() {},
    speak(utterance) { utterances.push(utterance); this.speaking = true; this.paused = false; },
    pause() { this.paused = true; },
    resume() { this.paused = false; },
    cancel() { this.canceled++; this.speaking = false; this.paused = false; }
  };
  class Utterance { constructor(text) { this.text = text; } }
  return { speech: new ArticleSpeech({ speechSynthesis: synth, SpeechSynthesisUtterance: Utterance }), synth, utterances };
}

test("speech chunks cover long text without losing words and stay bounded", () => {
  const text = Array.from({ length: 900 }, (_, index) => `Phrase${index}.`).join(" ");
  const chunks = splitSpeechText(text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= MAX_CHUNK_LENGTH));
  assert.equal(chunks.join(" "), text);
});

test("prefers French France, falls back to a French or Firefox default voice, and honors selection", () => {
  const french = { name: "Voix française", lang: "fr-FR", voiceURI: "fr" };
  const englishDefault = { name: "Default", lang: "en-US", voiceURI: "en", default: true };
  const canadian = { name: "Français Canada", lang: "fr-CA", voiceURI: "ca" };
  const app = harness([englishDefault, canadian, french]);
  const states = [];
  app.speech.speak("Bonjour.", state => states.push(state));
  assert.equal(app.utterances[0].voice, french);
  app.speech.stop();
  app.speech.setVoice("en");
  app.speech.speak("Hello.");
  assert.equal(app.utterances[1].voice, englishDefault);
  assert.deepEqual(states, ["speaking", "stopped"]);

  const fallback = harness([englishDefault, canadian]);
  fallback.speech.speak("Bonjour.");
  assert.equal(fallback.utterances[0].voice, canadian);
  const noFrench = harness([englishDefault]);
  noFrench.speech.speak("Bonjour.");
  assert.equal(noFrench.utterances[0].voice, englishDefault);
});

test("pause, resume, stop, and a second article prevent simultaneous reading", () => {
  const app = harness([{ name: "French", lang: "fr-FR", voiceURI: "fr" }]);
  const firstStates = [], secondStates = [];
  app.speech.speak("Premier article.", state => firstStates.push(state));
  assert.equal(app.speech.pause(), true);
  assert.equal(app.speech.resume(), true);
  app.speech.speak("Deuxième article.", state => secondStates.push(state));
  assert.deepEqual(firstStates, ["speaking", "paused", "speaking", "stopped"]);
  assert.equal(app.utterances.length, 2);
  assert.equal(app.speech.stop(), true);
  assert.deepEqual(secondStates, ["speaking", "stopped"]);
});

test("long articles continue chunk by chunk and unavailable synthesis is reported", () => {
  const app = harness([{ name: "French", lang: "fr-FR", voiceURI: "fr" }]);
  const states = [];
  const longText = Array.from({ length: 900 }, (_, index) => `Phrase${index}.`).join(" ");
  app.speech.speak(longText, state => states.push(state));
  for (let index = 0; index < 20 && app.speech.active; index++) app.utterances[index].onend();
  assert.equal(states.at(-1), "ended");
  assert.equal(app.utterances.map(item => item.text).join(" "), longText);

  const unavailable = new ArticleSpeech({});
  const unavailableStates = [];
  assert.equal(unavailable.speak("Texte.", state => unavailableStates.push(state)), false);
  assert.deepEqual(unavailableStates, ["unavailable"]);

  const noVoices = harness([]);
  const noVoiceStates = [];
  assert.equal(noVoices.speech.speak("Texte.", state => noVoiceStates.push(state)), false);
  assert.deepEqual(noVoiceStates, ["unavailable"]);
  assert.equal(noVoices.utterances.length, 0);
});

test("reading controls live in the sticky toolbar beside the expanded article collapse button", () => {
  const wall = fs.readFileSync(path.join(__dirname, "../js/wall.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../css/expand.css"), "utf8");
  assert.match(wall, /readerToolbar\.append\(topCollapse\)/);
  assert.match(wall, /articleBody\.append\(readerToolbar,status,content,original\)/);
  assert.match(wall, /readerToolbar\.append\(speechControls\)/);
  assert.match(wall, /className="speech-command speech-icon-command"/);
  assert.match(wall, /aria-label",paused\?"Reprendre":"Pause"/);
  assert.match(wall, /title="Arrêter"/);
  assert.doesNotMatch(wall, /pauseButton\.textContent/);
  assert.match(wall, /topCollapse\.onclick=toggleArticle/);
  assert.match(wall, /if\(!expanded\)\s*\{[\s\S]{0,160}activeSpeechArticleId===a\.id\)articleSpeech\.stop\(\)/);
  assert.match(css, /\.expanded-toolbar\{position:sticky/);
  assert.doesNotMatch(wall, /className="speech-voice"/);
});

test("speech language and voice preferences are available in Data and access settings and included in backups", () => {
  const html = fs.readFileSync(path.join(__dirname, "../settings.html"), "utf8");
  const settings = fs.readFileSync(path.join(__dirname, "../js/settings.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../css/app.css"), "utf8");
  assert.match(html, /id="speechLanguage"/);
  assert.match(html, /value="fr-FR">Français \(France\)/);
  assert.match(html, /id="speechVoice"/);
  assert.match(html, /id="speechTestText"/);
  assert.match(html, /id="speechTest"/);
  assert.match(settings, /speechLanguage:stored\.settings\.speechLanguage\|\|"fr-FR"/);
  assert.match(settings, /speechVoiceURI:typeof backup\.speechVoiceURI/);
  assert.match(css, /grid-template-areas:"permission-title \." "search backup" "access speech"/);
});
