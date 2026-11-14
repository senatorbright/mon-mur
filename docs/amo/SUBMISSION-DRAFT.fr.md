# Dossier de soumission AMO — brouillon

Ne pas copier dans AMO avant validation éditoriale, des données et des coordonnées de support. Cible : Firefox pour ordinateur et Firefox Android. Version de travail : `5.0.0`; identifiant conservé : `mon-mur-presse-toolbar@local`. Le paquet 5.0.0 reste à soumettre et à signer séparément avant toute distribution durable. Pour tester sur Android avant signature, utiliser le chargement temporaire documenté dans `docs/TESTER-ANDROID.fr.md`.

## Fiche proposée

- **Nom :** Mon Mur
- **Description courte :** Rassemblez vos flux RSS/Atom, articles et découvertes de plateformes dans des murs de lecture personnalisés.
- **Description détaillée :** Créez des murs thématiques, suivez des sites et flux RSS/Atom, filtrez et priorisez les articles, puis marquez-les comme lus, favoris ou à consulter plus tard. Les murs automatiques peuvent rechercher des vidéos sur YouTube, PeerTube, CrowdBunker et Rumble, des publications publiques sur Bluesky et LinkedIn, ainsi que des documents français sur Internet Archive. Les articles, réglages et historiques sont conservés localement dans Firefox. Les collectes automatiques et certaines lectures nécessitent des accès aux sites et transmettent les recherches aux plateformes sélectionnées.
- **Catégorie suggérée :** Actualités et blogs (vérifier le libellé AMO lors du dépôt).
- **Licence du projet :** décision de l'éditeur requise. Ne pas sélectionner automatiquement MIT, GPL ou propriétaire.
- **Politique de confidentialité :** publier le brouillon validé à une URL stable, puis renseigner cette URL dans AMO. Aucun site ou contact de support n'est actuellement déclaré dans le projet.

## Permissions du manifeste à expliquer

| Permission | Fonction observée |
| --- | --- |
| `storage` | Réglages et données de l'extension dans le profil Firefox. |
| `alarms` | Collectes périodiques des sources actives. |
| `activeTab`, `scripting` | Lire la page ouverte à la demande de l'utilisateur pour détecter une source ou suivre la page. |
| `tabHide` | Masquer temporairement un onglet pendant une recherche Rumble réalisée dans un onglet Firefox. |
| `webRequest`, `webRequestBlocking` | Ajouter le référent d'extension pour les lecteurs YouTube intégrés depuis le mur. |
| Accès YouTube, PeerTube, Bluesky, Google Actualités et LinkedIn | Requêtes des collecteurs activés et chargement des lecteurs, images et métadonnées associés. |
| Accès optionnels CrowdBunker et Rumble | Collecteurs vidéo optionnels. |
| `<all_urls>` optionnel | Sources personnalisées, lecture d'articles et détection d'images sur des domaines choisis; ne doit plus bloquer l'onboarding. Les accès par domaine restent possibles pour les sources. |

## Fonctionnement des recherches et des communications réseau

Mon Mur sert à créer un espace personnel de consultation : l'utilisateur organise ses murs, choisit les sites ou flux qu'il souhaite suivre et peut activer des murs qui recherchent des contenus publics par sujet. Un mur créé manuellement organise les sources qui lui sont associées; sa création ne lance pas à elle seule une recherche sur le Web. La recherche automatique est une fonction centrale des murs automatiques Vidéos, Réseaux sociaux et PDF.

Les sujets sont les mots ou expressions prioritaires saisis dans les préférences. Lorsqu'un mur automatique et un fournisseur sont activés, Mon Mur les utilise à la prochaine actualisation manuelle ou périodique. Il envoie les requêtes directement aux services concernés : YouTube reçoit le terme dans `search_query`; l'index PeerTube le reçoit dans `search`; CrowdBunker dans `q`; Bluesky dans `q`; Rumble dans sa page de résultats; Internet Archive reçoit une requête de métadonnées construite à partir du sujet. Les paramètres complémentaires servent au tri, à la date, à la langue ou à la pagination. Rumble et CrowdBunker nécessitent en plus leurs accès de site facultatifs. Les résultats sont analysés et filtrés dans l'extension, puis conservés localement dans Firefox.

