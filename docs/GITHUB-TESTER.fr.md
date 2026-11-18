# Partager et essayer Mon Mur

## Ce que contient ce dépôt

Ce dépôt contient Mon Mur à sa racine : manifeste, pages, scripts, `css/`, `icons/`, `models/`, `vendor/`, avis des composants tiers, documentation, outils de préparation et tests. Les bibliothèques et fichiers WASM locaux sont nécessaires au fonctionnement hors ligne.

Les archives générées dans `web-ext-artifacts/` et les fichiers `.xpi` locaux ne font pas partie des sources à commiter. Ne publiez pas de profil Firefox, sauvegarde personnelle, journaux, données de navigation ou secrets. Les paquets se régénèrent depuis les sources.

## Charger la version de travail dans Firefox

1. Cloner ou télécharger les sources et installer Firefox.
2. Ouvrir `about:debugging#/runtime/this-firefox`.
3. Cliquer sur **Charger un module complémentaire temporaire…**.
4. Sélectionner `manifest.json` à la racine du dépôt.
5. Ouvrir l’extension depuis son bouton ou depuis la page de préférences.

Après une modification, cliquer sur **Recharger** dans `about:debugging` pour charger le code actualisé. Le chargement temporaire disparaît à la fermeture de Firefox. Utiliser un profil de test si l’on souhaite isoler les données; les sources, réglages, favoris et articles collectés sont conservés dans le profil Firefox.

Les autorisations de sites sont accordées par Firefox. Sans accès global, l’extension demande l’accès aux domaines nécessaires au fil des actions. Les recherches facultatives transmises à des services tiers et leur consentement sont décrits dans **Préférences → Données et accès**.

## Installer une release

Les releases et leurs fichiers sont publiés sur [GitHub](https://github.com/senatorbright/mon-mur/releases). Le XPI 5.8.0 est non signé.

### Firefox Nightly sur ordinateur

Dans Firefox Nightly, ouvrez `about:config`, réglez `xpinstall.signatures.required` sur `false`, puis ouvrez `about:addons`. Dans le menu engrenage, choisissez **Installer un module depuis un fichier…**, sélectionnez le XPI téléchargé et confirmez. Cette préférence concerne le navigateur de bureau.

### Firefox Nightly sur Android

Le XPI non signé peut être installé dans Nightly Android après désactivation de la vérification des signatures. Cette option avancée réduit la protection contre les extensions modifiées : utilisez uniquement un XPI provenant de la release officielle.

1. Téléchargez `mon-mur-5.8.0.xpi` sur le téléphone.
2. Dans Nightly, ouvrez `about:config`. Si cette page n’est pas disponible, ouvrez `chrome://geckoview/content/config.xhtml`.
3. Recherchez `xpinstall.signatures.required` et réglez la préférence booléenne sur `false`.
4. Ouvrez **Paramètres → À propos de Firefox Nightly** et touchez cinq fois le logo pour activer le menu de débogage.
5. Revenez dans **Paramètres → Installer une extension depuis un fichier**, sélectionnez le XPI téléchargé et confirmez.

La préférence peut rester désactivée pour que l’extension non signée fonctionne. Pour supprimer Mon Mur, utilisez **Extensions**, puis remettez `xpinstall.signatures.required` à `true`.

## Construire les archives locales

Depuis la racine du dépôt Mon Mur, avec Bash, Node.js, npm et `zip` installés :

```sh
./scripts/build-release.sh
```

Les fichiers sont placés dans `web-ext-artifacts/`. Le ZIP est construit avec `web-ext`; le XPI est le même paquet avec l’extension attendue par Firefox. Ce XPI n’est pas signé par Mozilla et ne s’installe pas comme extension permanente dans un Firefox standard. Pour le développement, charger directement le manifeste avec `about:debugging`.

## Portée et contributions

Mon Mur est un projet personnel réalisé à 100 % par « vibe coding ». Il peut servir de prototype et de cahier des charges fonctionnel à examiner et à améliorer. L’auteur considère son exploration fonctionnelle actuelle comme terminée; les corrections ou améliorations proposées par la communauté pourront être discutées dans les issues ou les pull requests.

Le partage collectif des J’aime avec un mur automatique commun est une idée éventuelle, pas une fonction disponible ni une promesse de réalisation. Le projet n’introduit aujourd’hui ni compte utilisateur ni serveur Mon Mur; toute proposition de partage à distance devrait préciser comment elle respecte ces contraintes.

**Licence du projet : GNU GPL v3**, fournie dans `LICENSE`. Les composants tiers et ressources graphiques conservent leurs licences et conditions propres, récapitulées dans `THIRD_PARTY_NOTICES.md` et `amo/ASSET-LICENSES.fr.md`; les visuels de plateforme sans provenance établie ont été remplacés par des pictogrammes originaux sous GPLv3.

## État de la version 5.8.0

La version 5.8.0 est publiée en préversion. Les 284 tests automatisés passent. `web-ext lint` rapporte 0 erreur, 0 notice et 16 avertissements à examiner. Les archives ZIP et XPI non signé 5.8.0 sont construites et contrôlées; les essais manuels Firefox restent nécessaires. Sur Firefox Nightly Android, le XPI peut être installé depuis un fichier après désactivation de `xpinstall.signatures.required`; la procédure et la précaution associée sont décrites ci-dessus. Consulter [BUILD-AND-REVIEW.fr.md](amo/BUILD-AND-REVIEW.fr.md) pour l’état des contrôles.
