"use strict";
(function installArticleSpeech(root) {
  const MAX_CHUNK_LENGTH = 1800;

  function splitSpeechText(value, maxLength = MAX_CHUNK_LENGTH) {
    const text = String(value || "").replace(/\s+/gu, " ").trim();
    if (!text) return [];
    const sentences = text.match(/[^.!?…]+[.!?…]+["”’»')\]]*|[^.!?…]+$/gu) || [text];
    const chunks = [];
    let chunk = "";
    for (const sentence of sentences) {
      const part = sentence.trim();
      if (!part) continue;
      if (part.length > maxLength) {
        if (chunk) chunks.push(chunk), chunk = "";
        let remainder = part;
        while (remainder.length > maxLength) {
          let cut = remainder.lastIndexOf(" ", maxLength);
          if (cut < Math.floor(maxLength * 0.6)) cut = maxLength;
          chunks.push(remainder.slice(0, cut).trim());
          remainder = remainder.slice(cut).trim();
        }
        if (remainder) chunk = remainder;
      } else if (!chunk) chunk = part;
      else if (chunk.length + part.length + 1 <= maxLength) chunk += ` ${part}`;
      else { chunks.push(chunk); chunk = part; }
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  }

  class ArticleSpeech {
    constructor(win) {
      this.win = win;
      this.synth = win?.speechSynthesis || null;
      this.voiceList = [];
      this.selectedVoiceURI = "";
      this.language = "fr-FR";
      this.active = null;
      this.voiceListeners = new Set();
      this.refreshVoices = this.refreshVoices.bind(this);
      if (this.synth) {
        this.synth.addEventListener?.("voiceschanged", this.refreshVoices);
        if (!this.synth.addEventListener) this.synth.onvoiceschanged = this.refreshVoices;
        this.refreshVoices();
        if (!this.voiceList.length) {
          let attempts = 0;
          const schedule = delay => {
            const timer = (this.win.setTimeout || setTimeout).call(this.win, retry, delay);
            timer?.unref?.();
          };
          const retry = () => {
            if (this.voiceList.length || attempts++ >= 12) return;
            this.refreshVoices();
            if (!this.voiceList.length) schedule(500);
          };
          schedule(250);
        }
      }
    }
    refreshVoices() {
      this.voiceList = this.synth?.getVoices?.() || [];
      for (const listener of this.voiceListeners) listener(this.voices());
    }
    voices() { return this.voiceList.map(voice => ({ name: voice.name, lang: voice.lang, voiceURI: voice.voiceURI, isDefault: !!voice.default })); }
    onVoicesChanged(listener) { this.voiceListeners.add(listener); listener(this.voices()); return () => this.voiceListeners.delete(listener); }
    setVoice(voiceURI) { this.selectedVoiceURI = String(voiceURI || ""); }
    setLanguage(language) { this.language = /^(?:[a-z]{2,3})(?:-[a-z0-9]{2,8})*$/i.test(String(language || "")) ? String(language) : "fr-FR"; }
    preferredVoice() {
      if (this.selectedVoiceURI) {
        const selected = this.voiceList.find(voice => voice.voiceURI === this.selectedVoiceURI);
        if (selected) return selected;
      }
      const language = this.language.toLocaleLowerCase("en"), baseLanguage = language.split("-")[0];
      return this.voiceList.find(voice => String(voice.lang || "").toLocaleLowerCase("en") === language)
        || this.voiceList.find(voice => String(voice.lang || "").toLocaleLowerCase("en").startsWith(`${baseLanguage}-`))
        || this.voiceList.find(voice => /^fr-fr$/i.test(voice.lang || ""))
        || this.voiceList.find(voice => /^fr(?:-|$)/i.test(voice.lang || ""))
        || this.voiceList.find(voice => voice.default)
        || this.voiceList[0]
        || null;
    }
    speak(text, onState = () => {}) {
      this.stop();
      if (!this.synth || typeof this.win?.SpeechSynthesisUtterance !== "function") {
        onState("unavailable");
        return false;
      }
      const chunks = splitSpeechText(text);
      if (!chunks.length) return false;
      if (!this.voiceList.length) this.refreshVoices();
      if (!this.voiceList.length) { onState("unavailable"); return false; }
      const voice = this.preferredVoice();
      const session = { chunks, index: 0, onState, stopped: false, voice };
      this.active = session;
      const speakNext = () => {
        if (this.active !== session || session.stopped) return;
        if (session.index >= session.chunks.length) {
          this.active = null;
          session.onState("ended");
          return;
        }
        const utterance = new this.win.SpeechSynthesisUtterance(session.chunks[session.index++]);
        if (session.voice) {
          utterance.voice = session.voice;
          utterance.lang = session.voice.lang || "fr-FR";
        } else utterance.lang = "fr-FR";
        utterance.onend = speakNext;
        utterance.onerror = event => {
          if (this.active !== session || session.stopped) return;
          this.active = null;
          session.onState(event?.error === "canceled" ? "stopped" : "error");
        };
        try { this.synth.speak(utterance); session.onState("speaking"); }
        catch { this.active = null; session.onState("error"); }
      };
      speakNext();
      return true;
    }
    pause() { if (!this.active || !this.synth?.speaking) return false; this.synth.pause(); this.active.onState("paused"); return true; }
    resume() { if (!this.active || !this.synth?.paused) return false; this.synth.resume(); this.active.onState("speaking"); return true; }
    stop() {
      const current = this.active;
      if (!current) return false;
      this.active = null;
      current.stopped = true;
      this.synth?.cancel();
      current.onState("stopped");
      return true;
    }
  }

  root.MMArticleSpeech = { ArticleSpeech, splitSpeechText, MAX_CHUNK_LENGTH };
  if (typeof module !== "undefined" && module.exports) module.exports = root.MMArticleSpeech;
})(globalThis);