Par exemple, si l'utilisateur ajoute « intelligence artificielle » à ses sujets prioritaires et active YouTube et PeerTube, leurs services reçoivent ce terme lors d'une collecte. Ils reçoivent aussi l'adresse IP et les informations techniques habituelles d'une connexion. Ils peuvent traiter ou conserver la requête selon leurs propres règles. L'utilisateur peut désactiver un mur ou un fournisseur; si Firefox refuse ou si l'utilisateur retire le consentement `searchTerms`, aucune requête thématique n'est lancée. La collecte des flux choisis et les fonctions locales restent disponibles.

Les sources RSS/Atom ou pages web sont demandées à l'URL choisie par l'utilisateur, à l'ajout ou lors des actualisations demandées ou programmées. Firefox transmet cette URL au site concerné dans la requête réseau; les téléchargements génériques omettent cookies et identifiants de session (`credentials: omit`). Mon Mur analyse la réponse et conserve les articles et leurs contenus dans `storage.local` ou IndexedDB du profil Firefox. Quand l'utilisateur ajoute une source depuis un onglet ouvert, l'extension peut lire la page courante à cette demande afin d'en détecter le titre, l'adresse et les flux proposés.

Sur un mur de type Cinéma, l'ouverture d'un article peut envoyer son titre nettoyé à AlloCiné pour rechercher sa fiche; Wikipédia est consulté en solution de repli lorsque la recherche ne permet pas de compléter l'information. Il s'agit d'une recherche déclenchée par l'affichage de l'enrichissement cinéma, distincte des recherches automatiques par sujets. Le consentement `searchTerms` couvre le titre transmis comme requête; `websiteContent` couvre le fait que ce titre provient d'une page ou d'un flux. Le manifeste déclare les deux catégories comme optionnelles, et le contrôle dans les préférences demande les deux avant cette recherche. Si l'accord manque, l'enrichissement distant est ignoré.

Ces requêtes sont propres aux murs de Mon Mur : l'extension ne lit pas les recherches saisies dans Firefox, ne les intercepte pas, ne remplace pas le moteur du navigateur et n'envoie pas les termes à un serveur Mon Mur. Il n'y a ni compte Mon Mur, ni télémétrie, ni collecte centralisée relevée dans le code. Les préférences, sources, contenus reçus, favoris et historiques restent dans le profil Firefox. Les images et lecteurs intégrés contactent leur plateforme d'origine lorsqu'ils sont affichés ou utilisés.

## Informations à fournir aux reviewers

1. Les recherches automatiques transmettent les sujets prioritaires aux services activés; elles peuvent être désactivées dans les préférences.
2. Firefox demande le consentement optionnel `searchTerms` avant les recherches par sujet. Le consentement optionnel `websiteContent` est aussi requis avec `searchTerms` avant l'envoi d'un titre de page ou d'article à AlloCiné ou Wikipédia. Le refus ou retrait bloque la requête concernée; les flux RSS et les fonctions locales restent disponibles. Consentement intégré pris en charge à partir de Firefox 140 (ordinateur) et 142 (Android).
3. Les articles, sources, favoris, archives et réglages sont conservés dans `storage.local` et IndexedDB du profil Firefox; aucun serveur Mon Mur ni télémétrie n'a été trouvé dans le code audité.
4. Les requêtes génériques de récupération de pages et de flux n'envoient pas de cookies ni d'identifiants de session. Lors de l'ajout d'une source depuis une page ouverte, Mon Mur peut lire son DOM afin de détecter les flux proposés.
5. Des requêtes secondaires peuvent envoyer à Bluesky un AT URI public déjà importé, à Rumble une URL vidéo publique pour oEmbed, ou à une instance PeerTube l'identifiant de la vidéo pour en charger les détails.
6. Le filtre de visages utilise MediaPipe et BlazeFace embarqués localement; images et résultats d'analyse ne partent pas vers un service d'inférence.
7. `tests/` et `docs/` ne font pas partie de l'extension distribuée. MediaPipe Tasks Vision 0.10.21 et ses chargeurs JavaScript/WASM sont fournis sans modification, avec son avis et sa licence Apache.
8. Aucun identifiant Gecko, service d'actualisation personnalisé ou contenu exécuté depuis un serveur distant n'est ajouté.
9. Les consentements Firefox documentent l'autorisation de transmission, mais ne préjugent pas de l'interprétation AMO de la règle 6.1 pour les recherches thématiques vers des plateformes tierces. La fonction et les requêtes sont décrites explicitement pour permettre l'évaluation par les reviewers; aucune conclusion automatique de conformité n'est revendiquée.

## Notes reviewers — bibliothèques tierces

