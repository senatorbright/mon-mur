# Mon Mur 5.14.0

> Projet personnel, prototype fonctionnel et cahier des charges vivant, réalisé à 100 % par « vibe coding ». Il répondait aux besoins de son auteur; il est partagé pour être lu, repris et amélioré par des personnes qui souhaitent contribuer. Il n’y a pas d’engagement de maintenance ni de feuille de route de nouvelles fonctions. Le code Mon Mur est distribué sous licence GNU GPL v3; les ressources tierces gardent leurs licences et réserves propres, détaillées dans [les avis](THIRD_PARTY_NOTICES.md) et [l’inventaire des ressources](docs/amo/ASSET-LICENSES.fr.md).

Mon Mur est un agrégateur personnel et autonome pour Firefox. Il rassemble les publications de vos sites et sources suivis dans des murs thématiques afin de repérer les nouveautés, les parcourir et les lire au même endroit.

Il n’y a ni compte Mon Mur ni serveur Mon Mur : les murs, réglages et contenus conservés restent dans le profil Firefox. L’extension ne collecte pas de données en secret. Certaines recherches et certains enrichissements facultatifs transmettent les requêtes nécessaires à des services tiers, uniquement après consentement; leur usage est décrit dans **Préférences → Données et accès**.

Suivez des flux RSS/Atom et des pages compatibles, puis classez les contenus par sujet : actualités locales, agenda, vidéos et autres thèmes. Marquez un contenu comme lu, gardez-le « À plus tard » ou retrouvez-le dans vos J’aime. Les articles peuvent s’ouvrir dans le lecteur intégré et les vidéos se lire dans le mur lorsque la source le permet. L’affichage des articles extraits retire souvent les éléments périphériques des sites; Mon Mur n’est toutefois pas un bloqueur de publicités et les lecteurs vidéo peuvent encore en afficher.

Des murs automatiques peuvent repérer des vidéos, des publications de réseaux sociaux et des PDF à partir de vos mots-clés prioritaires. Les filtres permettent aussi d’exclure des termes ou catégories, de masquer certains visages expressifs sur les vignettes et de signaler les indices d’affiliation ou de persuasion dans les contenus.

Voir la [galerie de captures d’écran de Mon Mur 5.10.0](docs/screenshots/README.md); elle illustre une version antérieure.

Extension Firefox expérimentale, réalisée par « vibe coding ». Les autorisations de sites sont gérées par Firefox et peuvent être contrôlées dans **Préférences → Données et accès**.


## Installer la version publiée

