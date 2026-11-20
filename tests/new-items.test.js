const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("new articles stay hidden until the user reveals them at the top of the wall", () => {
  const wall = fs.readFileSync(path.join(__dirname, "../js/wall.js"), "utf8");
  assert.match(wall, /pendingIds=new Set\(pendingArticles\.map\(article=>article\.id\)\)/u);
  assert.match(wall, /visible=all\.filter\(a=>\{if\(pendingIds\.has\(a\.id\)/u);
  assert.match(wall, /pendingArticles=\[\];pendingByWall\.set\(state\.activeWallId,\[\]\)/u);
  assert.match(wall, /all=\[\.\.\.incoming,\.\.\.all\.filter\(article=>!incomingIds\.has\(article\.id\)\)\]/u);
  assert.match(wall, /filterSort\(\);\$\("\.feed"\)\.scrollTo\(\{top:0,behavior:"smooth"\}\)/u);
  assert.match(wall, /const filledIds=new Set\(result\.articleIds\|\|\[\]\);\s*pendingArticles=pendingArticles\.filter\(article=>!filledIds\.has\(article\.id\)\)/u);
});
