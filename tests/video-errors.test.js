const test = require("node:test");
const assert = require("node:assert/strict");
const { describeHlsFatalError } = require("../js/video-errors.js");

test("network errors expose HTTP status without leaking the signed stream URL", () => {
  const message = describeHlsFatalError({
    type: "networkError",
    details: "manifestLoadError",
    response: { code: 403 },
    url: "https://media.example/master.m3u8?token=secret"
  });
  assert.match(message, /HTTP 403/);
  assert.match(message, /networkError \/ manifestLoadError/);
  assert.doesNotMatch(message, /media\.example|secret/);
});

test("codec failures are separated from network failures", () => {
  const message = describeHlsFatalError({ type: "mediaError", details: "bufferIncompatibleCodecsError" });
  assert.match(message, /codecs incompatibles/);
  assert.match(message, /bufferIncompatibleCodecsError/);
});

test("manifest parsing failures are not reported as missing network access", () => {
  const message = describeHlsFatalError({ type: "networkError", details: "manifestParsingError" });
  assert.match(message, /reçu/);
  assert.match(message, /manifestParsingError/);
  assert.doesNotMatch(message, /réseau, CORS/);
});

test("protected playback is identified without attempting to bypass it", () => {
  const message = describeHlsFatalError({ type: "keySystemError", details: "keySystemNoAccess" });
  assert.match(message, /lecture protégée/);
  assert.match(message, /keySystemNoAccess/);
});