Les liens vers la copie distribuée et les sources lisibles doivent accompagner chaque version soumise, conformément aux consignes AMO sur les bibliothèques tierces :

| Fichier distribué | Copie publiée / source lisible |
| --- | --- |
| `vendor/hls.min.js` — hls.js 1.7.2 | package officiel [hls.js 1.7.2](https://www.npmjs.com/package/hls.js/v/1.7.2) · [sources lisibles du tag v1.7.2](https://github.com/video-dev/hls.js/tree/v1.7.2/src) |
| `vendor/dash.all.min.js` — dash.js 5.2.1 | [fichier distribué modern UMD v5.2.1](https://github.com/Dash-Industry-Forum/dash.js/blob/v5.2.1/dist/modern/umd/dash.all.min.js) · [sources lisibles v5.2.1](https://github.com/Dash-Industry-Forum/dash.js/tree/v5.2.1/src) · [package officiel](https://www.npmjs.com/package/dashjs/v/5.2.1) |
| `vendor/Readability.js` — Mozilla Readability 0.6.0 | [fichier officiel du tag 0.6.0](https://github.com/mozilla/readability/blob/0.6.0/Readability.js) · [package npm officiel](https://www.npmjs.com/package/@mozilla/readability/v/0.6.0) |
| `vendor/vision_bundle.mjs` et `vendor/wasm/vision_wasm_*.js` — MediaPipe Tasks Vision 0.10.21 | [package officiel 0.10.21](https://www.npmjs.com/package/@mediapipe/tasks-vision/v/0.10.21) · [sources amont](https://github.com/google-ai-edge/mediapipe) · [carte de sources officielle](../third-party-sources/mediapipe-tasks-vision-0.10.21/vision_bundle.mjs.map) |

Les empreintes SHA-256 comparées aux artefacts officiels sont identiques pour HLS 1.7.2 (`afcde07437ec84b072fe8782e772ceb5046eac751b2719f73ae0d83d763bc3f5`), DASH 5.2.1 modern UMD (`3a22b1f4576ab294f41e56f156cec7972a5f83edda379416778293ff22d2eb49`), Readability 0.6.0 (`34dcab3d0832d0019f02990eed6b6124e029e8c32b9f0c6f2550544ff8dff174`) et les cinq fichiers MediaPipe Tasks Vision 0.10.21 indiqués ci-dessous. Les fichiers MediaPipe distribués sont inchangés par rapport au package officiel.

Les sommes de contrôle ont été calculées contre les fichiers des packages officiels hls.js 1.7.2, dashjs 5.2.1, @mozilla/readability 0.6.0 et @mediapipe/tasks-vision 0.10.21. Le bundle MediaPipe, les deux chargeurs JavaScript WASM et les deux binaires WASM sont identiques aux fichiers du package npm officiel 0.10.21. Empreintes SHA-256 : `vision_bundle.mjs` `40f4123dfcd75cfa58add046919cc6f52fde66f009ff582997c09ba54c6ba27c`; `vision_wasm_internal.js` `4a97e2520ba506c680ecd6ba6acfb146888afa0e2746d57f205352bc6ebb82eb`; `vision_wasm_nosimd_internal.js` `927def7b465c51b86e4b3060f93646aca4e27121f4b8fc0483786e407ea9cf1f`; WASM SIMD `f00ec4731faa23b3e714d00e88d4d10e2df5c0a427d3a2b4ae6e3526fdd14ef7`; WASM sans SIMD `3821ea9b1f7fb8c549ef2a064ef5c85750bf375c545a49fd6eea0df44a95f1f4`.

## Captures d'écran

Préparer des captures sans données personnelles : (1) mur général avec plusieurs cartes; (2) article déplié; (3) préférences des collectes automatiques; (4) réglages des accès par site. Utiliser un profil de démonstration avec des sources publiques et des sujets neutres.

## Décisions et renseignements de l'éditeur manquants

- Vérifier que l'analyse des URL de sources choisies et du stockage local correspond à l'interprétation AMO de la taxonomie; voir la limite explicitée dans `PRIVACY-POLICY-DRAFT.fr.md`.
- Valider la proposition de licence source disponible dans `LICENSE-PROPOSAL.fr.md`, vérifier son affichage possible dans AMO et confirmer les droits des icônes YouTube, PeerTube et CrowdBunker.
- Indiquer une adresse de contact/support et publier la politique de confidentialité à une URL stable.
- Confirmer la taxonomie de catégorie AMO et les captures à publier.
