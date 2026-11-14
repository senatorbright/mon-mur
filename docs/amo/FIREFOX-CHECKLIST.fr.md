# Vérifications Firefox avant AMO

État au 2 novembre 2026 : **à exécuter par un testeur humain**. Les tests automatisés Node couvrent l'onboarding sans accès global et la demande d'un seul domaine lors de l'ajout d'une source. Ils ne simulent pas les dialogues natifs de permissions ni une installation Firefox complète.

## Profil propre et permissions

1. Créer un profil Firefox temporaire dans `about:profiles`; ne pas utiliser le profil quotidien.
2. Depuis ce profil, ouvrir `about:debugging#/runtime/this-firefox`, charger temporairement `web-ext-artifacts/mon-mur-5.0.0.zip`, puis ouvrir **Préférences**.
3. Refuser l'accès global si Firefox le propose. Vérifier que l'onboarding avance jusqu'au bouton **Commencer** et ouvre le mur.
4. Dans **Sources**, ajouter un flux de test contrôlé par le testeur. Vérifier que Firefox ne demande que l'hôte concerné, puis que le flux est validé et collecté.
5. Dans **Données et accès**, autoriser l'accès global. Vérifier le statut. Le retirer depuis les paramètres des extensions Firefox et vérifier que le statut revient à l'accès limité sans boucle de demandes.
6. Activer CrowdBunker ou Rumble individuellement. Accorder l'accès au domaine proposé, puis le révoquer; vérifier que la collecte correspondante s'arrête et que l'interface indique l'état.
7. Ouvrir un article et un lien Bluesky, puis essayer le filtre de visages. Vérifier le texte d'explication en cas d'accès refusé et le comportement une fois l'accès accordé.

## Repères rhétoriques et catalogue 4.4.0

1. Activer l’analyse locale dans Préférences → Filtres intelligents, puis ouvrir des articles contrôlés couvrant anaphore, opposition corrective, négations successives, concession, renforcement cumulatif et prétérition.
2. Vérifier le surlignage, l’explication associée et la navigation entre le passage annoté et le bilan.
3. Contrôler des phrases ordinaires sans ces constructions afin de repérer des explications inattendues; vérifier que les listes banales restent silencieuses.
4. Ouvrir « Découvrir les techniques reconnues par Mon Mur » et vérifier que les neuf fiches chargent, que les exemples sont mis en évidence et que la page reste lisible en thèmes clair et sombre.

Ne pas considérer ces vérifications manuelles comme réalisées avant exécution et consignation par un testeur.

## Titres accrocheurs et lecture intégrée 4.5.0

1. Activer le filtre dans Préférences → Filtres intelligents. Vérifier que les titres des murs classiques et automatiques affichent les passages signalés.
2. Ouvrir l’explication d’un titre signalé; vérifier que « Lire l’article » déplie et amène au contenu intégré, tandis que le lien discret ouvre le site d’origine.
3. Tester un article déjà déplié et un échec de récupération. Vérifier l’absence de nouvelle récupération inutile et la présence du message d’erreur et du lien de secours.
4. Vérifier les interactions clavier, les thèmes clair et sombre, puis tester les six exemples et les contre-exemples du corpus de régression dans `tests/clickbait-detection.test.js`.

## Réseaux Sociaux Auto et LinkedIn 4.7.0

1. Activer la recherche LinkedIn dans les préférences et vérifier que les sujets prioritaires interrogent Google Actualités RSS et alimentent le mur.
2. Ouvrir un résultat depuis sa carte; vérifier que seul l’onglet ouvert par ce clic est observé et que son permalien LinkedIn est associé durablement à la bonne carte.
3. Déplier une publication compatible et vérifier l’intégration officielle LinkedIn, ses médias disponibles et le lien de secours. Vérifier séparément un article `/pulse/` et une publication `/posts/`.
4. Vérifier l’association manuelle de secours, puis actualiser le mur et redémarrer Firefox pour contrôler la persistance.
5. Noter que la lecture des vidéos intégrées reste à valider; ne pas déclarer le parcours validé avant ces essais.

## Fonctions et données de test

Avec des contenus publics de test et des sujets neutres, vérifier le premier cycle des sources, la collecte automatique activée, l'affichage, un favori, l'archivage, « À consulter plus tard », l'exportation et la restauration d'une sauvegarde. S'assurer que la sauvegarde ne remplace pas les articles et favoris.

## Android et restauration sémantique 5.0.0

1. Pour un téléphone physique, suivre `docs/TESTER-ANDROID.fr.md` et charger la version de travail temporairement avec ADB; le XPI local est non signé.
2. Vérifier en portrait et paysage le défilement tactile des murs, le résumé du mur, les compteurs, les actions et l'accès aux préférences.
3. Importer une sauvegarde contenant des catégories exclues, des expressions exclues et des priorités. Vérifier ces valeurs dans les préférences, exporter à nouveau et comparer les champs sémantiques.
4. Répéter avec une sauvegarde ancienne où ces champs sont absents : l'import doit avertir l'utilisateur et ne pas prétendre restaurer les valeurs manquantes.
5. Tester l'ouverture et le repli d'un article, les liens externes, les filtres et les médias disponibles. Consigner la lecture vidéo réelle uniquement lorsqu'un contenu compatible a été exercé.

## Mise à jour locale

1. Dans ce profil temporaire, installer le paquet 5.0.0 et créer des murs, une source et des articles de test.
2. Créer hors dépôt une copie du paquet avec la même valeur `browser_specific_settings.gecko.id` et un numéro local supérieur; ne pas publier cette copie.
3. Charger la copie comme mise à jour dans le même profil sans désinstaller l'extension.
4. Vérifier les murs, sources, filtres, favoris, archives, préférences et historique d'URL.

Consigner version de Firefox, système, étapes, permissions accordées/refusées, résultats et erreurs console. Ne pas déclarer ces essais réussis tant qu'un testeur ne les a pas exécutés.
