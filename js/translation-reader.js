"use strict";
const readerParams = new URLSearchParams(location.search), readerToken = readerParams.get("item"), readerKey = `translationReader:${readerToken}`;
document.querySelector("#returnToWall").addEventListener("click", () => {
  if (history.length > 1) history.back();
  else location.href = browser.runtime.getURL("wall.html");
});
(async () => {
  const title = document.querySelector("#readerTitle"), text = document.querySelector("#readerText"), status = document.querySelector("#readerStatus");
  if (!readerToken) { status.textContent = "Aucun article à afficher."; title.textContent = "Article indisponible"; return; }
  try {
    const stored = await browser.storage.local.get(readerKey), article = stored[readerKey];
    await browser.storage.local.remove(readerKey);
    if (!article || typeof article.text !== "string") throw new Error("L’article a expiré ou n’est plus disponible.");
    title.textContent = String(article.title || "Article");
    text.textContent = article.text;
    document.title = `${title.textContent} · Mon Mur`;
    status.textContent = readerParams.get("lang") ? "Langue de l’article détectée. Si Firefox ne propose pas l’icône, ouvrez le menu ≡ puis « Traduire la page »." : "Langue non détectée automatiquement. Essayez « Traduire la page » dans le menu ≡ de Firefox.";
  } catch (error) { title.textContent = "Article indisponible"; status.textContent = error.message; }
})();
