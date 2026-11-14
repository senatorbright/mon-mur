(() => {
  "use strict";
  const canvases = new Map(), results = new Map(), pending = new WeakSet(), pendingStyles = new WeakMap(), revealed = new WeakSet(), revealAttributes = new WeakMap(), revealListeners = new WeakSet();
  let mode = "off", threshold = 75, framePending = false;
  let wallId = new URLSearchParams(location.search).get("wall") || "";
  let wallSettings = {};
  const filterAllowed = () => wallId === "auto-youtube" || wallId === "auto-bluesky" || wallSettings[wallId]?.faceFilterEnabled === true;
  const faceFilterImage = image => image.matches(".cover") && image.closest(".card");
  function fit(image, photo, width, height) {
    const style = getComputedStyle(image), iw = photo.naturalWidth, ih = photo.naturalHeight;
    let dw = width, dh = height;
    if (["cover", "contain", "scale-down"].includes(style.objectFit)) {
      const scale = style.objectFit === "cover" ? Math.max(width / iw, height / ih) : Math.min(width / iw, height / ih);
      dw = iw * scale; dh = ih * scale;
    }
    return { sx: dw / iw, sy: dh / ih, ox: (width - dw) / 2, oy: (height - dh) / 2, dw, dh };
  }
  function blurWhileScanning(image) {
    if (!pendingStyles.has(image)) pendingStyles.set(image, { value: image.style.getPropertyValue("filter"), priority: image.style.getPropertyPriority("filter") });
    image.style.setProperty("filter", "blur(18px)", "important");
  }
  function restoreAfterScan(image) {
    const previous = pendingStyles.get(image);
    if (!previous) return;
    if (previous.value) image.style.setProperty("filter", previous.value, previous.priority);
    else image.style.removeProperty("filter");
    pendingStyles.delete(image);
  }
  function setRevealControl(image, isRevealed) {
    if (!revealAttributes.has(image)) revealAttributes.set(image, { role: image.getAttribute("role"), tabindex: image.getAttribute("tabindex"), label: image.getAttribute("aria-label"), title: image.getAttribute("title") });
    image.setAttribute("role", "button"); image.tabIndex = 0;
    const label = isRevealed ? "Visages révélés. Double-cliquez ou appuyez sur Entrée pour les flouter à nouveau." : "Visages floutés. Double-cliquez ou appuyez sur Entrée pour les révéler temporairement.";
    image.setAttribute("aria-label", label); image.title = label;
    image.classList.toggle("face-filter-revealed", isRevealed); image.classList.add("face-filter-reveal");
    if (revealListeners.has(image)) return;
    revealListeners.add(image);
    const toggleReveal = event => {
      if (mode !== "blur" || !canvases.get(image)?.faces.length) return;
      event.preventDefault(); event.stopPropagation();
      if (revealed.has(image)) revealed.delete(image); else revealed.add(image);
      setRevealControl(image, revealed.has(image));
      const overlay = canvases.get(image)?.canvas;
      if (overlay) overlay.style.display = revealed.has(image) ? "none" : "block";
      if (!revealed.has(image)) schedule();
    };
    image.addEventListener("dblclick", toggleReveal);
    image.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") toggleReveal(event); });
  }
  function clearRevealControl(image) {
    revealed.delete(image); image.classList.remove("face-filter-reveal", "face-filter-revealed");
    const previous = revealAttributes.get(image); if (!previous) return;
    for (const [key, value] of [["role", previous.role], ["tabindex", previous.tabindex], ["aria-label", previous.label], ["title", previous.title]]) { if (value === null) image.removeAttribute(key); else image.setAttribute(key, value); }
    revealAttributes.delete(image);
  }
  function paint(image, item) {
    const { canvas, photo, faces } = item, rect = image.getBoundingClientRect();
    if (!image.isConnected || rect.width < 2 || rect.height < 2 || !image.closest(".card")?.isConnected) { canvas.style.display = "none"; return; }
    const width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height));
    canvas.style.display = "block"; canvas.style.left = `${rect.left}px`; canvas.style.top = `${rect.top}px`;
    canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const context = canvas.getContext("2d"); context.clearRect(0, 0, width, height);
    const transform = fit(image, photo, width, height), radius = Math.max(12, Math.min(35, Math.round(Math.min(width, height) * .085)));
    context.drawImage(photo, transform.ox, transform.oy, transform.dw, transform.dh);
    for (const face of faces) {
      const cx = transform.ox + (face.x + face.width / 2) * transform.sx, cy = transform.oy + (face.y + face.height / 2) * transform.sy;
      const fw = face.width * transform.sx * 1.3, fh = face.height * transform.sy * 1.4;
      context.save(); context.beginPath(); context.ellipse(cx, cy, Math.max(1, fw / 2), Math.max(1, fh / 2), 0, 0, Math.PI * 2); context.clip();
      context.filter = `blur(${radius}px)`; context.drawImage(photo, transform.ox, transform.oy, transform.dw, transform.dh); context.restore();
    }
  }
  function schedule() { if (!framePending) { framePending = true; requestAnimationFrame(() => { framePending = false; for (const [image, item] of canvases) { if (!image.isConnected || (image.currentSrc || image.src) !== item.src) { item.canvas.remove(); canvases.delete(image); clearRevealControl(image); continue; } if (mode === "blur" && item.faces.length && !revealed.has(image)) paint(image, item); else item.canvas.style.display = "none"; } }); } }
  async function apply(image, result) {
    if (!filterAllowed() || mode === "off") { image.closest(".card")?.removeAttribute("data-face-filter-hidden"); restoreAfterScan(image); return; }
    const detected = result.detections.filter(face => face.score >= threshold / 100);
    const article = image.closest(".card");
    if (mode === "off" || !detected.length) { article?.removeAttribute("data-face-filter-hidden"); const previous = canvases.get(image); if (previous) previous.faces = []; clearRevealControl(image); restoreAfterScan(image); schedule(); return; }
    if (mode === "hide") { article?.setAttribute("data-face-filter-hidden", ""); const previous = canvases.get(image); if (previous) previous.faces = []; clearRevealControl(image); restoreAfterScan(image); schedule(); return; }
    article?.removeAttribute("data-face-filter-hidden");
    let item = canvases.get(image);
    if (!item) {
      const photo = new Image(); photo.src = result.data; await photo.decode();
      if (!image.isConnected || (image.currentSrc || image.src) !== result.src) return;
      const canvas = document.createElement("canvas"); canvas.setAttribute("aria-hidden", "true");
      // Keep the overlay above the card but below the sticky wall header.
      Object.assign(canvas.style, { position: "fixed", zIndex: "2", pointerEvents: "none", margin: "0", padding: "0", border: "0" });
      document.documentElement.append(canvas); item = { canvas, photo, faces: detected, src: result.src }; canvases.set(image, item);
    } else item.faces = detected;
    item.canvas.style.borderRadius = getComputedStyle(image).borderRadius;
    setRevealControl(image, revealed.has(image));
    if (revealed.has(image)) { item.canvas.style.display = "none"; restoreAfterScan(image); return; }
    paint(image, item);
    restoreAfterScan(image);
  }
  async function scan(image) {
    const src = image.currentSrc || image.src;
    if (!filterAllowed() || mode === "off" || !src || pending.has(image) || !image.complete || image.naturalWidth < 80) return;
    const previous = canvases.get(image);
    if (previous && previous.src !== src) { previous.canvas.remove(); canvases.delete(image); clearRevealControl(image); }
    const cached = results.get(image);
    if (cached?.src === src) { await apply(image, cached); return; }
    pending.add(image);
    blurWhileScanning(image);
    try {
      const response = await browser.runtime.sendMessage({ type: "detectFaces", url: src });
      if (!response?.ok || !image.isConnected || (image.currentSrc || image.src) !== src) return;
      const result = { src, data: response.data, detections: response.faces || [] };
      results.set(image, result); await apply(image, result);
    } catch { restoreAfterScan(image); /* Sites without an image permission are left unchanged. */ }
    finally { pending.delete(image); if (image.isConnected && (image.currentSrc || image.src) !== src && mode !== "off") scan(image).catch(() => {}); }
  }
  function scanPage() { document.querySelectorAll("#cards img.cover").forEach(image => scan(image).catch(() => {})); }
  function clearFaceEffects() {
    for (const [image, item] of canvases) { item.canvas.remove(); clearRevealControl(image); restoreAfterScan(image); }
    canvases.clear();
    document.querySelectorAll("#cards img.cover").forEach(image => { clearRevealControl(image); restoreAfterScan(image); });
    document.querySelectorAll("[data-face-filter-hidden]").forEach(card => card.removeAttribute("data-face-filter-hidden"));
  }
  function setWallId(next) {
    if (!next || next === wallId) return;
    wallId = next; refreshWallPolicy();
  }
  async function refreshWallPolicy() {
    try { const current = await browser.runtime.sendMessage({ type: "state" }); wallSettings = current?.wallSettings || {}; }
    catch { wallSettings = {}; }
    if (mode === "off" || !filterAllowed()) clearFaceEffects();
    else scanPage();
    document.body.dataset.faceFilterEnabled=String(mode!=="off"&&filterAllowed());
    document.body.classList.remove("face-filter-initializing");
  }
  new MutationObserver(() => setWallId(document.body.dataset.wallId || "")).observe(document.body, { attributes: true, attributeFilter: ["data-wall-id"] });
  browser.storage.local.get({ settings: {} }).then(async ({ settings }) => {
    mode = settings?.faceFilterMode || "off"; threshold = Number(settings?.faceDetectionThreshold) || 75;
    const current = await browser.runtime.sendMessage({ type: "state" });
    wallSettings = current?.wallSettings || {};
    if (!wallId) wallId = current?.activeWallId || "";
    if (filterAllowed() && mode !== "off") scanPage();
    document.body.dataset.faceFilterEnabled=String(mode!=="off"&&filterAllowed());
    document.body.classList.remove("face-filter-initializing");
  }).catch(() => document.body.classList.remove("face-filter-initializing"));
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.settings) return;
    const settings = changes.settings.newValue || {};
    mode = settings.faceFilterMode || "off"; threshold = Number(settings.faceDetectionThreshold) || 75;
    if (mode === "off" || !filterAllowed()) clearFaceEffects();
    document.body.classList.remove("face-filter-initializing");
    document.querySelectorAll("[data-face-filter-hidden]").forEach(card => card.removeAttribute("data-face-filter-hidden"));
    if (mode !== "off" && filterAllowed()) for (const image of document.querySelectorAll("#cards img.cover")) { const cached = results.get(image); if (cached && cached.src === (image.currentSrc || image.src)) apply(image, cached).catch(() => {}); else scan(image).catch(() => {}); }
    document.body.dataset.faceFilterEnabled=String(mode!=="off"&&filterAllowed());
    schedule();
  });
  browser.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes.wallSettings) refreshWallPolicy(); });
  new MutationObserver(scanPage).observe(document.querySelector("#cards") || document.documentElement, { childList: true, subtree: true });
  document.addEventListener("scroll", schedule, { passive: true, capture: true });
  addEventListener("resize", schedule, { passive: true });
  addEventListener("scroll", schedule, { passive: true });
  document.addEventListener("load", event => { if (faceFilterImage(event.target)) scan(event.target).catch(() => {}); }, true);
  document.addEventListener("error", event => { if (faceFilterImage(event.target)) event.target.closest(".card")?.removeAttribute("data-face-filter-hidden"); }, true);
})();
