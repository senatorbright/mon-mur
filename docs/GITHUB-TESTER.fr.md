# Partager et essayer Mon Mur 5.13.0

## Ce que contient ce dépôt

Ce dépôt contient Mon Mur à sa racine : manifeste, pages, scripts, `css/`, `icons/`, `models/`, `vendor/`, avis des composants tiers, documentation, outils de préparation et tests. Les bibliothèques et fichiers WASM locaux sont nécessaires au fonctionnement hors ligne.

Les archives générées dans `web-ext-artifacts/` et les fichiers `.xpi` locaux ne font pas partie des sources à commiter. Ne publiez pas de profil Firefox, sauvegarde personnelle, journaux, données de navigation ou secrets. Les paquets se régénèrent depuis les sources.

## Tester temporairement depuis les sources dans Firefox

1. Cloner ou télécharger les sources et installer Firefox.
2. Ouvrir `about:debugging#/runtime/this-firefox`.
3. Cliquer sur **Charger un module complémentaire temporaire…**.
4. Sélectionner `manifest.json` à la racine du dépôt.
5. Ouvrir l’extension depuis son bouton ou depuis la page de préférences.

Après une modification, cliquer sur **Recharger** dans `about:debugging`. Le chargement temporaire est retiré à la fermeture ou au redémarrage de Firefox; il faut alors le charger à nouveau. Utilisez un profil de test si vous souhaitez isoler les données. Les autorisations et les données de l’extension restent gérées par le profil Firefox.

## Installer une release de manière durable

Les releases et leurs fichiers sont publiés sur [GitHub](https://github.com/senatorbright/mon-mur/releases). Le fichier XPI est non signé. Pour le conserver après fermeture et redémarrage, installez-le dans l’un des navigateurs suivants.

### Waterfox sur ordinateur

Ouvrez `about:addons`, puis le menu outils et **Installer un module depuis un fichier…**. Sélectionnez le XPI téléchargé et confirmez après avoir vérifié ses permissions. Waterfox accepte les extensions non signées; consultez [l’aide Waterfox sur les extensions non signées](https://www.waterfox.com/support/unsigned-addons/).

### Firefox Nightly sur ordinateur

Ouvrez `about:config`, réglez `xpinstall.signatures.required` sur `false`, puis ouvrez `about:addons` et choisissez **Installer un module depuis un fichier…** dans le menu engrenage. Sélectionnez le XPI et confirmez. Cette préférence doit rester désactivée tant que l’extension non signée est installée. Voir le [guide Mozilla sur la signature des modules](https://support.mozilla.org/en-US/kb/add-on-signing-in-firefox).

### Firefox Nightly sur Android

1. Téléchargez le XPI de la release sur le téléphone.
2. Dans Firefox Nightly, ouvrez `about:config`. Si cette page est indisponible, ouvrez `chrome://geckoview/content/config.xhtml`.
3. Réglez `xpinstall.signatures.required` sur `false`.
4. Dans **Paramètres → À propos de Firefox Nightly**, touchez cinq fois le logo pour activer le menu de débogage.
5. Revenez dans **Paramètres → Installer une extension depuis un fichier**, choisissez le XPI et confirmez.

La préférence doit rester désactivée tant que l’extension non signée est installée. Après le retrait de l’extension, vous pouvez la remettre à `true`. Cette option avancée réduit la protection contre les extensions modifiées; téléchargez le XPI uniquement depuis la release officielle. Le parcours par ADB d’une version de travail est détaillé dans [Tester Mon Mur sur Android](TESTER-ANDROID.fr.md).

### Firefox standard sur ordinateur

Firefox standard bloque l’installation permanente d’un XPI non signé. Pour un essai, chargez les sources avec `about:debugging` comme indiqué plus haut. Le chargement temporaire disparaît à la fermeture ou au redémarrage de Firefox. Pour une installation durable dans Firefox standard, il faut un XPI signé par Mozilla.

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

## État de la version 5.13.0

La release 5.13.0 met à jour les instructions d’installation et d’essai. Le paquet ZIP et le XPI non signé sont joints à la release GitHub. L’installation durable est décrite pour Waterfox et Firefox Nightly sur ordinateur, ainsi que pour Firefox Nightly sur Android; le chargement temporaire sur Firefox standard est réservé aux essais et disparaît à la fermeture du navigateur. Les essais manuels sur les différentes plateformes doivent être réalisés dans chaque navigateur utilisé.
