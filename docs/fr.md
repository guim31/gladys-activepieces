# Activepieces

[Activepieces](https://www.activepieces.com/) est un outil d'automatisation
open source que l'on peut héberger soi-même : des flux faits d'un déclencheur
et d'étapes récupèrent des données, appellent des services, envoient des
messages. Cette intégration amène vos flux Activepieces dans Gladys : chaque
flux devient un appareil avec son état (activé ou non, dernière exécution
réussie ou en échec, échecs des dernières 24 heures), les scènes peuvent
**lancer un flux** par son webhook et utiliser sa réponse, réagir quand
**n'importe quelle** exécution échoue ou qu'un flux est désactivé, et un widget
de tableau de bord liste d'abord les flux en échec.

Testée contre un vrai Activepieces 0.82 auto-hébergé (Docker, édition
communautaire) ; pas sur Activepieces Cloud : vos retours sont les bienvenus
sur [les issues](https://github.com/guim31/gladys-activepieces/issues).

## Ce qu'il faut

- Gladys Assistant 5.1.0 ou plus récent.
- Activepieces, auto-hébergé, joignable depuis la machine de Gladys.
- L'e-mail et le mot de passe d'un utilisateur Activepieces. L'édition
  communautaire n'a **pas de clé d'API** (elles sont réservées aux éditions
  payantes) : l'intégration se connecte donc comme l'interface web. Créez si
  possible un utilisateur dédié : Gladys voit les flux de son projet.

À chaque actualisation (une minute par défaut), l'intégration envoie quatre
requêtes à Activepieces, quelques-unes de plus la première fois, et se
reconnecte une fois par semaine (la session dure 7 jours). L'édition
communautaire ne limite pas le débit de son API.

## Mise en route

### 1. Préparer Activepieces

Notez l'adresse avec laquelle vous ouvrez Activepieces (port 8080 avec le
fichier docker-compose officiel), et l'e-mail et le mot de passe de
l'utilisateur dont Gladys doit suivre les flux. Connexion par Google ou un
autre fournisseur seulement : donnez d'abord un mot de passe à cet utilisateur.

### 2. Configurer l'intégration

Dans Gladys, ouvrez la configuration de l'intégration Activepieces :

- **Adresse d'Activepieces** : par exemple `http://192.168.1.2:8080`. Une
  adresse IP seule reçoit le port 8080. Une URL copiée depuis le navigateur
  fonctionne aussi.
- **E-mail** et **Mot de passe** : ceux de l'utilisateur de l'étape 1.
- **Projet (facultatif)** : vide, le projet de l'utilisateur. Sinon
  l'identifiant du projet, ou l'adresse d'une de ses pages copiée depuis le
  navigateur.
- **Intervalle d'actualisation** : de 30 secondes à 5 minutes.
- **Autoriser l'activation des flux depuis Gladys** : désactivé par défaut,
  voir plus bas.
- **Langue des noms** : langue des noms des fonctionnalités, des états et des
  résultats de scène.

Cliquez sur **Tester la connexion** : elle affiche la version, les flux, ceux
qui sont activés et les échecs des dernières 24 heures.

### 3. Ajouter les flux

Ouvrez l'onglet **Découverte** de l'intégration et ajoutez les flux à suivre,
et l'appareil **Activepieces** si vous voulez les chiffres de toute l'instance.
Rien n'est ajouté à votre place. Les déclencheurs de scène fonctionnent pour
tous les flux, ajoutés ou non.

## Les appareils

Chaque flux donne un appareil :

| Fonctionnalité                 | Valeur                                                       |
| ------------------------------ | ------------------------------------------------------------ |
| Activé                         | le flux est activé ou non                                    |
| Dernière exécution             | Réussi, En échec, Délai dépassé, En cours, En pause…         |
| Fonctionne                     | Non quand la dernière exécution terminée a échoué, Oui sinon |
| Échecs sur 24 h                | exécutions en échec sur les dernières 24 heures              |
| Dernier lancement              | début de la dernière exécution, jour/mois heures:minutes     |
| Durée de la dernière exécution | de la dernière exécution terminée, en secondes               |

Une exécution en cours garde le verdict de la précédente dans **Fonctionne** :
un flux en échec qui tourne de nouveau ne semble pas réparé pendant quelques
secondes.

L'interrupteur **Activé** ne fait qu'afficher l'état par défaut. Avec
**Autoriser l'activation des flux depuis Gladys**, il active et désactive le
flux : cliquez sur **Mettre à jour** sur les appareils de l'onglet Découverte
après avoir changé l'option. Un flux jamais publié ne peut pas être activé.

L'appareil **Activepieces** donne **Joignable** (Non tant qu'Activepieces ne
répond pas), la **Version**, les **Flux activés**, les **Échecs sur 24 h** et
les **Flux au total**.

## Tableau de bord

Le widget **Flux Activepieces** affiche trois tuiles (flux activés, échecs sur
24 heures, exécutions en cours), puis une ligne par flux : ceux en échec
d'abord, puis ceux en cours, puis les autres, avec l'état de la dernière
exécution, son heure de début et les échecs du jour. Par défaut il liste les
flux activés ; choisissez-en d'autres dans ses réglages (appareils ajoutés à
Gladys, affichés avec le nom que vous leur avez donné). Le bouton
**Actualiser** relit Activepieces ; un réglage le masque.

