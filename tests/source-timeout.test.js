const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
const start = source.indexOf("function sourceTimeout(");
const end = source.indexOf("async function sourceRowsToPersist", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const context = vm.createContext({ Promise, setTimeout, clearTimeout, Math, Error });
vm.runInContext(source.slice(start, end), context);

test("a source operation rejects at its deadline and accepts a result before it", async () => {
  await assert.rejects(
    vm.runInContext("sourceTimeout(new Promise(() => {}), 10)", context),
    /Délai maximal de collecte dépassé/
  );
  const result = await vm.runInContext("sourceTimeout(Promise.resolve('ok'), 100)", context);
  assert.equal(result, "ok");
});
