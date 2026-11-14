# Inventaire des licences et ressources — préparation AMO

Les licences tierces attestées sont liées dans `THIRD_PARTY_NOTICES.md`. Les entrées notées « à confirmer » nécessitent une preuve d'origine, une autorisation de redistribution ou le remplacement de la ressource avant la soumission. Le dépôt GitHub public publie le code Mon Mur sous GNU GPL version 3 (`LICENSE`); cette licence ne couvre pas les éléments tiers dont les droits restent distincts.

| Ressource | Emplacement | Éléments établis | À régler |
| --- | --- | --- | --- |
| Code Mon Mur | `js/`, `*.html`, `css/` | GNU GPL version 3; copie du texte dans `LICENSE` à la racine du dépôt. | Vérifier les droits sur chaque ressource incluse avant redistribution; la proposition de licence personnalisée dans `LICENSE-PROPOSAL.fr.md` est un brouillon historique et ne s'applique pas à ce dépôt. |
| hls.js 1.7.2 | `vendor/hls.min.js` | Bundle amont Apache-2.0; avis complet, y compris les notices du code dérivé, fourni dans `vendor/HLS-LICENSE.txt`. | La source amont peut être archivée dans `docs/amo/third-party-sources/` si le reviewer AMO la demande. |
| dash.js 5.2.1 | `vendor/dash.all.min.js` | Bundle amont BSD 3-Clause; licence complète fournie dans `vendor/DASH-LICENSE.txt`. Chargé uniquement lors de la lecture explicite d'un flux DASH dans un article. | La source amont peut être archivée dans `docs/amo/third-party-sources/` si le reviewer AMO la demande. |
| Mozilla Readability | `vendor/Readability.js` | Apache-2.0; texte de licence déjà fourni dans `vendor/READABILITY-LICENSE.md`. | Aucun blocage de fichier identifié dans cet inventaire. |
| MediaPipe Tasks Vision 0.10.21 | `vendor/vision_bundle.mjs`, `vendor/wasm/` | Paquet npm Apache-2.0; licence complète ajoutée dans `vendor/MEDIAPIPE-APACHE-LICENSE-2.0.txt`. Carte de sources amont conservée hors paquet dans `docs/amo/third-party-sources/`. | L'archive source AMO peut être fournie si le reviewer demande les sources du bundle amont. |
| Modèle BlazeFace | `models/blaze_face_short_range.tflite` | La fiche modèle identifie Apache-2.0; la copie de licence ci-dessus est incluse. | Conserver la référence à la fiche modèle dans les avis. |
| Icône Mon Mur | `icons/mon-mur.png`, `icons/mon-mur-{32,48,96,128}.png` | Versions redimensionnées directement depuis le PNG source; aucune altération graphique autre que la taille. | L'auteur et les droits de redistribution du PNG d'origine ne sont pas consignés. Confirmer que l'éditeur les détient. |
| Icône YouTube | `icons/youtube.svg` | SVG simplifié utilisé dans les préférences et cartes vidéo. | Auteur/source et permission de redistribution non documentés dans le dépôt. |
| Icône PeerTube | `icons/peertube.svg` | SVG simplifié utilisé dans les préférences et cartes vidéo. | Auteur/source et permission de redistribution non documentés dans le dépôt. |
| Icône LinkedIn | `icons/linkedin.svg` | SVG utilisé par l'interface des publications LinkedIn. | Auteur/source et permission de redistribution non documentés dans le dépôt. |
| Icône CrowdBunker | `icons/crowdbunker.png` | Le fichier est identifié comme favicon public de `crowdbunker.com`. | Une favicon accessible publiquement n'établit pas à elle seule un droit de redistribution; confirmer une autorisation ou remplacer l'image. |
| Icône Rumble | `icons/rumble.svg` | Source Simple Icons; avis existant indique CC0 1.0. | Aucun blocage de fichier identifié dans cet inventaire. |
| Icône Bluesky | `icons/bluesky.svg` | Avis existant identifie l'icône officielle Bluesky et renvoie aux directives de marque. | Confirmer que la variante et l'usage dans la fiche AMO respectent les directives de marque. |
| Polices | `css/` | Les feuilles de style utilisent des polices système; aucun fichier de police embarqué repéré. | Aucun fichier tiers à redistribuer identifié. |

Les marques et noms de plateformes ne signifient pas une approbation de Mon Mur. Une licence de code choisie pour Mon Mur ne remplace pas les droits des images de marques tierces.
