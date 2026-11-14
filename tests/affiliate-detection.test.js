const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("the wall loads the affiliate detector before its rendering code", () => {
  const html = fs.readFileSync(path.join(__dirname, "../wall.html"), "utf8");
  const detectorScript = html.indexOf('src="js/affiliate-detection.js"');
  const wallScript = html.indexOf('src="js/wall.js"');
  assert.notEqual(detectorScript, -1, "the wall must load the detector module");
  assert.ok(detectorScript < wallScript, "the detector must exist before wall.js renders cards");
});

const context = vm.createContext({ URL, window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/affiliate-detection.js"), "utf8"), context);
const detector = context.window.MMAffiliate;

test("recognizes explicit affiliate identifiers and documented platform formats", () => {
  const samples = [
    ["https://boutique.example/produit?aff_id=12345", "explicit-affiliate-id"],
    ["https://www.amazon.fr/dp/B000000000?tag=exemple-21", "amazon-tag"],
    ["https://amzn.to/abc123", "amazon-short-link"],
    ["https://s.click.aliexpress.com/e/_c38nfTan", "aliexpress-tracking"],
    ["https://www.awin1.com/cread.php?awinmid=123&awinaffid=456", "awin"],
    ["https://www.hostinger.com/fr?utm_medium=affiliate&utm_source=aff5922", "utm-affiliate-attribution"],
    ["https://www.shareasale.com/r.cfm?u=123&m=456", "shareasale"],
    ["https://click.linksynergy.com/deeplink?id=abc&offerid=456", "rakuten-linkshare"],
    ["https://prf.hn/click/camref:123", "partnerize"],
    ["https://tidd.ly/abc123", "tiddly"]
  ];
  for (const [url, ruleId] of samples) assert.equal(detector.classify(url).ruleId, ruleId, url);
});

test("keeps explicit UTM affiliation evidence and recognizes it at the final Hostinger redirect URL", async () => {
  const destination = "https://hostinger.com/fr?coupon_cookie=darrel10&utm_medium=affiliate&utm_source=aff5922&utm_campaign=268&session=102c303c9f8b11dcfe8724e0d904bc";
  const direct = detector.classify(destination);
  assert.equal(direct.status, "recognized");
  assert.equal(direct.ruleId, "utm-affiliate-attribution");
  assert.deepEqual(JSON.parse(JSON.stringify(direct.evidence)), ["utm_medium=affiliate", "utm_source=aff5922"]);
  const copied = detector.classify(destination.replaceAll("&", "&amp;"));
  assert.deepEqual(JSON.parse(JSON.stringify(copied.evidence)), ["utm_medium=affiliate", "utm_source=aff5922"], "HTML-escaped query separators retain the same evidence");

  const initial = "https://www.darrelwilson.com/hostinger-france";
  const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const start = background.indexOf("const affiliateResolutionCache = new Map();");
  const end = background.indexOf("function feedMethod(", start);
  const harness = vm.createContext({
    URL, Map, Date, Set, AbortController, clearTimeout, setTimeout,
    browser: { permissions: { async contains() { return true; } } },
    async fetch(url) {
      if (url === initial) return { status: 302, headers: { get(key) { return key === "location" ? destination : null; } } };
      assert.equal(url, destination);
      return { status: 200, headers: { get() { return null; } } };
    }
  });
  vm.runInContext(`async function accessible(){return true;}\n${background.slice(start, end)};this.resolve=resolveAffiliateLinks;`, harness);
  const [resolved] = await harness.resolve([initial]);
  assert.equal(resolved.finalUrl, destination);
  assert.deepEqual(JSON.parse(JSON.stringify(resolved.chain)), [initial, destination]);
  const finding = resolved.chain.map(url => detector.classify(url)).find(item => item?.status === "recognized");
  assert.equal(finding.status, "recognized");
  assert.deepEqual(JSON.parse(JSON.stringify(finding.evidence)), ["utm_medium=affiliate", "utm_source=aff5922"]);
  assert.doesNotMatch(finding.reason, /malveillant|dangereux|sécurisé/iu, "an affiliate classification does not claim that the destination is malicious or safe");
});

test("resolves the Clubic commercial link to an existing affiliate signature without treating redirects as proof", async () => {
  const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const start = background.indexOf("const affiliateResolutionCache = new Map();");
  const end = background.indexOf("function feedMethod(", start);
  assert.notEqual(start, -1); assert.notEqual(end, -1);
  let requested = 0;
  const harness = vm.createContext({
    URL, Map, Date, Set, AbortController, clearTimeout, setTimeout,
    browser: { permissions: { async contains() { return true; } } },
    async fetch(url, options) {
      requested++;
      assert.equal(options.method, "HEAD");
      assert.equal(options.credentials, "omit");
      assert.equal(options.referrerPolicy, "no-referrer");
      assert.equal(options.redirect, "manual");
      if (url === "https://clubi.cc/cd380db160892697") return { status: 302, headers: { get(key) { return key === "location" ? "https://s.click.aliexpress.com/e/_c38nfTan" : null; } } };
      return { status: 200, headers: { get() { return null; } } };
    }
  });
  vm.runInContext(`async function accessible(url){return browser.permissions.contains({origins:["<all_urls>"]});}\n${background.slice(start, end)};this.resolve=resolveAffiliateLinks;`, harness);
  const [resolved] = await harness.resolve(["https://clubi.cc/cd380db160892697"]);
  assert.equal(resolved.resolved, true);
  assert.equal(resolved.redirected, true);
  assert.equal(detector.classify(resolved.finalUrl).ruleId, "aliexpress-tracking");
  assert.equal(requested, 2);
  const [cached] = await harness.resolve(["https://clubi.cc/cd380db160892697"]);
  assert.equal(cached.finalUrl, resolved.finalUrl);
  assert.equal(requested, 2, "a cached redirect must not trigger another request");

  harness.fetch = async url => url === "https://short.example/x"
    ? ({ status: 302, headers: { get(key) { return key === "location" ? "https://shop.example/product" : null; } } })
    : ({ status: 200, headers: { get() { return null; } } });
  const [ordinary] = await harness.resolve(["https://short.example/x"]);
  assert.equal(ordinary.redirected, true);
  assert.equal(detector.classify(ordinary.finalUrl), null, "a redirect to an ordinary URL is not an affiliate finding");
});

test("checks an ordinary-looking description URL and recognizes the observed Hostinger redirect destination", async () => {
  const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const start = background.indexOf("const affiliateResolutionCache = new Map();");
  const end = background.indexOf("function feedMethod(", start);
  let requested = 0;
  const harness = vm.createContext({
    URL, Map, Date, Set, AbortController, clearTimeout, setTimeout,
    browser: { permissions: { async contains() { return true; } } },
    async fetch(url, options) {
      requested++;
      assert.equal(options.method, "HEAD");
      assert.equal(options.redirect, "manual");
      if (url === "https://www.hostinger.com/fr/visionia") return { status: 301, headers: { get(key) { return key === "location" ? "https://www.hostg.xyz/aff_c?offer_id=48&aff_id=215667&url_id=6246" : null; } } };
      assert.equal(url, "https://www.hostg.xyz/aff_c?offer_id=48&aff_id=215667&url_id=6246");
      return { status: 200, headers: { get() { return null; } } };
    }
  });
  vm.runInContext(`async function accessible(url){return browser.permissions.contains({origins:[new URL(url).origin+"/*"]});}\n${background.slice(start, end)};this.resolve=resolveAffiliateLinks;`, harness);
  const [result] = await harness.resolve(["https://www.hostinger.com/fr/visionia"]);
  assert.equal(requested, 2, "a URL without an affiliate marker is still checked, including its destination");
  assert.equal(result.redirected, true);
  assert.equal(result.chain.length, 2);
  assert.equal(detector.classify(result.finalUrl).status, "recognized");
  assert.equal(detector.classify(result.finalUrl).ruleId, "explicit-affiliate-id");
});

test("reports a missing host permission as unverified without making a request", async () => {
  const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const start = background.indexOf("const affiliateResolutionCache = new Map();");
  const end = background.indexOf("function feedMethod(", start);
  let requested = 0;
  const harness = vm.createContext({
    URL, Map, Date, Set, AbortController, clearTimeout, setTimeout,
    browser: { permissions: { async contains() { return false; } } },
    async fetch() { requested++; throw new Error("should not fetch"); }
  });
  vm.runInContext(`async function accessible(){return browser.permissions.contains({origins:["https://shop.example/*"]});}\n${background.slice(start, end)};this.resolve=resolveAffiliateLinks;`, harness);
  const [result] = await harness.resolve(["https://shop.example/campaign"]);
  assert.equal(requested, 0);
  assert.equal(result.status, "unverified");
  assert.match(result.reason, /autorisation/i);
});

test("records and checks every hop in a controlled multi-step HTTP redirect", async () => {
  const background = fs.readFileSync(path.join(__dirname, "../js/background.js"), "utf8");
  const start = background.indexOf("const affiliateResolutionCache = new Map();");
  const end = background.indexOf("function feedMethod(", start);
  const next = new Map([
    ["https://short.example/deal", [302, "https://redirect.example/offer"]],
    ["https://redirect.example/offer", [307, "https://shop.example/product"]]
  ]);
  const requested = [];
  const harness = vm.createContext({
    URL, Map, Date, Set, AbortController, clearTimeout, setTimeout,
    browser: { permissions: { async contains() { return true; } } },
    async fetch(url) {
      requested.push(url);
      const redirect = next.get(url);
      return redirect
        ? { status: redirect[0], headers: { get(key) { return key === "location" ? redirect[1] : null; } } }
        : { status: 200, headers: { get() { return null; } } };
    }
  });
  vm.runInContext(`async function accessible(){return true;}\n${background.slice(start, end)};this.resolve=resolveAffiliateLinks;`, harness);
  const [result] = await harness.resolve(["https://short.example/deal"]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.chain)), ["https://short.example/deal", "https://redirect.example/offer", "https://shop.example/product"]);
  assert.deepEqual(JSON.parse(JSON.stringify(requested)), JSON.parse(JSON.stringify(result.chain)));
  assert.equal(result.status, "verified");
});

