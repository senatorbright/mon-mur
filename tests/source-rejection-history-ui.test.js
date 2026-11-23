const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/url-history.js"), "utf8");

function element() {
  return {
    value: "", textContent: "", disabled: false, children: [],
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    click() { this.clicked = true; }
  };
}

test("the acquisition history displays and exports the first refusal details", async () => {
  const selectors = ["#historySource", "#historyWall", "#historySearch", "#historySort", "#historyRows", "#historySummary", "#historyStatus", "#exportUrlHistory", "#exportFilteredUrlHistory"];
  const elements = new Map(selectors.map(selector => [selector, element()]));
  const evaluatedAt = Date.parse("2026-11-23T09:20:00+01:00");
  const publishedAt = Date.parse("2026-11-23T08:56:00+01:00");
  const cutoffAtDecision = Date.parse("2026-11-23T09:00:00+01:00");
  const row = {
    sourceId: "korben", sourceType: "RSS", sourceName: "Korben", title: "Story", canonicalUrl: "https://example.test/story",
    firstSeenAt: evaluatedAt, publishedAt, datePrecision: "instant", dateIsFallback: false, dateMetadataRecorded: true,
    acquired: false, acquisitionMode: "Automatique", wallNames: ["InfoTech"],
    firstRejection: { rejectionReason: "olderThanLastSync", cutoffAtDecision, evaluatedAt, publishedAt, datePrecision: "instant", dateIsFallback: false }
  };
  let exportedBlob;
  class FakeOption { constructor(text, value) { this.textContent = text; this.value = value; } }
  const context = vm.createContext({
    document: { querySelector: selector => elements.get(selector), createElement: element },
    browser: { runtime: { sendMessage: async () => [row], onMessage: { addListener() {} } } },
    URLSearchParams, Intl, Date, Number, Map, Set, String, Blob, Option: FakeOption,
    URL: { createObjectURL(blob) { exportedBlob = blob; return "blob:history-test"; }, revokeObjectURL() {} },
    location: { search: "" }, setTimeout() { return 1; }
  });
  vm.runInContext(source, context);
  await vm.runInContext("loadHistory()", context);

  const renderedRow = elements.get("#historyRows").children[0];
  assert.equal(renderedRow.children[2].textContent.includes("olderThanLastSync"), true);
  assert.equal(renderedRow.children[2].textContent.includes("23/11/2026"), true);
  assert.equal(renderedRow.children[2].textContent.includes("évaluée le"), true);

  await vm.runInContext("exportHistory(historyRows, document.querySelector('#exportUrlHistory'))", context);
  assert.ok(exportedBlob);
  const csv = await exportedBlob.text();
  assert.match(csv, /"Motif du premier refus"/u);
  assert.match(csv, /"olderThanLastSync"/u);
  assert.match(csv, /"23\/11\/2026/u);
  assert.match(csv, /"Automatique"/u);
});
