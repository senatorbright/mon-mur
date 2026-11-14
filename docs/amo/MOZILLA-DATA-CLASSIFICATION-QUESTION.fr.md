# Note interne — classification et limites de la revue AMO

**Usage :** document de travail interne. Ne pas envoyer comme demande d'interprétation à Mozilla. Le dossier destiné aux reviewers décrit les comportements observés afin qu'ils puissent les évaluer.

## Classification retenue dans le manifeste 4.2.0

```json
"data_collection_permissions": {
  "required": ["none"],
  "optional": ["searchTerms", "websiteContent"]
}
```

- `searchTerms` couvre les sujets prioritaires transmis aux plateformes de recherche et les titres d'articles utilisés comme requêtes.
- `websiteContent` couvre les titres tirés de pages ou de flux et transmis à AlloCiné ou Wikipédia pour l'enrichissement cinéma.
- Les recherches par sujet vérifient `searchTerms`. L'enrichissement cinéma vérifie `searchTerms` et `websiteContent`. Les permissions restent optionnelles; le refus suspend les requêtes concernées.
- Aucun accès à l'historique Firefox, journal d'activité, serveur Mon Mur, compte, télémétrie ou rapport distant n'a été relevé dans le code audité.
- Les URL de flux et de pages sont saisies ou sélectionnées par l'utilisateur puis adressées aux sites concernés pour récupérer leur contenu. Elles ne proviennent pas de l'historique Firefox. Cette requête directe est décrite dans la politique, mais la taxonomie Mozilla ne tranche pas explicitement si une URL de source choisie correspond à `browsingActivity`.

La catégorie `websiteContent` a été ajoutée au manifeste et aux contrôles d'autorisation parce que le titre de page est effectivement transmis à un service tiers dans la recherche d'enrichissement. Les autres catégories ne sont pas ajoutées sans transmission correspondante établie.

## Réserve de politique 6.1

Mon Mur ne remplace pas le moteur de recherche de Firefox et n'intercepte ni ne redirige les recherches saisies dans le navigateur. Il construit ses propres recherches à partir des sujets choisis par l'utilisateur, puis transmet ces sujets aux plateformes sélectionnées afin d'alimenter des murs locaux. La documentation et le consentement décrivent ce flux, mais ne suffisent pas à conclure qu'il est permis par la règle 6.1. Ne pas présenter la conformité comme acquise; laisser les reviewers évaluer le comportement décrit dans `SUBMISSION-DRAFT.fr.md`.

## Réserve relative à MediaPipe

Le bundle MediaPipe Tasks Vision 0.10.21, ses deux chargeurs JavaScript WASM et ses binaires sont maintenant identiques au package npm officiel. Le code de Mon Mur utilise les API officielles et fournit un chemin local aux ressources embarquées. La modification locale des fichiers tiers qui figurait dans l'état antérieur a été retirée.

## Références officielles

- [Taxonomie et consentement intégré Firefox](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Règles AMO, notamment les sections 6.1 et 6.2](https://extensionworkshop.com/documentation/publish/add-on-policies/)
- [FAQ des règles AMO](https://extensionworkshop.com/documentation/publish/add-on-policies-faq/)