test("the displayed video description is wired to background affiliate verification", () => {
  const wall = fs.readFileSync(path.join(__dirname, "../js/wall.js"), "utf8");
  assert.match(wall, /function resolveVideoDescriptionLinks\(article, articleNode\)\{[\s\S]*?const description=articleNode\.querySelector\("\.video-description"\),body=articleNode\.querySelector\("\.expanded-article"\);[\s\S]*?const source=description\.dataset\.affiliateSourceText\|\|description\.textContent;[\s\S]*?const candidates=window\.MMAffiliate\?\.urlsInText\(source\)\|\|\[\],[\s\S]*?return resolveAffiliateCandidates\(article,articleNode,body,candidates,null,browserProbeUrls\);/);
  assert.match(wall, /if\(articleData\.videoDetails&&articleData\.videoDetailsVersion>=2\)\{resolveVideoDescriptionLinks\(articleData,cardNode\);return;\}/);
});

test("does not treat UTM parameters or ref alone as proof of affiliation", () => {
  for (const url of [
    "https://publisher.example/story?utm_source=newsletter&utm_campaign=spring",
    "https://publisher.example/story?ref=homepage",
    "https://publisher.example/story?source=weekly"
  ]) assert.notEqual(detector.classify(url)?.status, "recognized", url);
  assert.equal(detector.classify("https://publisher.example/story?ref=homepage")?.status, "suspected");
  assert.equal(detector.classify("https://publisher.example/story?r=yt20")?.status, "suspected");
  assert.equal(detector.inspectText("https://publisher.example/story?utm_source=x&utm_campaign=y").length, 0);
});

test("detects commercial signals in the supplied YouTube description without flagging its ordinary links", () => {
  const description = [
    "Hostinger : https://www.hostinger.com/fr/visionia",
    "Code Promo -10% : VISIONIA",
    "Académie : https://campus.vision-ia.fr/?r=yt20",
    "Newsletter : https://vision-ia.beehiiv.com/subscribe",
    "Rejoindre la chaîne : https://www.youtube.com/channel/UCyc03X3uRuxM9n7fyRH_gIw/join"
  ].join("\n");
  const findings = detector.inspect({
    canonicalUrl: "https://www.youtube.com/watch?v=H2a8MuxpDWw",
    videoPlatform: "YouTube",
    videoDetails: { description }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(findings.map(({ url, status, ruleId }) => ({ url, status, ruleId })))), [
    { url: "https://www.hostinger.com/fr/visionia", status: "suspected", ruleId: "promotional-context" },
    { url: "https://campus.vision-ia.fr/?r=yt20", status: "suspected", ruleId: "ambiguous-marketing-parameter" }
  ]);
});

test("inspects descriptions supplied by video sources other than YouTube", () => {
  const findings = detector.inspect({
    videoPlatform: "PeerTube",
    videoDetails: { description: "Offre : https://shop.example/?partner=creator" }
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].status, "suspected");
});

test("does not flag an author's subdomain as suspicious without an affiliate signature", () => {
  for (const url of ["https://docs.aylabs.fr/", "https://domadoo.aylabs.fr/"]) {
    assert.equal(detector.classify(url), null, url);
  }
});

test("keeps commercial call-to-action links visible as suspected when redirect resolution is unavailable", () => {
  const link = detector.inspectLink("https://clubi.cc/cd380db160892697", "Découvrir l'offre");
  assert.equal(link.status, "suspected");
  assert.equal(link.ruleId, "commercial-link-context");
  assert.equal(detector.inspectLink("https://shop.example/product", "Lire la suite"), null);
  assert.equal(detector.inspectLink("https://shop.example/product", "Découvrir l'offre").status, "suspected");
});

test("recognizes affiliate signatures in plain text URLs with escaped or HTML-encoded ampersands", () => {
  const cases = [
    ["ProtonVPN : https://go.getproton.me/aff_c?offer_id=7&amp;aff_id=16744&amp;url_id=860", "https://go.getproton.me/aff_c?offer_id=7&amp;aff_id=16744&amp;url_id=860"],
    ["ProtonVPN : https://go.getproton.me/aff_c?offer_id=7\\&aff_id=16744\\&url_id=860", "https://go.getproton.me/aff_c?offer_id=7\\&aff_id=16744\\&url_id=860"]
  ];
  for (const [text, originalUrl] of cases) {
    const finding = detector.inspectText(text)[0];
    assert.equal(finding.status, "recognized");
    assert.equal(finding.ruleId, "explicit-affiliate-id");
    assert.equal(finding.url, originalUrl, "the original URL text is preserved");
  }
});

test("marks UTM links near a discount or promo code as suspected, never confirmed", () => {
  const description = "Gladys Assistant : https://gladysassistant.com/fr/?utm_source=aylabs&utm_campaign=aylabs-ayko-1\n-15% sur Gladys Plus avec le code AYLABS\nhttps://gladysassistant.com/fr/plus/?utm_source=aylabs&utm_campaign=aylabs-ayko-1";
  const findings = detector.inspect({ summary: "Extrait YouTube court", videoDetails: { description } });
  assert.equal(findings.length, 2);
  assert.equal(findings[0].status, "suspected");
  assert.equal(findings[1].status, "suspected");
  assert.ok(findings.every(item => item.ruleId === "promotional-context"));
});

test("inspects article URLs and video descriptions without changing source URLs", () => {
  const article = {
    canonicalUrl: "https://publisher.example/story?utm_source=feed",
    summary: "Outil testé : https://boutique.example/produit?aff_id=12345. Autre lien https://publisher.example/item?ref=weekly"
  };
  const findings = detector.inspect(article);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].status, "recognized");
  assert.equal(findings[1].status, "suspected");
  assert.equal(findings[0].url, "https://boutique.example/produit?aff_id=12345");
  assert.equal(article.summary.includes("aff_id=12345"), true);
  assert.equal(article.canonicalUrl, "https://publisher.example/story?utm_source=feed");
});

