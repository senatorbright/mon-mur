"use strict";

function describeHlsFatalError(data = {}) {
  const type = String(data.type || "");
  const detail = String(data.details || "");
  const detailCode = detail.toUpperCase();
  const status = Number(data.response?.code) || 0;
  let message;

  if (/keySystem/i.test(type) || /^keySystem/i.test(detail)) {
    message = "La source demande un système de lecture protégée que Mon Mur ne prend pas en charge.";
  } else if (/INCOMPATIBLE.*CODECS|CODECS.*INCOMPATIBLE/.test(detailCode)) {
    message = "Le flux utilise des codecs incompatibles avec le lecteur de ce navigateur.";
  } else if (/(MANIFEST|LEVEL|FRAG)PARSINGERROR|FRAGDECRYPTERROR/.test(detailCode)) {
    message = "Le manifeste ou un segment a été reçu, mais son format ou son contenu n’a pas pu être interprété.";
  } else if (type === "networkError") {
    message = status
      ? `Le serveur a refusé ou interrompu le chargement du flux (HTTP ${status}).`
      : "Le manifeste, une playlist ou un segment n’a pas pu être récupéré (réseau, CORS ou autorisation).";
  } else if (type === "mediaError" || type === "muxError") {
    message = "Les données reçues n’ont pas pu être préparées ou décodées par le lecteur.";
  } else {
    message = "Hls.js a rencontré une erreur fatale pendant l’initialisation ou la lecture.";
  }

  const diagnostic = [type, detail].filter(Boolean).join(" / ");
  return diagnostic ? `${message} [${diagnostic}${status && !message.includes(`HTTP ${status}`) ? ` · HTTP ${status}` : ""}]` : message;
}

if (typeof module !== "undefined" && module.exports) module.exports = { describeHlsFatalError };