## Scènes

### Déclencheurs

- **Une exécution de flux échoue** : une exécution se termine en échec, en
  délai dépassé, en mémoire dépassée ou en erreur interne. Filtre : les flux
  (vide : tous). Informations transmises : nom du flux, message d'erreur, étape
  en échec, statut de l'exécution, lien vers l'exécution dans Activepieces.
- **Un flux est désactivé** : un flux activé devient désactivé, à la main, par
  Activepieces ou par une scène : son déclencheur ne tourne plus. Filtre : les
  flux. Information transmise : nom du flux.

La première lecture ne fait que noter ce qui s'est déjà passé : rien n'est
annoncé pour le passé. Un échec survenu pendant un redémarrage de Gladys ou de
l'intégration est annoncé une fois, à la lecture suivante. Pour « Activepieces
ne répond plus », utilisez la fonctionnalité **Joignable** de l'appareil
Activepieces dans une scène.

### Actions

- **Lancer un flux Activepieces** : le flux doit commencer par le déclencheur
  **Catch Webhook** (authentification : None) et être publié. Dans la scène,
  choisissez le flux (un appareil ajouté à Gladys), ou collez l'URL affichée
  par le déclencheur (`…/api/v1/webhooks/…`) pour un flux non ajouté. Corps :
  du JSON comme `{"piece": "salon"}`, ou un texte envoyé sous la forme
  `{"text": "…"}` ; les valeurs de la scène peuvent y être insérées, et le flux
  les lit dans `trigger.body`. Sans **Attendre la réponse**, Activepieces
  répond tout de suite et l'exécution continue seule. Avec, le flux doit finir
  par une étape **Return Response** (pièce Webhook), en 30 secondes au plus.
  Résultats : réponse réussie, statut HTTP (404 : le flux est désactivé ou non
  publié ; 0 : pas de réponse à temps), message répondu (le champ `message` ou
  `text` de la réponse), réponse complète.
- **État d'un flux** : activé ou non, dernière exécution en échec ou non, état,
  échecs sur 24 h, dernier lancement, durée, dernière erreur et une phrase
  toute faite, pour les actions suivantes (un message, une condition).
- **Activer un flux** / **Désactiver un flux** : par exemple un flux qui ne doit
  tourner que pendant les vacances. Ces actions marchent quelle que soit
  l'option de l'interrupteur.

### Idées de scènes

- **Une exécution de flux échoue** → envoyer un message : « Activepieces :
  {flux} a échoué à l'étape {étape} : {erreur} » avec le lien vers
  l'exécution.
- Un bouton du tableau de bord ou « Je pars » → **Lancer un flux
  Activepieces** avec `{"utilisateur": "…"}` et **Attendre la réponse**, puis
  envoyer le **Message répondu** par le flux.
- **Un flux est désactivé** → envoyer un message : un flux dont vous dépendez
  s'est arrêté.
- Chaque matin → **État d'un flux** « Sauvegarde nocturne » → ne continuer que
  si « Dernière exécution en échec » est vrai → envoyer la **Phrase**.

## Dépannage

- **E-mail ou mot de passe refusé** : vérifiez-les sur la page de connexion
  d'Activepieces. Un utilisateur créé par connexion Google n'a pas de mot de
  passe.
- **Refusé par Activepieces : cet utilisateur n'en a pas le droit** :
  l'utilisateur n'est pas membre du projet, ou son rôle ne permet pas de
  modifier les flux.
- **Projet introuvable** : vérifiez l'identifiant, ou laissez le champ vide.
- **Aucune API Activepieces à cette adresse** : vérifiez l'adresse (port 8080
  avec le fichier docker-compose officiel). Derrière un proxy inverse avec un
  sous-chemin, mettez le sous-chemin dans l'adresse.
- **L'adresse redirige** : saisissez l'adresse en `https://`.
- **Certificat refusé** : un certificat auto-signé n'est pas accepté ; utilisez
  l'adresse en `http://` sur le réseau local.
- **Le webhook répond 404** : le flux est désactivé, n'a jamais été publié, ou
  son déclencheur n'est pas Catch Webhook. L'URL de test (`/draft`) n'est pas
  acceptée.
- **Attendre la réponse donne le statut 0 ou une réponse vide** : ajoutez une
  étape Return Response à la fin du flux.
- Logs : dans Gladys, la page de l'intégration affiche les logs de son
  conteneur ; `LOG_LEVEL=debug` détaille chaque lecture.

## Limites

- Développée et testée contre Activepieces 0.82 en Docker, sans Activepieces
  Cloud ni les éditions payantes : vos retours sont les bienvenus.
- Un projet par configuration ; le mot de passe de l'utilisateur est conservé
  par Gladys comme les autres secrets des intégrations.
- Les clés d'API des éditions payantes ne sont pas encore prises en charge.
- Les flux ne sont ni créés ni modifiés depuis Gladys.
- Au plus 500 exécutions en échec des dernières 24 heures sont lues par
  lecture, et au plus 10 échecs sont annoncés par lecture.
- Les webhooks protégés par une authentification basic ou par en-tête ne sont
  pas pris en charge.
- Activepieces garde les exécutions 30 jours par défaut
  (`AP_EXECUTION_DATA_RETENTION_DAYS`).
