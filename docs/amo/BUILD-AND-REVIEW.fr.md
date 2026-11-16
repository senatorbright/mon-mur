# Construction et revue AMO

## Préparation 5.6.0 — 16 novembre 2026

Le manifeste cible `5.6.0`. La version corrige l’état du filtre linguistique lorsque d’anciennes valeurs étaient conservées au niveau d’un mur, et fiabilise la confirmation visuelle de l’activation des techniques de persuasion. Les références de version, le changelog cumulatif et les instructions de test/construction sont actualisés.

Le dépôt GitHub public `senatorbright/mon-mur` est déjà créé, sous GPL v3. La préparation locale n’a effectué aucun push. Certaines ressources graphiques de plateformes restent documentées avec des droits de redistribution à confirmer dans `ASSET-LICENSES.fr.md`; elles sont conservées en l’état, sans remplacement.

La suite automatisée passe avec 284 tests réussis et aucun échec. `./scripts/build-release.sh` produit `web-ext-artifacts/mon-mur-5.6.0.zip` et `web-ext-artifacts/mon-mur-5.6.0.xpi`; les deux archives ont été contrôlées comme ZIP valides. Le XPI est non signé; il ne s’agit ni d’une signature Mozilla ni d’une soumission AMO. Les tests manuels Firefox restent nécessaires.

## Préparation 4.2.0 (2 novembre 2026)

L'ID Gecko `mon-mur-presse-toolbar@local` est inchangé. Garder cet ID et mettre à jour l'extension sans la désinstaller conserve le même espace de stockage Firefox; une désinstallation peut supprimer ces données. Firefox standard exige une extension signée. Pour une diffusion privée, créer une soumission **Unlisted / On your own** dans AMO, téléverser le ZIP 4.2.0, répondre aux demandes de revue et télécharger le XPI signé. Cela ne rend pas l'extension publiquement listée. Ne pas utiliser `web-ext sign` avant obtention des identifiants API et une validation explicite; aucun secret n'est stocké ici.

La première soumission et chaque mise à jour passent par AMO pour signature. Le flux Unlisted n'assure pas de mise à jour automatique à partir d'un ZIP distribué séparément; prévoir de remettre le nouveau XPI signé puis de l'installer comme mise à jour sur la même installation. L'archive de sources du reviewer est distincte. Elle est justifiée ici par le bundle MediaPipe amont minifié, avec la provenance et le matériel source déjà inclus dans le dépôt; fournir `mon-mur-4.2.0-source.zip` et les instructions si le formulaire AMO demande les sources.

Avant envoi, publier le brouillon de confidentialité à une URL stable et le renseigner dans le dossier AMO : des termes de recherche sont transmis aux fournisseurs après consentement. La réserve concernant la règle AMO 6.1 est exposée aux reviewers avec le fonctionnement observé; cette documentation ne constitue pas une décision de conformité. La licence, le contact de support et les captures restent à finaliser par l'éditeur. La préparation locale ne constitue ni une revue AMO ni une signature.

## Préparation 4.4.0 — 2 novembre 2026

Le manifeste cible `4.4.0`. Cette version ajoute le catalogue pédagogique local des repères rhétoriques. Les 15 tests ciblés passent; la vérification manuelle Firefox de la détection, des faux positifs et des fiches reste à faire. Le ZIP installable et l’archive source 4.4.0 restent à construire et à contrôler. La version ne doit pas être considérée comme validée pour distribution avant ces étapes.

## Préparation 4.5.0 — 2 novembre 2026

Le manifeste cible `4.5.0`. Cette version ajoute le filtre local « Titres accrocheurs », son catalogue synchronisé et la lecture intégrée prioritaire depuis sa vignette explicative. Les tests et les parcours manuels spécifiques à cette version restent à exécuter avant toute distribution. Le ZIP installable et l’archive source restent à construire et à contrôler.

## Préparation 4.7.0 — 4 novembre 2026

