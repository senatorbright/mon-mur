# Repères rhétoriques — principes et couverture

## Objectif

`MMPersuasion` relève des formes textuelles qui peuvent orienter l’attention, le jugement ou l’action du lecteur. Il ne détermine ni si une publication est trompeuse, ni si ses affirmations sont vraies, ni ce que son auteur voulait faire. Plusieurs procédés réunis peuvent inviter à examiner plus attentivement un passage; le détecteur ne transforme pas leur nombre en verdict ou en score de suspicion.

Le traitement reste local, synchrone et limité aux 300 000 premiers caractères. Le résultat donne des passages, des identifiants de règles, une explication du motif reconnu et un effet possible formulé avec prudence. Le catalogue pédagogique est construit depuis les mêmes métadonnées que le moteur.

## Principes de détection

- Reconnaître une construction ou une combinaison de fonctions, pas un mot isolé. « Attention », un chiffre, une question, « IA » ou un terme inquiétant ne suffit pas.
- Utiliser des déclencheurs lexicaux uniquement comme éléments d’une structure plus complète : avertissement + liste de risques; alternatives + renoncement; chiffres accumulés + question qui conteste le résultat; renversement explicite entre situation normale et problème.
- Traiter les chiffres, références d’autorité, événements, statistiques et listes comme des informations potentiellement factuelles. Ils deviennent un repère rhétorique seulement lorsqu’une forme reconnaissable les organise en argument ou en contraste.
- Afficher le passage qui justifie le repère et expliquer ce qui est observable. Les règles n’infèrent pas l’intention, l’exactitude, la représentativité d’une statistique ou l’existence d’une alternative réelle.
- Rester insensible à la casse. Les variantes d’apostrophe et certains accents sont prises en compte selon la règle; la couverture des accents et de la morphologie française n’est pas exhaustive.

## Techniques actuellement reconnues

Le catalogue contient 29 fiches pédagogiques et 30 identifiants de règles (l’anaphore et le parallélisme partagent une fiche). Les familles couvrent :

- **Répétition et rythme** : anaphore, parallélisme, formule redoublée réemployée.
- **Contraste et correction** : opposition corrective, négations suivies d’une affirmation, concession suivie d’un contraste, renforcement cumulatif, opposition valorisante.
- **Suggestion et cadrage** : prétérition explicite, question qui présuppose un bénéfice, question qui traite une prémisse comme acquise, connaissance présentée comme nécessaire au bon choix, écart entre image souhaitée et perception.
- **Inquiétude et pression** : avertissement suivi d’une liste de risques, échéance rapprochée explicitement soulignée, occasion présentée comme à ne pas manquer, interpellation liant préparation et adaptation, renversement d’une situation normale en point de départ d’un problème, solution présentée comme susceptible d’aggraver la situation.
- **Choix, contraste et causalité** : alternative formulée avec un renoncement, antithèse de regard ou de méthode, désignation explicite d’un « coupable », accumulation de chiffres suivie d’une question qui met en doute un résultat.
- **Contre-discours** : affirmation présentée comme répandue, suivie d’une formule annonçant une nuance.
- **Scénarisation et crédibilité** : invitation à imaginer une scène, expérience professionnelle revendiquée, flatterie associée à une demande d’aide.
- **Promesse et amplification** : effort présenté comme minimal, action présentée comme réalisable en une étape, liste explicitement prolongée ou amplifiée.

Le détecteur conserve aussi des candidats de listes ordinaires sans les présenter comme procédé persuasif, tant qu’aucun marqueur de prolongement explicite n’est présent.

## Exemples de combinaison

| Forme | Repère affiché | Ce qui n’est pas conclu |
| --- | --- | --- |
| « Acceptez X ou renoncez à Y » | Alternative formulée comme un ultimatum | Qu’il s’agisse réellement d’un faux dilemme |
| « Attention à ces cinq erreurs » | Avertissement associé à une liste | Que le conseil soit infondé |
| Situation apparemment normale, puis « c’est là que le problème commence » | Renversement inquiétant et suspense | Que le risque soit fréquent ou probable |
| « Le coupable idéal : X » | Attribution accusatoire de responsabilité | Que X soit innocent ou que le lien causal soit faux |
| Plusieurs ordres de grandeur, puis « où est le résultat ? » | Accumulation suivie d’une mise en doute | Que les chiffres soient faux ou qu’aucun résultat existe |
| Chiffre seul, date seule, question seule, liste ordinaire | Aucun repère par défaut | — |

## Casse, variantes et limites

