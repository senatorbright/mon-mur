# Brouillon historique de licence — remplacé pour ce dépôt

> **Statut :** ce document est conservé comme historique de préparation AMO. Le dépôt GitHub public Mon Mur est désormais publié sous GNU GPL version 3, dont le texte se trouve dans [`../../LICENSE`](../../LICENSE). Les restrictions commerciales décrites ci-dessous ne s'appliquent pas à cette publication GPL.

Le contenu ci-dessous était une proposition, pas une licence définitive. Il ne doit pas être utilisé comme licence du dépôt actuel.

## Intention traduite en règles

- Autoriser l'utilisation personnelle et l'utilisation interne gratuite par une entreprise, y compris par ses salariés et prestataires agissant pour son compte.
- Autoriser l'inspection, la copie, la modification et la redistribution gratuite du code et des versions dérivées, sous cette même licence et avec maintien des avis de droit d'auteur et de l'attribution.
- Interdire la vente, la location ou toute distribution payante de Mon Mur ou d'une version dérivée.
- Interdire l'incorporation ou le regroupement de Mon Mur ou de code dérivé dans un produit ou service logiciel distribué contre paiement, même si Mon Mur n'en constitue qu'une partie.
- Laisser l'auteur libre d'accorder séparément une autorisation commerciale écrite.

## Modèle le plus proche identifié

La Commons Clause 1.0 superposée à une licence permissive comme Apache-2.0 est un modèle publié de restriction de vente. Sa définition vise la fourniture à des tiers, contre rémunération, d'un produit ou service dont la valeur provient entièrement ou substantiellement du logiciel. Elle préserve donc l'usage interne gratuit, mais sa notion de valeur « substantielle » ne couvre pas avec certitude l'interdiction voulue ici d'inclure le code dans n'importe quel logiciel vendu. La Commons Clause indique aussi que ce régime n'est pas de l'open source au sens de l'OSI.

**Conclusion :** Commons Clause seule n'exprime pas complètement la règle souhaitée. Le candidat fidèle serait une licence personnalisée « source disponible, redistribution gratuite » qui reprendrait les autorisations de modification et redistribution d'Apache-2.0, assorties d'une interdiction explicite de toute distribution à titre onéreux et d'incorporation dans un produit logiciel payant. Il faudrait définir précisément « distribution gratuite », « produit payant », les prestataires, les contributions et les droits sur les marques.

## Ébauche de clauses à faire relire

1. **Droits accordés.** Sous réserve des conditions ci-dessous, le titulaire accorde à toute personne une autorisation mondiale, gratuite et non exclusive d'utiliser, consulter, reproduire, modifier et redistribuer le code source et les versions exécutables de Mon Mur.
2. **Redistribution gratuite.** Les copies et versions modifiées peuvent être redistribuées sans paiement ni autre contrepartie liée à l'accès au logiciel, à condition d'inclure une copie de la licence, les avis de droit d'auteur et une attribution raisonnable, de signaler les modifications substantielles, et de soumettre les versions dérivées redistribuées aux mêmes conditions.
3. **Usage interne.** Une organisation peut installer, utiliser et modifier Mon Mur sans frais pour ses propres besoins internes. Elle peut autoriser ses salariés et prestataires à agir pour son compte, sans redistribution à un tiers ni fourniture d'un service externe dont l'accès repose sur Mon Mur.
4. **Exploitation commerciale interdite sans autorisation distincte.** Sans accord écrit séparé du titulaire, nul ne peut vendre, louer, licencier contre paiement, distribuer contre rémunération ou inclure Mon Mur ou une version dérivée dans un logiciel, une offre ou un service distribué à titre onéreux. L'interdiction s'applique même lorsque Mon Mur est un composant secondaire ou est fourni sans prix distinct dans le produit payant.
5. **Autorisation commerciale séparée.** Le titulaire peut accorder à toute personne une autorisation commerciale distincte, selon des conditions écrites convenues séparément.
6. **Droits tiers et marques.** Cette licence ne modifie pas les licences des composants tiers, n'accorde aucun droit sur les marques, ni sur les contenus importés depuis des sites externes.
7. **Absence de garantie.** Le texte doit inclure une clause de non-garantie et une limitation de responsabilité adaptées au droit applicable, à rédiger avec un conseil juridique.

Ces clauses sont un cahier des charges, pas un texte directement publiable. Il manque notamment les définitions, le traitement des contributions, la résiliation/remédiation, les brevets (si pertinent), le choix du droit applicable et l'articulation avec les droits moraux selon la juridiction.

## Présentation sur AMO

Les règles AMO imposent de renseigner une licence pour la fiche. La documentation publique demande de choisir la licence appropriée mais ne décrit pas le parcours des licences personnalisées. Le dépôt public d'addons-server contient une liste de licences pré-définies, un indicateur des choix proposés dans le formulaire et un modèle pouvant stocker un texte de licence non intégré (`OTHER`). Cela ne prouve pas qu'un éditeur peut actuellement créer puis sélectionner cette licence personnalisée dans le portail AMO.

Avant soumission, vérifier dans le portail développeur si l'option « Other » ou un champ de texte personnalisé est offert. Si elle ne l'est pas, ne pas sélectionner MIT, Apache, CC BY-NC ou « All Rights Reserved » en prétendant que cette option porte les clauses ci-dessus. Demander à AMO comment déclarer la licence personnalisée, puis publier le texte intégral à une URL stable et l'associer clairement au code.

Les dépendances incluses dans Mon Mur gardent leurs licences propres. Le texte de Mon Mur ne peut couvrir que les éléments dont l'auteur détient les droits.

## Sources consultées

- Commons Clause 1.0 et sa FAQ : <https://commonsclause.com/>.
- Définition Open Source de l'OSI, notamment redistribution et usage sans discrimination : <https://opensource.org/osd>.
- Soumission AMO : <https://extensionworkshop.com/documentation/publish/submitting-an-add-on/>.
- Code serveur AMO, liste des licences intégrées : <https://github.com/mozilla/addons-server/blob/master/src/olympia/constants/licenses.py>.
- Code serveur AMO, modèle de licence : <https://github.com/mozilla/addons-server/blob/master/src/olympia/versions/models.py>.
