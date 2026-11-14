const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
const start = source.indexOf("function markSourceAttempt(");
const end = source.indexOf("async function recordAutomaticHistory", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const context = vm.createContext({ Date });
vm.runInContext(source.slice(start, end), context);

test("source attempts persist their timestamp on the source record", () => {
  const result = vm.runInContext("(() => { const source = {}; const timestamp = markSourceAttempt(source, 1234); return [source.lastAttemptAt, timestamp]; })()", context);
  assert.deepEqual(Array.from(result), [1234, 1234]);
});