Les expressions régulières utilisent majoritairement les options Unicode et insensibles à la casse (`iu`/`giu`); les comparaisons de répétitions normalisent la casse, les accents et les apostrophes. Les formulations exactes varient en français : synonymes, accords, pronoms, ponctuation, citations et phrases tronquées peuvent produire des omissions. À l’inverse, une structure reconnue peut être informative, littéraire ou parfaitement justifiée dans son contexte.

Les métaphores, la peur ou l’autorité ne sont pas détectées par une liste générale de mots : leur interprétation demande souvent davantage de contexte. Le détecteur privilégie donc des constructions explicites et compréhensibles plutôt qu’une couverture exhaustive. L’absence de repère ne signifie pas absence de persuasion.

Les tests couvrent des exemples positifs, des cas neutres, des variantes de casse et les extraits disponibles. Ils ne constituent pas une mesure statistique de précision ou de rappel sur l’ensemble des publications.

## Bilan de l’audit des règles

Le catalogue et le moteur ont été rapprochés : 29 fiches pédagogiques couvrent 30 identifiants, l’anaphore et le parallélisme partageant une fiche. La batterie `tests/persuasion-detection.test.js` contient un cas positif indépendant et un cas proche négatif pour chacun des 30 identifiants. Ce corpus ciblé vérifie des exemples conçus pour l’audit; il ne mesure pas la qualité sur des publications représentatives.

