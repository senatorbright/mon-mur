# Validation technique avant AMO

Date : 29 octobre 2026. Aucune soumission, signature ou publication n'a été effectuée.

## État de préparation 4.2.0 — 2 novembre 2026

Les changements de cette préparation corrigent les déclarations de consentement, clarifient les requêtes réseau et restaurent les fichiers officiels de MediaPipe 0.10.21. La version reste `4.2.0`; aucune soumission, signature ou publication n'a été effectuée.

Audit du code : les murs, préférences et contenus sont persistés dans `storage.local` et IndexedDB. Mon Mur envoie directement aux services choisis les sujets de recherche des murs automatiques; un titre d'article peut aussi être envoyé à AlloCiné ou Wikipédia depuis un mur Cinéma. Les sites sources reçoivent les URL demandées lors des collectes. L'extension n'accède pas à l'historique Firefox, ne remplace pas son moteur de recherche et n'intercepte pas ses requêtes. Aucun serveur Mon Mur, télémétrie ou rapport d'erreurs distant n'a été trouvé. Les catégories `searchTerms` et `websiteContent` sont maintenant déclarées comme optionnelles et vérifiées avant les transmissions correspondantes. La classification des URL de sources choisies au regard de `browsingActivity` reste explicitement décrite comme non tranchée.

La réserve AMO 6.1 demeure : les recherches thématiques de Mon Mur ciblent des fournisseurs tiers. Le dossier expose leur finalité, leurs données et leurs contrôles, sans revendiquer une conformité automatique ni solliciter une interprétation préalable de Mozilla. Cette réserve ne peut pas être levée par le seul consentement Firefox.

Validation locale : `node --test tests/*.test.js` — 144 réussis; `node --check` sur les fichiers JS/MJS et validation JSON du manifeste — réussis. MediaPipe Tasks Vision 0.10.21, ses chargeurs WASM JavaScript et ses binaires ont été comparés fichier par fichier au package npm officiel; les SHA-256 concordent. Sous Firefox 158.0.1 headless, dans un profil temporaire, le détecteur a chargé le runtime/WASM officiel et détecté un visage dans une image de test servie par un serveur local (score 0,928). Le paquet de test ne conservait que le même CSP et le code de détection, avec un hôte localhost et un script de pont temporaires pour le test. La lecture des dimensions du bitmap a ensuite été corrigée pour les capturer avant fermeture; cette petite correction n'a pas fait l'objet d'un second essai Firefox.

Le parcours de consentement a été vérifié dans le code et les tests automatisés : sans `searchTerms`, les collectes thématiques sont arrêtées; l'enrichissement par titre exige `searchTerms` et `websiteContent`. Les dialogues Firefox et le parcours complet des préférences n'ont pas été contrôlés visuellement dans Firefox, car WebDriver ne permettait pas d'interagir avec la page privilégiée de l'extension dans cet environnement. Les préférences existantes contiennent toutefois l'explication mise à jour et les contrôles; les tests d'onboarding réussissent.

`web-ext@10.7.0 lint` sur le ZIP final : 0 erreur, 0 notice et 9 avertissements (8 `UNSAFE_VAR_ASSIGNMENT` sur le rendu local et Readability; 1 `DANGEROUS_EVAL` dans dash.js). Les deux archives ont été reconstruites : `mon-mur-4.2.0.zip` pour l'extension et `mon-mur-4.2.0-source.zip` pour les sources/reviewers. `unzip -t` confirme l'intégrité des deux fichiers. Le lint du paquet ne montre pas d'avertissement MediaPipe après restauration de la version officielle. Le profil de test était temporaire; aucun profil Firefox personnel ni aucune donnée utilisateur n'a été modifié.

## Historique des validations antérieures

Ce rapport décrit la validation Firefox du paquet 3.15.0. Le manifeste est maintenant passé à 3.16.0 pour figer le travail; ce nouveau numéro n'a pas été reconstruit, installé ou retesté.

Contrôles finaux : `node --test tests/*.test.js` — 46 réussis; `node --check` sur tous les fichiers `.js`/`.mjs` de `js/` — réussi; `git diff --check` — réussi; `./scripts/build-amo.sh` — ZIP 3.15.0 reconstruit; `unzip -t` — réussi; `web-ext lint` — 0 erreur / 0 avis / 12 avertissements source et 8 avertissements dans le ZIP.

