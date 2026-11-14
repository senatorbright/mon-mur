# Mon Mur

Mon Mur est une extension Firefox qui rassemble des articles et des publications dans des murs thématiques que vous configurez. Elle est conçue pour fonctionner sans compte Mon Mur ni serveur Mon Mur.

## Fonctions principales

- Suivre des sites et leurs flux RSS/Atom, puis organiser leurs publications par mur.
- Créer plusieurs murs, régler leur fréquence de collecte, leur ordre et leurs filtres.
- Découvrir manuellement des sites et des flux à partir de mots-clés.
- Consulter des murs automatiques pour des vidéos, des publications Bluesky et LinkedIn, ou des documents PDF référencés par Internet Archive.
- Filtrer les contenus par mots-clés et préférences, lire les articles dans l’extension et retrouver les éléments aimés ou à consulter plus tard.
- Activer des filtres facultatifs, dont la détection locale de visages dans les vignettes.
- Exporter les préférences et les sources dans une sauvegarde JSON.

Les sources et préférences sont enregistrées dans le stockage local de Firefox; les articles sont conservés dans IndexedDB. La détection des visages utilise un modèle et un moteur embarqués, sans service distant d’inférence.

## Tester dans Firefox (installation temporaire)

1. Cloner ce dépôt ou télécharger son contenu, puis décompresser l’archive si nécessaire.
2. Dans la barre d’adresse de Firefox, ouvrir `about:debugging#/runtime/this-firefox`.
3. Dans la section **Débogage**, cliquer sur **Charger un module complémentaire temporaire…**.
4. Dans la fenêtre de sélection de fichiers, ouvrir le dossier du dépôt et choisir **`manifest.json`** (à sa racine), puis valider.
5. L’extension apparaît dans Firefox. Ouvrir son panneau, suivre une page ou ajouter l’adresse d’un site ou d’un flux, puis accepter les autorisations demandées.

Pour recharger une version modifiée, revenir à `about:debugging#/runtime/this-firefox` et recharger l’extension, ou sélectionner à nouveau `manifest.json`. Une extension chargée temporairement doit être rechargée après la fermeture de Firefox.

Firefox peut demander des autorisations d’accès aux sites. Vous pouvez les accorder au cas par cas ou régler l’accès dans les préférences de l’extension. Le manifeste demande Firefox 140 ou une version ultérieure sur ordinateur.

Pour une utilisation durable, installez une version publiée par son canal de distribution habituel.

### Paquet ZIP de test

Pour créer l’archive `web-ext-artifacts/mon-mur-5.4.0.zip`, lancer à la racine du dépôt :

```sh
./scripts/build-amo.sh
```

Cette archive est non signée et préparée pour la soumission à AMO; elle ne remplace pas le chargement temporaire décrit ci-dessus. Pour installer durablement l’extension dans Firefox, il faut une version signée. Firefox Nightly ou Developer Edition peuvent aussi servir aux essais d’un paquet non signé, avec les réglages de développement appropriés. Waterfox documente également l’installation de modules non signés depuis un fichier, mais Mon Mur n’a pas été testé dans Waterfox.

Pour essayer ce paquet comme un module installé dans Firefox Nightly ou Developer Edition :

1. Copier le ZIP sous une extension `.xpi` :

   ```sh
   cp web-ext-artifacts/mon-mur-5.4.0.zip web-ext-artifacts/mon-mur-5.4.0-test-unsigned.xpi
   ```

2. Dans ce navigateur de test, ouvrir `about:config` et définir `xpinstall.signatures.required` sur `false`.
3. Ouvrir `about:addons`, choisir **Installer un module depuis un fichier…** dans le menu des outils, puis sélectionner le fichier `.xpi`.

Ce réglage sert uniquement aux essais avec des extensions non signées. Préférez le chargement temporaire par `about:debugging` pour tester le code au quotidien. Dans Waterfox, l’installation non signée depuis un fichier est documentée, mais la compatibilité fonctionnelle de Mon Mur n’y a pas été vérifiée.

## Comptes, réseau et données

Aucun compte n’est nécessaire et Mon Mur ne transmet pas vos murs, préférences ou articles à un serveur Mon Mur. Les données restent dans le profil Firefox utilisé; elles ne sont pas synchronisées automatiquement entre appareils. Utilisez la sauvegarde intégrée pour exporter les préférences et les sources.

L’extension contacte les sites et services nécessaires aux fonctions activées, par exemple pour récupérer des flux ou rechercher des publications publiques. Ces requêtes dépendent des sources choisies et des autorisations accordées. Les services tiers restent soumis à leurs propres règles. La détection de visages fonctionne localement dans Firefox.

## Licence

Le code de Mon Mur est publié sous licence GNU GPL version 3. Consultez [`LICENSE`](LICENSE). Les composants tiers conservent leurs licences propres; leurs avis et références figurent dans [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) et dans les fichiers de licence sous `vendor/`.

## Documentation

- [Fonctionnalités](fonctionnalites.html)
- [Politique de confidentialité — projet](docs/amo/PRIVACY-POLICY-DRAFT.fr.md)
- [Portée des autorisations](docs/amo/MOZILLA-DATA-CLASSIFICATION-QUESTION.fr.md)
- [Avis sur les composants et ressources tiers](THIRD_PARTY_NOTICES.md)
