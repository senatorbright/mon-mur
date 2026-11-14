const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/sources.js"), "utf8");
const start = source.indexOf("function sourceSyncState(");
const end = source.indexOf("function columnValue(", start);
const context = vm.createContext({ state: { refreshStatus: { currentSourceIds: ["source-1"] } }, Number });
vm.runInContext(source.slice(start, end), context);

test("source status distinguishes never synced, running, success, and error without inventing a date", () => {
  const result = vm.runInContext(`[
    sourceSyncState({ id: "source-1", enabled: true }),
    sourceSyncState({ id: "source-2", enabled: true }),
    sourceSyncState({ id: "source-3", enabled: true, status: "ok", lastSuccessfulSync: 123 }),
    sourceSyncState({ id: "source-4", enabled: true, status: "error", lastError: "timeout" })
  ]`, context);
  assert.deepEqual(Array.from(result), ["syncing", "never", "ok", "error"]);
  assert.equal(vm.runInContext("Number(0)", context), 0, "the progress state does not fabricate a successful sync timestamp");
});

test("global progress reports completed, active, and terminal source counts", () => {
  const progress = { startedAt: 10, completedAt: 0, totalSources: 22, processedSources: 7, succeededSources: 6, failedSources: 1, currentSourceIds: ["source-1"] };
  const sources = [{ id: "source-1", name: "Le Monde" }];
  const running = vm.runInContext(`refreshProgressText(${JSON.stringify(progress)}, ${JSON.stringify(sources)})`, context);
  assert.equal(running, "Actualisation en cours : 7 sur 22 sources traitées · en cours : Le Monde.");
  progress.completedAt = 20;
  const finished = vm.runInContext(`refreshProgressText(${JSON.stringify(progress)}, ${JSON.stringify(sources)})`, context);
  assert.equal(finished, "Dernière actualisation terminée : 6 réussie(s), 1 en erreur sur 22 source(s).");
});