Corrections techniques appliquées pendant cette validation : les demandes d'accès aux sources utilisent maintenant `URL.host`, port non standard inclus, dans la page Sources et le panneau de la barre d'outils, y compris le bouton de nouvelle tentative après redirection. Les tests couvrent ces deux parcours. Version et ID Gecko inchangés.

## Inventaire réseau et déclaration de données

L'inspection de tous les appels `fetch` hors dépendances tierces n'a trouvé aucun endpoint Mon Mur, télémétrie ni journal d'erreurs distant. Les fonctions réseau se répartissent ainsi :

| Données de la requête | Destinataire et déclenchement | Contrôle |
| --- | --- | --- |
| URL de page/flux choisie, URL d'article, favicon, image ou ressource de lecteur | Domaine de la source; ajout, collecte RSS/HTML, ouverture d'article ou affichage d'une image/vidéo | Accès au site, cookies/identifiants omis pour les téléchargements génériques; résultats gardés dans Firefox |
| Sujet prioritaire (`q`, `search_query`, `search`, etc.) | YouTube, PeerTube, CrowdBunker, Rumble, Bluesky et Internet Archive; murs automatiques activés. Aucun envoi au développeur de Mon Mur ou à un serveur Mon Mur détecté | Consentement natif `searchTerms`; retrait annule les requêtes actives |
| Titre nettoyé d'un article | Recherche de métadonnées AlloCiné/Wikipédia; lecture/enrichissement cinéma. Aucun envoi au développeur de Mon Mur ou à un serveur Mon Mur détecté | Consentement natif `searchTerms` |
| Identifiant AT URI d'une publication déjà importée | API publique Bluesky, pour compléter ses métadonnées | Requête sans cookies; identifiant public, sans terme prioritaire |
| Adresse d'une vidéo publique | API oEmbed Rumble ou API PeerTube / page YouTube pour les détails | Déclenché par l'usage de la fonction vidéo; pas de compte ou de cookie transmis par le code |

Les URL des sources sont saisies ou sélectionnées par l'utilisateur; elles ne sont pas lues dans l'historique de navigation et aucun historique de navigation n'est envoyé. Les réponses RSS/HTML et les articles sont stockés dans `storage.local`/IndexedDB. Le filtre BlazeFace télécharge les images autorisées et réalise l'inférence localement.

Le manifeste conserve `required: ["none"]`, `optional: ["searchTerms"]`. C'est l'interprétation technique actuelle des catégories, pas une décision de Mozilla sur la qualification des URL configurées ou des réponses de pages. La règle 6.1 officielle interdit la transmission de termes par une fonctionnalité de recherche fournie/chargée par l'extension; la FAQ précise que les transmissions de termes sans rapport avec la fonction principale sont interdites. Le fait que Mon Mur crée ses propres recherches de sujets dans sa fonction d'agrégateur demeure une question de revue, sans garantie d'acceptation. [Règles AMO](https://extensionworkshop.com/documentation/publish/add-on-policies/) · [FAQ AMO](https://extensionworkshop.com/documentation/publish/add-on-policies-faq/) · [Taxonomie et consentement Firefox](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).

## Scénarios validés dans Firefox

Tests faits dans Firefox 158.0.1 headless avec un profil temporaire isolé; aucun profil personnel n'a été ouvert ou modifié.

| Scénario | Résultat |
| --- | --- |
| Installation vierge et onboarding | Installation 3.15.0 temporaire acceptée sous l'ID permanent; onboarding terminé sans accès global et préférences initiales enregistrées. |
| Permissions globales et par domaine | Accès global demandé puis accordé via le dialogue natif; une source RSS BBC a demandé les accès à `feeds.bbci.co.uk` puis `www.bbc.co.uk`. |
| Port non standard | Le dialogue natif affiche `127.0.0.1:8765` après correction de la portée. Le navigateur Snap de test ne parvenait pas à joindre le serveur loopback; cette collecte particulière reste non validée. |
| RSS public | Flux BBC accepté; source ajoutée, méthode `rss`, état `ok`, 26 articles reçus et consultables dans l'extension. |
| Consentement natif | Acceptation `searchTerms`, refus, retrait via API Firefox et mise à jour de l'état dans les préférences observés. Après retrait, l'actualisation a renvoyé `search-consent-missing` pour YouTube, Bluesky et Internet Archive. |
| Murs de recherche avec consentement | YouTube et PeerTube ont répondu HTTP 200 (13 résultats YouTube analysés; 8 résultats PeerTube reçus). Bluesky a répondu HTTP 200. Internet Archive a répondu HTTP 200 lors d'un essai distinct. Le terme test `Codex consent probe` n'a produit aucun article conservé. |
| Retrait pendant une collecte | Pendant une requête Internet Archive réelle, retrait a produit `AbortError`, aucune réponse n'a été traitée (`requests: []`). Le rafraîchissement suivant a indiqué `search-consent-missing`; aucun autre sujet n'a été demandé. |
| Mise à jour / redémarrage | Deux installations temporaires successives, même ID Gecko, version de test 3.15.0 → 3.15.1 (seul numéro de manifeste modifié). Après remplacement et rechargement, 1 source, 26 articles IndexedDB, 1 favori, onboarding, mur par défaut `wall-info-locale`, intervalle 30 min et priorité sont conservés. L'installation de test 3.15.1 n'est pas le paquet à publier. |