La version source est 5.14.0. Téléchargez le fichier `mon-mur-5.14.0.xpi` depuis la [release GitHub](https://github.com/senatorbright/mon-mur/releases). Le XPI est non signé.

### Installation durable sur ordinateur

Choisissez l’un de ces navigateurs pour garder l’extension installée après fermeture et redémarrage :

- **Waterfox** : ouvrez `about:addons`, ouvrez le menu outils et choisissez **Installer un module depuis un fichier…**. Sélectionnez le XPI téléchargé et confirmez l’installation. Waterfox accepte les extensions non signées; consultez l’aide [Extensions non signées dans Waterfox](https://www.waterfox.com/support/unsigned-addons/).
- **Firefox Nightly pour ordinateur** : dans `about:config`, réglez `xpinstall.signatures.required` sur `false`. Ouvrez ensuite `about:addons`, choisissez **Installer un module depuis un fichier…** dans le menu engrenage, puis sélectionnez le XPI. La préférence doit rester désactivée tant que l’extension non signée est installée. Mozilla documente cette option pour Nightly dans son [guide sur la signature des modules](https://support.mozilla.org/en-US/kb/add-on-signing-in-firefox).

Le Firefox standard ne permet pas d’installer durablement ce XPI non signé. Pour l’essayer sans l’installer de manière permanente, suivez la procédure temporaire plus bas dans ce README.

### Installation durable sur smartphone Android avec Firefox Nightly

Le XPI non signé de cette release peut être installé dans Firefox Nightly Android en désactivant la vérification des signatures. Ce réglage réduit la protection contre les extensions modifiées : installez uniquement le fichier téléchargé depuis la release officielle Mon Mur.

1. Téléchargez `mon-mur-5.14.0.xpi` sur le téléphone.
2. Dans Firefox Nightly, ouvrez `about:config`. Si cette adresse n’est pas disponible, ouvrez `chrome://geckoview/content/config.xhtml`.
3. Recherchez `xpinstall.signatures.required` et réglez cette préférence booléenne sur `false`.
4. Ouvrez **Paramètres → À propos de Firefox Nightly**, puis touchez le logo Firefox Nightly cinq fois pour activer le menu de débogage.
5. Revenez dans **Paramètres → Installer une extension depuis un fichier**, choisissez le XPI téléchargé et confirmez.

Ce réglage est propre au profil Nightly et doit rester désactivé tant que l’extension non signée est installée. Après avoir retiré l’extension, vous pouvez le remettre à `true`. Mozilla décrit les exigences de signature dans son [guide de distribution](https://extensionworkshop.com/documentation/publish/install-self-distributed/).

Pour tester dès maintenant le code non signé sur un téléphone, utilisez la méthode développeur temporaire avec ADB décrite dans [Tester Mon Mur sur un téléphone Android](docs/TESTER-ANDROID.fr.md). Mozilla documente les exigences de signature et ces étapes d’installation dans son [guide de distribution des extensions](https://extensionworkshop.com/documentation/publish/install-self-distributed/).

### Tester temporairement dans Firefox standard sur ordinateur

Le chargement temporaire sert à essayer le code sans installer le XPI. Dans Firefox, ouvrez `about:debugging#/runtime/this-firefox`, cliquez sur **Charger un module complémentaire temporaire…** et sélectionnez `manifest.json` à la racine du dépôt. L’extension est retirée à la fermeture ou au redémarrage de Firefox; il faut alors la charger à nouveau. Pour obtenir les instructions de développement et continuer après une modification, consultez [Charger la version de travail dans Firefox](docs/GITHUB-TESTER.fr.md).

Dans l’espace **Découverte**, lancez une recherche DuckDuckGo manuelle par mots-clés ou sujet prioritaire. Les nouveaux flux RSS/Atom vérifiés sont gardés dans la liste **À examiner** entre les recherches et les redémarrages. **Visiter** ouvre le site sans modifier son état; **Marquer comme traitée** mémorise durablement la décision. L’ajout d’une source à un mur la marque aussi comme traitée. La section **Sources traitées** conserve l’historique et permet de rendre un site éligible à une recherche ultérieure. Les doublons sont regroupés par domaine éditorial, en assimilant `www.exemple.fr` et `exemple.fr` tout en gardant les sous-domaines distincts. Firefox demande l’accès à DuckDuckGo et aux domaines qui doivent être vérifiés. Les recherches sont manuelles et locales au navigateur. Les sources traitées et découvertes en attente sont incluses dans les sauvegardes JSON v9; les refus des anciennes sauvegardes sont importés comme sources traitées.

## Multi-murs

- Deux murs sont créés lors de la première migration : « Actus » et « Info locale ». Les sources et préférences historiques sont conservées dans « Actus »; les articles IndexedDB ne sont pas déplacés ni retéléchargés.
- Jusqu’à dix murs personnalisés peuvent être créés, renommés, supprimés et réordonnés depuis Préférences. Le dernier mur sélectionné est mémorisé.
- Un clic molette sur le nom d’un mur l’ouvre dans un nouvel onglet Firefox, sans changer le mur de l’onglet actuel.
- Une source peut alimenter plusieurs murs. Son flux n’est collecté qu’une fois par cycle et ses articles restent stockés une seule fois.
- Les filtres, priorités, le classement et la durée de conservation sont propres à chaque mur. La durée par défaut des nouveaux murs est de 3 jours; la durée globale antérieure est reprise pour les murs déjà présents.
- Dans le panneau de l’extension, « Suivre cette page » permet de choisir un ou plusieurs murs et d’en créer un sans quitter le panneau. Une source suivie peut voir ses associations modifiées.
- La sauvegarde des préférences contient les murs créés et leur ordre, leurs filtres et priorités, les durées de conservation et les sources avec leurs associations aux murs. Les articles stockés ne sont pas inclus. Une ancienne sauvegarde sans sources laisse la liste des sources actuelle intacte.

## Lecture sur petit écran et taille du texte

Sur smartphone, la navigation latérale se replie pour laisser toute la largeur aux vignettes. Le bouton flottant l’ouvre, un glissement depuis le bord gauche la fait réapparaître, et un toucher hors du menu le referme. Les commandes des cartes sont adaptées aux écrans tactiles. Le réglage **A 100 % à A 150 %** agrandit les titres, résumés et articles sur ordinateur et smartphone; le choix est mémorisé.

## Fonctionnement

- Les résumés affichés sur les cartes du mur sont limités à 300 caractères avant l’ouverture de l’article; la coupure se fait de préférence à la fin d’un mot.

- **Filtres intelligents → Visages dans les vignettes** active ou désactive globalement le filtre et propose le floutage des visages en gros plan ou le masquage d’une carte lorsqu’un visage est détecté. Dans **Préférences → Murs → Mes murs**, la colonne **Visages** autorise son application sur chaque mur. Le filtre est autorisé par défaut sur **Vidéos auto** et désactivé sur les murs personnalisés jusqu’à activation dans leur ligne. Un seuil de confiance réglable contrôle la sensibilité : le diminuer repère davantage de visages, au prix de plus de faux positifs. La détection BlazeFace tourne localement dans Firefox. À l’activation, Firefox demande l’autorisation de lire les images des sites (y compris les CDN); les images et détections restent locales.
- **Filtres intelligents → Affiliation** propose un contrôle général Actif/Inactif qui affiche les avertissements, cocardes et détails des affiliations, ainsi qu’une option pour masquer les articles et vidéos avec au moins une affiliation confirmée. Désactiver le module suspend temporairement ses effets sans effacer les préférences internes. Le masquage ne supprime aucune donnée; les liens suspects restent visibles. Les préférences sont conservées dans Firefox et incluses dans les sauvegardes. **Filtres intelligents → Langues des contenus** permet aussi de choisir une langue cible par défaut et d’afficher une action « Traduire avec Firefox » sur les articles. Cette action apparaît uniquement lorsque l’article est déplié. L’action ouvre une vue de lecture Mon Mur avec la langue de l’article déclarée dès le chargement. Firefox 139+ prend en charge la traduction native de pages d’extension; utilisez alors son icône ou son menu « Traduire la page ». La traduction est locale et l’action n’ouvre pas le site source. Le choix de langue de Mon Mur ne remplace pas les préférences de traduction propres à Firefox. Ces deux réglages sont inclus dans les sauvegardes JSON.

- RSS/Atom est préféré. Un flux est enregistré seulement après validation XML et récupération d’au moins un article.
- Sans flux valide, l’extraction de secours retient les liens présents dans des éléments `<article>`, les données JSON-LD `Article`/`NewsArticle` et certains liens datés dont la structure URL est explicite. Les pages qui n’exposent pas ces structures ne sont pas enregistrées comme sources opérationnelles.
- Les pages d’agenda HTML sont également prises en charge : les cartes récupèrent leur titre, leur extrait, leur image et leur date. Les détails d’une fiche événement (date, horaires, lieu et description) sont chargés à l’affichage et conservés localement.
- Les articles sont stockés dans IndexedDB; sources et préférences utilisent `browser.storage.local`.
- Un réveil périodique actualise les sources actives selon la fréquence globale choisie dans Préférences (15 minutes par défaut, jusqu’à une fois par jour). Une collecte est aussi lancée au démarrage du navigateur et à l’ouverture du mur si la dernière collecte remonte à plus longtemps que cette fréquence. Firefox peut retarder les alarmes en arrière-plan; elles sont recréées au démarrage du navigateur.
- Chaque actualisation relit le flux disponible. La date affichée dans Sources correspond à la dernière collecte réussie; une erreur ne l’avance pas. Préférences affiche aussi les dates de la dernière tentative et de sa fin. Pour une URL inconnue, une date de publication fiable doit être postérieure à cette collecte; les URL déjà rencontrées sont mémorisées pendant 7 jours après leur dernière rencontre, y compris après suppression puis réajout de la source. Préférences permet d’exporter cette mémoire en CSV avec l’URL, la source et la date de première rencontre. Sans date fiable, l’URL sert seule à la déduplication pendant ces 7 jours.
- La barre latérale indique le nombre d’articles à lire dans l’ensemble des murs, les sources en erreur, les J’aime, les articles « À consulter plus tard » et les articles archivés.
- Les onglets des murs affichent le nombre d’articles encore à consulter, mis à jour à chaque actualisation. Les deux murs automatiques sont séparés visuellement des murs personnalisés et signalés « AUTO ». « À consulter plus tard » regroupe les articles et vidéos enregistrés; « Archivés » contient ceux déjà marqués comme lus.
- Le mur charge 20 cartes par lot, sans requête réseau au défilement. L’actualisation manuelle collecte de nouveaux articles et propose un bouton pour afficher les nouveaux articles sans interrompre la lecture.
- **Remplir mon mur** récupère les cinq publications datées les plus récentes de chaque source associée. Une source ajoutée à un mur est remplie dès son premier ajout. Cette action peut réafficher des publications déjà enregistrées et réinitialise leur état « lu »; les filtres de mots-clés, catégories, affiliation et langue restent appliqués.
- Chaque carte peut être dépliée directement dans le mur pour lire l’article complet. Le contenu du flux est utilisé si disponible, sinon la page originale est analysée avec Mozilla Readability. Le HTML est filtré avant affichage et le résultat est mis en cache dans IndexedDB à la première ouverture. Les vidéos HTML5 et lecteurs intégrés reconnus sont proposés dans l’article; le lecteur distant ne se charge qu’après un clic et s’arrête quand la carte est repliée. Une seule vidéo peut jouer à la fois pour un même mur; démarrer une autre arrête le lecteur précédent, y compris entre onglets.
- Pour le lecteur YouTube, Firefox transmet l’URL réelle `moz-extension://…/wall.html` comme `Referer` au premier chargement de l’iframe. Cette modification est limitée aux iframes `/embed/` de YouTube créées depuis le mur.
- Les actions « Lu » et « À consulter plus tard » retirent l’article du mur de sources et l’affichent dans les murs automatiques correspondants. La conservation des murs « Archivés » et « À consulter plus tard » se règle séparément dans les préférences; la date d’archivage ou d’enregistrement et la durée correspondante sont affichées sur les cartes. Chaque délai part de la dernière action explicite; consulter l’article ne le renouvelle pas. Un instantané des champs utiles à l’affichage est conservé avec l’état pour que l’article reste visible même s’il disparaît du flux ou de la base d’articles.
- L’ordre chronologique est strict par date, avec la date de découverte en secours. Le mode priorités regroupe par niveau puis trie chaque groupe par date.
- Les exclusions par catégorie et mots entiers / expressions sont appliquées à l’affichage, sans effacer les données. Les comparaisons de mots ignorent casse et accents. Les mots-clés exclus configurés dans les murs s’appliquent aussi à tous les murs automatiques.
- La conservation des articles de chaque mur personnalisé, des articles archivés et des articles « À consulter plus tard » se règle séparément de 1 à 365 jours (3 jours pour un nouveau mur, 2 jours pour les archives et 90 jours pour « À consulter plus tard »). Les murs existants gardent leur ancienne durée. La rétention des murs est appliquée par mur à l’affichage et au stockage partagé pendant les actualisations.
- À l’expiration de leur durée de conservation, les articles archivés ou enregistrés plus tard sont supprimés; l’historique par source empêche leur réimportation depuis un flux qui les conserve encore.

## Mur « Vidéos auto »

Le mur **Vidéos auto** recherche sur YouTube, dans l’index public PeerTube, CrowdBunker et Rumble (activables séparément dans les préférences) les termes déjà présents dans **Préférences → Prioriser** (union des règles de tous les murs). La recherche compare le titre avec les règles de casse, accents et mots entiers de l’application. PeerTube est interrogé avec le filtre `languageOneOf=fr` et les résultats sans langue française déclarée sont écartés. Une vidéo correspondant à plusieurs termes est enregistrée une seule fois; sa carte indique sa plateforme et le mot-clé de découverte.

À l’ouverture d’une vidéo, l’extension affiche l’extrait de description présent dans la recherche YouTube ou la description des API PeerTube et CrowdBunker, avec ses retours à la ligne, puis la plateforme, la chaîne, la date de publication et le mot-clé de découverte. Les nouvelles collectes complètent aussi les résumés des vidéos déjà enregistrées.

Les vidéos PeerTube sont intégrées via l’URL officielle `/videos/embed/…`; un lien vers l’instance reste disponible si elle refuse l’intégration. Rumble utilise son lecteur intégré officiel. CrowdBunker utilise sa route `/embed/{uid}` avec un lien de secours vers la page d’origine. Les URL de lecture PeerTube `/videos/watch/…` ne sont pas utilisables en iframe sur certaines instances.

La collecte automatique conserve l’alarme de cinq minutes. Sa date de référence est persistée séparément de la dernière collecte réussie et des identifiants déjà vus. La migration d’essai positionne une fois la référence au `2026-10-21T00:00:00+02:00`; les rafraîchissements ultérieurs ne la réinitialisent pas. Les échecs n’avancent pas cette référence. YouTube expose une date relative arrondie et un résultat HTML susceptible de changer. L’index PeerTube ne connaît pas nécessairement toutes les vidéos du réseau et peut renvoyer des résultats incomplets. CrowdBunker utilise son endpoint de recherche public; Rumble nécessite une page Firefox normale et peut limiter les résultats à cinq pages par mot-clé.

## Limites connues

- L’extraction dépend du contenu exposé par le flux ou la page. Les erreurs réseau, les protections anti-robot, les pages nécessitant une connexion ou les domaines dont Firefox refuse l’accès peuvent empêcher la lecture intégrée; un message discret et le lien original restent proposés. Aucun paywall n’est contourné.

## Murs cinéma et séries (prototype)

Dans **Préférences → Gérer les murs**, le type est réglé sur **Automatique** par défaut. Le nom du mur est comparé comme une suite de mots, sans tenir compte de la casse ni des accents (film(s), cinéma/ciné, movie(s), série(s), series, TV shows, streaming, VOD/SVOD). **Cinéma / Séries** force l’enrichissement; **Standard** le désactive même si le nom contient un de ces termes. Les mots présents dans les articles ne changent jamais le type du mur.

À la collecte du flux, les mots-clés du titre ou de la description de l’item, des catégories, du contenu, ainsi que du titre et de la description du flux signalent le contenu cinéma. Pour ces items (ou ceux d’un mur forcé en mode Cinéma), l’extension lit la page liée pour obtenir le titre, l’année et les métadonnées initiales. À l’ouverture d’une fiche, elle recherche ensuite le film sur AlloCiné et affiche une fiche structurée (synopsis, affiche, genres, réalisation, acteurs et note) à la place du texte de la page source. Les signes de ponctuation sont ignorés pour comparer les titres; l’année explicitement présente dans l’annonce, puis sa date de publication, servent à départager les homonymes. Si AlloCiné ne trouve pas de correspondance fiable, Wikipédia est consultée en français puis en anglais. Si aucune base ne trouve le titre, les métadonnées disponibles sur la page d’origine sont affichées. Une image reconnue comme générique ne bloque pas la recherche d’une vraie affiche. Le titre de la carte conserve le lien vers la page d’origine. Le réglage Standard désactive l’enrichissement. Les affiches cinéma utilisent `object-fit: contain` pour montrer toute l’image portrait. Firefox demande l’autorisation d’accès aux bases cinéma à la première ouverture d’une fiche.

### Vérification du prototype

- Vérification réseau ponctuelle : `https://www.allocine.fr/rechercher/?q=Dune…` répond HTTP 200 et fournit le résultat « Dune : Deuxième Partie » (2024). Le chemin est présent dans une classe encodée par le site et a été décodé pendant le test.
- La fiche publique `https://www.allocine.fr/film/fichefilm_gen_cfilm=278742.html` répond HTTP 200 et fournit un JSON-LD `Movie` avec titre original, synopsis, affiche, genres, réalisateur et acteurs. L’ancienne route `/recherche/` répond HTTP 410 et n’est pas utilisée.
- La détection a été vérifiée sur « Films et Séries », « Streaming VOD », « CINÉ », « Movies » et « Séries TV »; « Actualités », « Mes nouvelles », « Filmmaker » et « Mémoires » sont rejetés. Le forçage manuel vers Cinéma et Standard a aussi été vérifié.
- Le parseur de flux a été vérifié dans Firefox sur des exemples RSS `enclosure`, Media RSS `content medium="image"` et Atom `link rel="enclosure"`; les trois URL d’affiche sont récupérées.
- L’item RSS fourni (« Sacrifice ») contient une catégorie `film-streaming`. Vérification HTTP de son URL : le titre « Film Sacrifice (2026) en streaming complet », un synopsis et l’image TMDB `300 × 450` sont présents; l’extraction générique de la page peut donc construire la carte avant affichage.
- Des données déjà stockées dans Firefox montraient trois URL de miroirs pour ce même film (`fs26.lol`, `french-stream.net`, `fs20.lol`), toutes avec `newsid=15138419`. L’affichage regroupe désormais ces variantes dans les murs cinéma sans supprimer les entrées stockées; il privilégie la fiche issue de la page liée lorsqu’elle contient une image et un synopsis.
- Sur l’ancienne carte vérifiée, la phrase affichée provenait du synopsis JSON-LD de la fiche AlloCiné; elle n’était pas dans le RSS (description vide) et différait de la meta-description de la page source. Les deux images en cache ont été ouvertes : ce sont des affiches valides (AlloCiné et TMDb), pas des vignettes placeholder. La nouvelle règle de sélection choisit l’affiche de la page source pour les variantes déjà enrichies.
- Les signaux de catégories ont été vérifiés (« film-streaming » reconnu; Actualités/Filmmaker rejetés). La syntaxe de tous les fichiers JavaScript a été vérifiée avec `node --check`; le manifeste a été validé comme JSON.
- L’onglet Mon Mur est ouvert dans le profil Firefox actif, mais le contexte d’automatisation ne peut pas lire son DOM ni confirmer le dialogue d’autorisation. Le parcours d’enrichissement complet sur cet item RSS dans l’interface reste à valider après rechargement de l’extension.

Le modèle de détection et le runtime MediaPipe sont embarqués localement. Leurs avis de licence figurent dans [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Murs automatiques

Dans **Préférences → Murs → Murs automatiques**, les murs **Vidéos auto** et **Réseaux Sociaux Auto** peuvent être activés indépendamment. Vidéos auto est activé par défaut pour conserver le comportement des installations existantes; Réseaux Sociaux Auto est désactivé par défaut. YouTube, PeerTube, CrowdBunker et Rumble se règlent séparément. CrowdBunker et Rumble ne sont pas activés par défaut et Firefox demande leur autorisation de domaine au premier choix. Un mur désactivé est masqué et sa collecte s’arrête, ses publications déjà stockées restent conservées.

Les réglages sont présentés dans deux cartes compactes. Chaque mur a son propre interrupteur et ses boutons de sources. Les choix restent mémorisés lorsque le mur est désactivé; si le mur est actif sans source cochée, un message l’indique.

Le mur **Réseaux Sociaux Auto** (onglet **RS Auto**) regroupe Bluesky et LinkedIn. Bluesky recherche séparément chaque sujet prioritaire défini dans les filtres sémantiques de vos murs, via son AppView public et sans compte. Le filtre « Français uniquement » est désactivé par défaut et peut être activé dans les préférences Bluesky; lorsqu’il est actif, les publications déclarées dans une autre langue sont écartées, tandis que celles sans langue déclarée restent possibles. Le réglage **Uniquement avec image** s’applique à Bluesky et est désactivé par défaut afin de conserver les publications textuelles. Les publications Bluesky sont dédupliquées par AT URI et triées par priorité puis date. Les requêtes peuvent être limitées ou incomplètes; les erreurs réseau ne suppriment pas les données déjà stockées.

LinkedIn recherche les mots-clés prioritaires via les flux RSS de Google Actualités. Comme Google peut renvoyer des correspondances approximatives, Mon Mur vérifie aussi que le mot-clé apparaît comme un mot entier dans le titre RSS avant de conserver ou d’étiqueter le résultat. Les tags des cartes LinkedIn affichent les mots-clés ainsi reconnus. Le RSS ne fournit ni le corps complet ni d’image exploitable; le filtre « avec image » n’est donc pas proposé pour LinkedIn, car il masquerait tous les nouveaux résultats. Un mot-clé présent uniquement dans le corps peut ne pas être détecté. Au dépliage d’une carte sans permalien mémorisé, Mon Mur ouvre le résultat dans un onglet Firefox inactif, le masque avec `tabs.hide()`, puis ne suit que cet onglet pendant 90 secondes pour récupérer l’URL LinkedIn. L’onglet est fermé après réussite, échec, annulation ou expiration. Firefox peut afficher son avertissement natif lors du premier masquage. Si le masquage n’est pas permis, si Google demande un consentement ou si la navigation échoue, Mon Mur laisse les liens de secours disponibles et propose une nouvelle tentative. Les permaliens sont conservés localement. Les publications compatibles sont affichées par l’intégration officielle LinkedIn, qui peut fournir leur texte et leurs médias selon leur visibilité et les capacités de LinkedIn; la lecture des vidéos intégrées dépend de LinkedIn et n’est pas garantie. Les articles `/pulse/` gardent le lien d’origine et ne sont pas assimilés aux embeds de publications.

Le filtre des visages s’applique au mur social comme à **Vidéos auto** lorsque le filtre global est activé. Les publications déjà stockées mais désormais exclues par un filtre restent dans les données locales.

Si une publication Bluesky inclut un lien externe, développer sa carte récupère le lien depuis les métadonnées publiques du post si nécessaire, charge le contenu éditorial de la page liée et le met en cache localement. Firefox demande l’accès au domaine si celui-ci n’est pas déjà autorisé.

## Nouveautés de la version 5.14.0

- Extraction générique des dates de publication pour les pages HTML, y compris les heures et fuseaux affichés sur les articles lorsque la liste ne les fournit pas. Une date lue seulement dans l’URL reste un indice non confirmé.
- Réévaluation d’une URL non acquise lorsque sa date devient plus fiable, en conservant le seuil de la décision initiale.
- Enregistrement du premier motif de refus avec la date évaluée, le seuil appliqué et l’heure de décision; ces informations sont visibles dans l’historique des acquisitions et son export CSV.
- Diagnostics de collecte plus détaillés pour les erreurs de requête et les flux RSS, Atom et JSON Feed.

## Documents Internet Archive

Dans **Préférences → Murs → Murs automatiques**, **Documents PDF en français** alimente le mur automatique **PDF auto** avec les mots-clés prioritaires des murs. Seuls les PDF dont les métadonnées Internet Archive déclarent le français (`fr`, `fre`, `fra` ou `French`) sont gardés; les langues absentes ou différentes sont écartées. Les résultats sont triés par date d’ajout à Internet Archive; le collecteur traite jusqu’à huit mots-clés par actualisation, vérifie au plus cinq fiches de métadonnées par mot-clé et conserve jusqu’à trois PDF accessibles par terme. Il espace les recherches manuelles d’au moins une minute. Il exige aussi une correspondance dans le titre pour réduire les résultats hors sujet. Les entrées sont dédupliquées par identifiant Internet Archive et leurs dates de publication et d’archivage restent distinctes sur les cartes. Les PDF ne sont pas téléchargés ni analysés.

## Limites de cette version

Le projet reste expérimental. Les collectes dépendent des flux et des pages accessibles; le scraping depuis le navigateur peut être limité par les sites ou les autorisations Firefox. Le XPI construit localement est non signé et ne représente pas une validation Mozilla. Les essais manuels Firefox de cette publication restent nécessaires.

Le changelog cumulatif est disponible dans [`v5.14.0.txt`](v5.14.0.txt). Le code Mon Mur est sous GNU GPLv3 ([`LICENSE`](LICENSE)); les ressources tierces conservent leurs licences et l’icône Mon Mur et les pictogrammes génériques introduits en 5.6.0 sont également distribués sous GPLv3.
