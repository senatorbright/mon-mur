# Audit responsive Android — Mon Mur

Date : 7 novembre 2026
Environnement : Firefox Nightly 161.0a1 sous Waydroid (Android 13, x86_64), capture portrait 600 × 1000 et paysage 1000 × 600.

## Anomalies observées et corrections

| Écran | Sévérité | Observation | Correction |
| --- | --- | --- | --- |
| Mur principal — sélecteur | Élevée | Les murs suivants étaient difficiles à atteindre sur petit écran ; une règle de la barre sticky masquait le débordement horizontal. Le centrage des éléments débordants écartait les premiers murs de la vue. Les boutons des murs automatiques héritaient aussi de la largeur cible comme hauteur et certains badges agrandissaient les boutons personnels. | Bande tactile défilante, alignée sur le premier mur, noms prioritaires devant icônes décoratives et boutons de 36 px pour afficher environ trois murs en portrait. Tous les murs personnels et automatiques restent dans la bande mobile ; les murs personnels supplémentaires gardent aussi le menu desktop. Geste vérifié dans Waydroid jusqu’aux murs Vidéos, RS et PDF. |
| Mur principal — hauteur de l’en-tête | Moyenne | Les pastilles « AUTO » s’ajoutaient sous les murs automatiques et la bande réservait des marges verticales importantes. | Sur mobile, suppression de ces pastilles redondantes, boutons réduits à 36 px et marges verticales ramenées au minimum. Contrôle visuel effectué dans Waydroid après rechargement de l’extension. |
| Mur principal — résumé et commandes | Moyenne | Le nom du mur, son compteur et les commandes Mes priorités/Actualiser occupaient trois rangées. | Résumé aligné sur la ligne du nom (avec ellipse si nécessaire), commandes sur une seule rangée et boutons de 32 px. Capture portrait Waydroid : le premier article apparaît environ 50 px plus haut. |
| Historique des URL | Moyenne | Le tableau large pouvait défiler horizontalement sans indication. | Indication de défilement affichée uniquement sur petit écran. |
| Catalogues des techniques | Moyenne | Les puces de navigation horizontale n’indiquaient pas le geste de défilement. | Indication ajoutée sur les catalogues persuasion et clickbait, uniquement sur petit écran. |
| Gestion des sources, fenêtre courte | Faible | Les en-têtes verticaux des murs prenaient beaucoup de hauteur. | En-têtes raccourcis sous 650 px de haut. |

Les autres parcours consultés (cartes d’articles, navigation, panneaux de préférences, filtres et contrôles) n’ont pas révélé d’anomalie responsive prioritaire dans cet audit. Le bureau conserve la présentation en lignes ; les règles du carrousel sont limitées aux écrans étroits.

## P0 — Diagnostic sauvegarde

La sauvegarde d’origine `(4)` ne contient ni `excludedCategories`, ni `excludedKeywords`, ni `priorities`, ni à la racine ni dans les réglages individuels des murs. L’absence des filtres vient donc du fichier source et n’est pas propre à Android. L’import avertit lorsque ces champs manquent, sans inventer de valeurs. Les sauvegardes `(5)` et `(6)` contiennent respectivement 15 catégories exclues, 24 expressions exclues et 7 priorités ; la `(6)` a été exportée après restauration dans un profil desktop isolé. Le format reste en version 6. Une migration testée fusionne aussi les anciennes règles enregistrées par mur.

## Fonctions et limites constatées

- La sauvegarde de préférences est couverte par des tests d’export/import des filtres sémantiques ; une sauvegarde récente a aussi été relue dans un profil Firefox desktop isolé.
- Le floutage d’image a été vérifié sur Android en activant temporairement le filtre du mur, puis en rétablissant son réglage désactivé.
- Firefox Android ne fournit pas l’API `tabs.hide` utilisée par certaines recherches automatiques. Les chemins dépendants disposent d’un repli ou d’un message explicite ; aucune permission globale n’a été ajoutée.
- Les interactions ne reposent pas sur le survol : aucun gestionnaire JavaScript `mouseover`/`mouseenter` n’est présent. Les règles CSS de survol servent au retour visuel ; les commandes d’article disposent aussi d’états de focus clavier.
- Les tests couvrent la détection du lecteur et ses replis, mais le mur Vidéos affichait zéro article au moment du contrôle ; la lecture vidéo réelle n’a donc pas pu être exercée avec les données présentes.
- Le rafraîchissement périodique a été observé précédemment sur une collecte réelle ; je n’ai pas relancé une attente de 15 minutes. La création d’alarme au démarrage est couverte par un test de non-régression.
- Waydroid ne valide pas la veille, la batterie ni les restrictions d’arrière-plan d’un téléphone réel. La synthèse vocale n’avait pas de voix disponible dans cette instance.

## Validation

- Suite Node : 238 tests réussis, 0 échec.
- `node --check js/wall.js` et `git diff --check` réussis.
- Défilement horizontal du sélecteur observé au doigt dans Firefox Android ; le défilement affiche les murs automatiques suivants.
- Captures effectuées en portrait et en paysage. Le contrôle paysage porte sur la mise en page ; les interactions vidéo restent non vérifiées faute de contenu disponible.