Le manifeste cible `4.7.0`. Cette version documente l’intégration LinkedIn dans Réseaux Sociaux Auto et la détection du permalien après ouverture normale du résultat. Les tests automatisés disponibles donnent 177 réussites et 7 échecs dans l’état de travail actuel; ils doivent être examinés avant toute distribution. Les parcours manuels Firefox, notamment les médias et vidéos de l’embed LinkedIn, restent à effectuer. Le ZIP installable et l’archive source 4.7.0 restent à construire et à contrôler.

## Préparation 5.0.0 — 7 novembre 2026

Le manifeste cible `5.0.0`. La version regroupe les corrections de sauvegarde/restauration des filtres sémantiques, l’ergonomie responsive Android et la fiabilisation des alarmes périodiques. La suite complète compte 238 tests réussis. L’interface a été observée sous Firefox Nightly/Waydroid en portrait et paysage; la lecture vidéo réelle et un essai sur téléphone physique restent à effectuer. Les paquets locaux sont non signés et ne constituent pas une distribution AMO.

Pour un essai sur téléphone, utiliser `docs/TESTER-ANDROID.fr.md`. Le XPI produit par le script Android est un paquet non signé; le chargement temporaire avec `web-ext run` est la méthode de test proposée. Toute installation durable sur Firefox Android nécessite un XPI signé par Mozilla.

## Paquet installable

Le projet ne comporte pas de chaîne de compilation. Les fichiers présents à la racine du dépôt sont directement exécutés par Firefox. Node.js, npm, `web-ext` 10.7.0 et `unzip` sont utilisés pour construire et contrôler l'archive.

Depuis la racine du dépôt Mon Mur :

```sh
node --test tests/*.test.js
./scripts/build-amo.sh
```

Le script utilise la version exacte `web-ext@10.7.0` et produit le ZIP de la version inscrite au manifeste. Il exclut le README de développement, les changelogs historiques, les notes AMO, scripts de préparation, tests, journaux et fichiers système. Le changelog cumulatif de la version est conservé dans le paquet, car l’interface installée le télécharge depuis la page de suivi des évolutions. Les avis de licence, le manifeste, le modèle local et les runtimes WASM requis restent inclus.

Pour inspecter et relancer lint sur les fichiers exacts du paquet généré :

```sh
unzip -l web-ext-artifacts/mon-mur-5.6.0.zip
tmp_dir="$(mktemp -d)"
unzip -q web-ext-artifacts/mon-mur-5.6.0.zip -d "$tmp_dir"
npx --yes web-ext@10.7.0 lint --source-dir "$tmp_dir"
rm -rf "$tmp_dir"
```

Ne pas lancer deux builds en parallèle: le nom d'archive est déterministe.

## Code source destiné aux reviewers

Le JavaScript de Mon Mur n'est pas produit par un minificateur. Les fichiers app signalés à l'origine comme minifiés ont été formatés pour la revue. MediaPipe Tasks Vision 0.10.21 est intégré sans modification : le bundle, les deux chargeurs WASM JavaScript et les deux binaires WASM correspondent aux fichiers du package npm officiel. Mon Mur importe le bundle depuis son code d'arrière-plan et lui fournit le chemin local des ressources WASM. La carte de sources et le `package.json` correspondent à la version distribuée.

Si AMO demande les sources supplémentaires :

```sh
./scripts/build-amo-source.sh
```

Cette archive de revue comprend les sources du projet, ses tests, les présents documents et la carte de sources MediaPipe amont. Les fichiers distribués sont identiques aux fichiers du package officiel 0.10.21. Le paquet installable AMO est distinct. Mon Mur n'a pas d'étape de compilation à reproduire; une archive destinée à AMO se construit avec `./scripts/build-amo.sh`; un XPI de test non signé se construit avec `./scripts/build-android-test.sh`.

## Avertissements de lint du paquet 4.2.0

Le lint antérieur à la restauration officielle MediaPipe comptait 0 erreur, 0 notice et 10 avertissements. Le rapport doit être renouvelé sur l'archive finale. Les sources lisibles des bibliothèques et les liens vers leurs versions exactes doivent être disponibles au reviewer; l'avertissement DASH sur `eval` demande aussi un essai Firefox sous la CSP déclarée. Les avertissements restent à examiner par AMO et ne constituent pas une approbation de conformité.