Le test de consentement accepté/refusé a d'abord été réalisé sur 3.15.0; le parcours de retrait en cours de collecte a été répété sur l'installation de mise à jour 3.15.1, dont le code fonctionnel était identique. Les permissions `searchTerms` restent retirées dans le profil de test après son rechargement.

## Limites des essais navigateur

Le profil Firefox a démontré des requêtes consenties et des réponses HTTP 200 pour YouTube, PeerTube, Bluesky et Internet Archive. CrowdBunker et Rumble étaient désactivés; leur collecte distante n'a pas été essayée. Les résultats des services dépendent de leurs réponses et de la disponibilité réseau.

Le flux BBC valide l'extraction RSS; l'accès au serveur loopback local est bloqué par l'environnement Snap du navigateur et n'a pas permis de valider ce flux local. La mise à jour test 3.15.1 vérifie réellement le remplacement à ID identique et la conservation des données; elle ne remplace pas un test de mise à jour via AMO, qui n'a pas été effectué.

## Avertissements `web-ext`

Le décompte de 12 provient du lint de l'arbre source. Quatre avertissements disparaissent du lint du ZIP parce que leurs fichiers ne sont pas distribués : extensions `.sh` des scripts de construction (2) et scripts inline présents dans des fixtures HTML de test (2). Le ZIP distribué garde les huit avertissements suivants :

| Fichier et lignes | Avertissement | Analyse |
| --- | --- | --- |
| `js/document.js:112` | Affectation à `innerHTML` | Le rendu Markdown échappe le texte d'entrée dans `renderInline`; les balises générées sont fixes et les liens n'acceptent que `http(s)`. Le document est embarqué et chargé depuis l'extension. |
| `js/core.js:29` | Affectation à `innerHTML` | Un élément `textarea` détaché sert uniquement à décoder les entités. Son contenu n'est jamais inséré dans le DOM de la page. |
| `js/wall.js:190`, `:237`, `:328` | Trois affectations à `innerHTML` | La première reçoit des icônes SVG constantes définies dans le code. Les deux autres reçoivent une sortie construite par `sanitizeArticleHtml`, qui reconstruit une liste limitée de balises et d'attributs sûrs. |
| `vendor/Readability.js:1549`, `:1928` | Affectations à `innerHTML` | Code upstream Readability inclus pour extraire localement le contenu d'article; avertissements du code tiers embarqué. |
| `vendor/vision_bundle.mjs:1` | Import dynamique | Le module MediaPipe importe le runtime WASM à partir d'un chemin fourni par l'appelant. Mon Mur passe exclusivement `browser.runtime.getURL("vendor/wasm")`, un chemin local de l'extension. |

Aucune correction n'a été appliquée pour ces huit avertissements : l'examen des sites d'affectation n'a pas révélé de valeur non fiable contournant l'échappement, la reconstruction ou les chemins locaux prévus. Ils restent visibles dans le rapport lint et doivent être réévalués si ces appels changent.

## État de préparation

Le code et le paquet 3.15.0 sont **techniquement prêts pour une soumission AMO** : les parcours principaux, le consentement/retrait, l'annulation d'une requête active, le remplacement à ID identique, les 46 tests et le paquet final ont été vérifiés. CrowdBunker et Rumble, désactivés dans le profil de test, et l'accès à une source loopback n'ont pas été validés en réseau.

La qualification AMO des URL configurées et l'interprétation de la règle 6.1 sur les recherches thématiques restent des risques de revue; le consentement ne vaut pas décision de politique. Licence, politique publique/contact et fiche doivent être finalisés par l'éditeur avant le dépôt. Aucun de ces points éditoriaux n'a nécessité de changer l'ID ou la version 3.15.0.