test("finds affiliate URLs in a cached YouTube details description on the card data", () => {
  const article = {
    canonicalUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    summary: "Extrait initial sans URL",
    videoDetails: { description: "Ma boutique : https://amzn.to/abc123" }
  };
  const findings = detector.inspect(article);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].status, "recognized");
  assert.equal(findings[0].url, "https://amzn.to/abc123");
});

test("reports each commercial or referral URL from the provided video description", () => {
  const description = [
    "Domadoo : https://domadoo.aylabs.fr",
    "Discord : https://discord.gg/aylabs",
    "Instagram : https://www.instagram.com/aylabs_yt/",
    "Gladys Assistant : https://gladysassistant.com/fr/?utm_source=aylabs&utm_campaign=aylabs-ayko-1 (-15% sur Gladys Plus avec le code AYLABS)",
    "ProtonVPN : https://go.getproton.me/aff_c?offer_id=7&aff_id=16744&url_id=860",
    "iGraal : https://fr.igraal.com/parrainage?parrain=AG_59d219b78f2e3&utm_medium=raf&utm_source=refer_friend"
  ].join("\n");
  const findings = detector.inspectText(description);
  assert.equal(findings.length, 3);
  assert.equal(findings.some(item => item.url === "https://domadoo.aylabs.fr"), false);
  assert.ok(findings.some(item => item.url.startsWith("https://gladysassistant.com/") && item.status === "suspected"));
  assert.ok(findings.some(item => item.url.startsWith("https://go.getproton.me/") && item.status === "recognized"));
  assert.ok(findings.some(item => item.url.startsWith("https://fr.igraal.com/") && item.status === "recognized"));
});
