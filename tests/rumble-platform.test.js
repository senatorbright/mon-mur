"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
const start = background.indexOf("async function fetchRumbleSearch(");
const end = background.indexOf("async function rumbleEmbedUrl(", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const searchSource = background.slice(start, end);

function harness({ hide = true, permission = true } = {}) {
  const created = [];
  const context = vm.createContext({
    URL,
    rumbleSearchPage: async () => ({ videos: [{ href: "https://rumble.com/vabc-test.html" }], cardCount: 1, next: "" }),
    browser: {
      tabs: {
        create: async options => { created.push(options); return { id: 7 }; },
        hide: hide ? async () => [7] : undefined,
        remove: async () => {}
      },
      permissions: { contains: async () => permission }
    }
  });
  vm.runInContext(searchSource, context);
  return { context, created };
}

test("Rumble reports unavailable tab hiding before creating an invisible search tab", async () => {
  for (const options of [{ hide: false }, { permission: false }]) {
    const h = harness(options);
    await assert.rejects(
      vm.runInContext('fetchRumbleSearch("actualité", {aborted:false})', h.context),
      /masquage d’onglet, indisponible dans cette version de Firefox/
    );
    assert.deepEqual(h.created, []);
  }
});

test("Rumble search continues on Firefox when hidden tabs are supported and authorized", async () => {
  const h = harness();
  const result = await vm.runInContext('fetchRumbleSearch("actualité", {aborted:false})', h.context);
  assert.equal(h.created.length, 1);
  assert.equal(h.created[0].url, "about:blank");
  assert.equal(h.created[0].active, false);
  assert.equal(result.pages, 1);
  assert.equal(result.cards, 1);
  assert.equal(result.videos.length, 1);
});
