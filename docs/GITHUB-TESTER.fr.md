# Partager et essayer Mon Mur

## Ce que contient ce dépôt

Ce dépôt dédié contient à sa racine le code de l’extension : manifeste, pages et scripts, `css/`, `icons/`, `models/`, `vendor/`, avis des composants tiers, documentation, scripts de préparation et tests. Les bibliothèques et fichiers WASM locaux sont nécessaires au fonctionnement hors ligne; ils ne sont pas des artefacts de build à supprimer.

Ne pas copier les dossiers de versions historiques placés à côté de `current/`, ni les archives générées dans `web-ext-artifacts/`. Ne pas publier de profil Firefox, sauvegarde personnelle, journaux, données de navigation ou secrets. Le `.zip` d’installation est un livrable de version; le `.xpi` local est non signé. Les paquets se régénèrent depuis les sources.

Le dépôt de développement d’origine contient d’autres projets et des instantanés de versions; ils ne sont pas inclus ici. Ce clone indépendant est la racine à utiliser pour contribuer à Mon Mur.

## Charger la version de travail dans Firefox

1. Cloner ou télécharger les sources et installer Firefox.
2. Ouvrir `about:debugging#/runtime/this-firefox`.
3. Cliquer sur **Charger un module complémentaire temporaire…**.
4. Sélectionner `manifest.json` à la racine du dépôt.
5. Ouvrir l’extension depuis son bouton ou depuis la page de préférences.

Après une modification, cliquer sur **Recharger** dans `about:debugging` pour charger le code actualisé. Le chargement temporaire disparaît à la fermeture de Firefox. Utiliser un profil de test si l’on souhaite isoler les données; les sources, réglages, favoris et articles collectés sont conservés dans le profil Firefox.

Les autorisations de sites sont accordées par Firefox. Sans accès global, l’extension demande l’accès aux domaines nécessaires au fil des actions. Les recherches facultatives transmises à des services tiers et leur consentement sont décrits dans **Préférences → Données et accès**.

## Construire les archives locales

Depuis la racine du dépôt Mon Mur, avec Bash, Node.js, npm et `zip` installés :

```sh
./scripts/build-release.sh
```

Les fichiers sont placés dans `web-ext-artifacts/`. Le ZIP est construit avec `web-ext`; le XPI est le même paquet avec l’extension attendue par Firefox. Ce XPI n’est pas signé par Mozilla et ne s’installe pas comme extension permanente dans un Firefox standard. Pour le développement, charger directement le manifeste avec `about:debugging`.

## Portée et contributions

Mon Mur est un projet personnel réalisé à 100 % par « vibe coding ». Il peut servir de prototype et de cahier des charges fonctionnel à examiner et à améliorer. L’auteur considère son exploration fonctionnelle actuelle comme terminée; les corrections ou améliorations proposées par la communauté pourront être discutées dans les issues ou les pull requests.

Le partage collectif des J’aime avec un mur automatique commun est une idée éventuelle, pas une fonction disponible ni une promesse de réalisation. Le projet n’introduit aujourd’hui ni compte utilisateur ni serveur Mon Mur; toute proposition de partage à distance devrait préciser comment elle respecte ces contraintes.

Le code de Mon Mur est publié sous **GNU GPL version 3**, selon le fichier [`LICENSE`](../LICENSE) à la racine. Les composants tiers conservent leurs licences propres, listées dans `THIRD_PARTY_NOTICES.md`. La note [ASSET-LICENSES.fr.md](amo/ASSET-LICENSES.fr.md) recense séparément les ressources graphiques dont la provenance ou l’autorisation de redistribution reste à confirmer. Le brouillon `LICENSE-PROPOSAL.fr.md` est historique et ne remplace pas la GPL v3.

## État de la version 5.5.0

La version est préparée localement pour revue. Un paquet construit ne signifie pas qu’il a été testé manuellement dans Firefox, signé, soumis à AMO ou publié sur GitHub. Consulter [BUILD-AND-REVIEW.fr.md](amo/BUILD-AND-REVIEW.fr.md) pour le suivi de publication.
