# Tester Mon Mur sur un téléphone Android

## Chargement temporaire depuis cet ordinateur

Cette méthode charge la version de travail directement dans Firefox Android au moyen d’ADB. Le code source doit rester sur l’ordinateur; l’extension de test est temporaire et sera retirée à la fermeture de Firefox.

1. Installez Firefox Nightly sur le téléphone, activez les options développeur et le débogage USB Android, puis branchez-le à l’ordinateur.
2. Vérifiez que `adb devices` affiche le téléphone avec l’état `device` et acceptez la demande de débogage affichée sur le téléphone.
3. Depuis ce répertoire du projet, lancez :

   ```sh
   ./scripts/run-android-test.sh
   ```

   Si plusieurs appareils sont connectés, donnez l’identifiant ADB :

   ```sh
   ./scripts/run-android-test.sh IDENTIFIANT_ADB
   ```

   Pour Firefox Beta ou Firefox stable, passez le nom de paquet correspondant en deuxième argument : `org.mozilla.firefox_beta` ou `org.mozilla.firefox`.

`web-ext` installe l’extension temporairement dans le profil Firefox Android. Gardez le processus ouvert pendant le test; les changements du code source sont rechargés automatiquement.

## Fichier XPI

Lancez `./scripts/build-android-test.sh` pour produire `web-ext-artifacts/mon-mur-5.0.0-test-unsigned.xpi` et l’archive ZIP utilisée pour AMO. Le XPI de test est non signé : Firefox Android standard ne l’accepte pas comme installation durable. La signature Mozilla pour une installation depuis un fichier ou la distribution AMO nécessite une soumission AMO et une signature distincte; cette étape n’est pas effectuée ici.

Le manifeste garde le même identifiant d’extension pour qu’une mise à jour signée ultérieure conserve les données du profil Firefox.