| Identifiant / procédé | Faiblesse vérifiée et correction | Cas vérifiés | Limite résiduelle |
| --- | --- | --- | --- |
| `anaphora-opening` — anaphore | Aucune faiblesse reproduite; règle conservée. | Reprise répétée / ouvertures différentes. | Trois phrases et deux premiers mots communs. |
| `parallel-cest-infinitive` — parallélisme | Aucune faiblesse reproduite; règle conservée. | Deux infinitifs parallèles / une phrase sans infinitif. | Cadre « C’est + infinitif » seulement. |
| `corrective-opposition` — opposition corrective | Faux positif sur « Ce n’est pas facile, mais nous y arriverons »; le connecteur seul ne suffit plus. Ajout d’une correction explicite traversant deux phrases voisines. | Correction par substitution, concession, changement de phrase et retour à la ligne. | Les reformulations sans marqueur de substitution restent difficiles à distinguer. |
| `double-negation-correction` — négations successives | Aucune faiblesse reproduite; règle conservée. | « Ni… ni… mais… » / négation coordonnée descriptive. | Forme explicite ciblée. |
| `concession` — concession et réfutation | Une concessive complète introduite par « même si » ou « bien que » pouvait être omise sans second connecteur. La phrase principale complète est maintenant prise en compte. | « Même si…, il… » / concession inachevée. | Le lien logique n’est pas interprété au-delà des marqueurs. |
| `cumulative-reinforcement` — renforcement cumulatif | Aucune faiblesse reproduite; règle conservée. | « Non seulement… mais aussi » / ajout sans cette structure. | Formule explicitement ciblée. |
| `explicit-preterition` — prétérition | Aucune faiblesse reproduite; règle conservée. | Annonce de non-évocation / négation ordinaire. | Verbes et locuteurs couverts limités. |
| `rhetorical-accumulation` — accumulation amplifiée | La frontière de mot empêchait de reconnaître le marqueur commençant par « à ». Frontière Unicode corrigée. | « Et même » et « à plus forte raison » / liste descriptive. | Marqueurs explicites et énumération suffisamment longue requis. |
| `repeated-reduplicated-formula` — formule redoublée répétée | Aucune faiblesse reproduite; règle conservée. | Répétition entre phrases / occurrence unique. | Dépend de la répétition de la même formule dans le texte analysé. |
| `promotional-simplicity` — simplicité promotionnelle | Aucune faiblesse reproduite; règle conservée. | Un clic / plusieurs clics. | Détecte les formulations « un seul clic/geste ». |
| `presupposed-debate-frame` — présupposition du débat | Aucune faiblesse reproduite; règle conservée. | « Plus la question de savoir si…, mais comment » / question ouverte. | Tournure précise nécessaire. |
| `readiness-pressure` — pression à l’adaptation | Une frontière `\b` bloquait les formes commençant par une lettre accentuée. Passage à une frontière Unicode. | Question d’adaptation / question de disponibilité ordinaire. | Verbes d’adaptation couverts explicitement. |
| `unmissable-opportunity` — occasion incontournable | Une frontière `\b` bloquait « à ne pas manquer ». Frontière Unicode corrigée. | Formule d’occasion / emploi ordinaire de « manquer ». | Ne vérifie pas l’importance ni la rareté réelles. |
| `near-term-urgency` — échéance proche | Aucune faiblesse reproduite; règle conservée. | « Tout juste une semaine » / échéance simple. | Ne mesure pas si l’urgence est artificielle. |
| `contrastive-role-model` — opposition valorisante | Aucune faiblesse reproduite; règle conservée. | Groupe hésitant opposé à un choix actif / deux groupes simplement décrits. | La structure de sujet et de décision reste étroite. |
| `hypothetical-scenario` — mise en situation | Aucune faiblesse reproduite; règle conservée. | Impératif « Imaginez un… » / description non adressée. | Personnage introduit par un déterminant requis. |
| `experience-based-credibility` — expérience revendiquée | Aucune faiblesse reproduite; règle conservée. | Expérience auprès d’un grand groupe / mention factuelle d’un groupe. | Ne couvre pas toutes les formes d’appel à l’autorité ou à la preuve sociale. |
| `flattering-altruistic-appeal` — flatterie liée à une demande | Faux positif sur une description de personnes généreuses. La détection exige maintenant un indice de sollicitation proche. | Demande d’aide valorisante / mention descriptive. | Les autres formes de flatterie ou d’altruisme ne sont pas couvertes. |
| `minimized-effort` — effort minimal | Aucune faiblesse reproduite; règle conservée. | « Juste en suivant une règle simple » / mention descriptive d’une règle simple. | Expressions de simplicité non répertoriées omises. |
| `positive-outcome-presupposition` — bénéfice présupposé | Aucune faiblesse reproduite; règle conservée. | Question sur un levier de création de valeur / question de calcul factuel. | Formule de bénéfice et de possibilité ciblée. |
| `message-perception-gap` — image et perception | Aucune faiblesse reproduite sur le cas disponible; règle conservée. | Décalage explicitement formulé / reprise du message. | Les paraphrases sémantiques restent susceptibles d’échapper à la règle. |
| `knowledge-needed-for-choice` — connaissance nécessaire au choix | Aucune faiblesse reproduite; règle conservée. | Compréhension présentée comme préalable / compte rendu de choix passé. | Formules « bons choix » et « encore faut-il comprendre » ciblées. |
| `forced-choice` — ultimatum | Des conditions de refus et d’absence d’activation suivies d’une perte d’accès échappaient à la règle. Ajout de ces constructions sans signaler les alternatives neutres. | Injonction / refus suivi d’une perte / accès suspendu / alternative libre. | Ne peut établir si la conséquence est inévitable ni si d’autres options existent. |
| `warning-list` — avertissement et liste | Aucune faiblesse reproduite; règle conservée. | Avertissement suivi d’erreurs / avertissement informatif seul. | Nombre et noms de catégories restent lexicalement limités. |
| `suspense-reversal` — rupture inquiétante | La détection dépendait d’une tournure unique. Ajout de variantes en deux phrases reliant un état normal à une difficulté ou un risque. | Plusieurs marqueurs de rupture / événement simplement daté. | Les états initiaux et termes de difficulté sont encore bornés. |
| `accusatory-causal-frame` — désignation d’un coupable | Aucune faiblesse reproduite; règle conservée. | « Coupable idéal » explicite / recherche neutre de causes. | Ne vérifie ni attribution causale ni exactitude. |
| `scale-then-challenge` — chiffres puis mise en doute | Aucune faiblesse reproduite; règle conservée. | Quantités suivies d’une question critique / chiffres avec résultats descriptifs. | Fenêtre de trois phrases et lexique interrogatif limité. |
| `worsening-reversal` — aggravation possible | Aucune faiblesse reproduite; règle conservée. | Solution écartée puis aggravation / prise en charge suivante. | Verbes de résolution et d’aggravation explicitement listés. |
| `contrastive-reframing` — antithèse de regard | La règle comparait les verbes, mais n’exigeait pas des objets différents. Elle vérifie désormais que les objets textuels diffèrent. | Regard sur deux objets / répétition du même objet. | Deux objets lexiquement différents peuvent désigner la même chose en contexte. |
| `nuance-counterclaim` — contre-discours nuancé | Aucune faiblesse reproduite; règle conservée. | Thèse attribuée à un discours courant puis nuancée / nuance descriptive isolée. | Les marqueurs de discours courant sont limités. |

Les défauts corrigés sont ceux reproduits par les cas cités; les autres règles sont maintenues sans prétendre qu’elles reconnaissent toutes leurs paraphrases. Les références à une autorité, les métaphores, la peur, la causalité et les intentions restent des limites de l’approche à règles plutôt que des conclusions du moteur.
