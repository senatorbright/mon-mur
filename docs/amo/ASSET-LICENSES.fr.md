# Inventaire des licences et ressources — préparation AMO

Les licences tierces attestées sont liées dans `THIRD_PARTY_NOTICES.md`. Les entrées notées « à confirmer » nécessitent une preuve d'origine, une autorisation de redistribution ou le remplacement de la ressource avant la soumission. Ce document n'attribue pas de licence au code Mon Mur.

| Ressource | Emplacement | Éléments établis | À régler |
| --- | --- | --- | --- |
| Code Mon Mur | `js/`, `*.html`, `css/` | GNU GPL version 3, publiée dans `LICENSE` à la racine du dépôt. | `LICENSE-PROPOSAL.fr.md` est une proposition historique issue du dossier de préparation AMO; elle ne remplace pas la GPL v3 de ce dépôt. |
| hls.js 1.7.2 | `vendor/hls.min.js` | Bundle amont Apache-2.0; avis complet, y compris les notices du code dérivé, fourni dans `vendor/HLS-LICENSE.txt`. | La source amont peut être archivée dans `docs/amo/third-party-sources/` si le reviewer AMO la demande. |
| dash.js 5.2.1 | `vendor/dash.all.min.js` | Bundle amont BSD 3-Clause; licence complète fournie dans `vendor/DASH-LICENSE.txt`. Chargé uniquement lors de la lecture explicite d'un flux DASH dans un article. | La source amont peut être archivée dans `docs/amo/third-party-sources/` si le reviewer AMO la demande. |
| Mozilla Readability | `vendor/Readability.js` | Apache-2.0; texte de licence déjà fourni dans `vendor/READABILITY-LICENSE.md`. | Aucun blocage de fichier identifié dans cet inventaire. |
| MediaPipe Tasks Vision 0.10.21 | `vendor/vision_bundle.mjs`, `vendor/wasm/` | Paquet npm Apache-2.0; licence complète ajoutée dans `vendor/MEDIAPIPE-APACHE-LICENSE-2.0.txt`. Carte de sources amont conservée hors paquet dans `docs/amo/third-party-sources/`. | L'archive source AMO peut être fournie si le reviewer demande les sources du bundle amont. |
| Modèle BlazeFace | `models/blaze_face_short_range.tflite` | La fiche modèle identifie Apache-2.0; la copie de licence ci-dessus est incluse. | Conserver la référence à la fiche modèle dans les avis. |
| Icône Mon Mur | `icons/mon-mur.png`, `icons/mon-mur-{32,48,96,128}.png` | Nouveau dessin original de cartes organisées en mur, créé pour Mon Mur en 5.6.0 et distribué sous GNU GPL v3. Les variantes du manifeste sont redimensionnées depuis la même illustration. | L’ancienne icône a été remplacée car sa provenance n’était pas documentée. |
| Pictogrammes génériques des sources | `icons/source-video-play.svg`, `icons/source-network.svg`, `icons/source-camera.svg`, `icons/source-people.svg`, `icons/source-conversation.svg` | Pictogrammes originaux créés pour Mon Mur, sans dérivation des logos des plateformes; distribués sous GNU GPL v3 avec le projet. | Les libellés YouTube, PeerTube, CrowdBunker, LinkedIn et Bluesky restent textuels. |
| Icône Rumble | `icons/rumble.svg` | Ressource Simple Icons signalée sous CC0 1.0; les noms et marques restent ceux de leur propriétaire. | Aucun élément graphique d’origine incertaine n’est conservé pour cette entrée. |
| Polices | `css/` | Les feuilles de style utilisent des polices système; aucun fichier de police embarqué repéré. | Aucun fichier tiers à redistribuer identifié. |

Les marques et noms de plateformes ne signifient pas une approbation de Mon Mur. Une licence de code choisie pour Mon Mur ne remplace pas les droits des images de marques tierces.
