# Pierre · Feuille · Ciseaux

Jeu minimaliste avec mode classique, mode **speedrun** et classement partagé.

## Modes

| Mode | Objectif |
|------|----------|
| **Classique** | Score libre contre l'IA |
| **Speedrun** | Enchaîner le maximum de **victoires d'affilée** sans aucune défaite. Une défaite termine l'essai. Les égalités ne comptent pas mais ne terminent pas la partie. |
| **En ligne** | Affrontez un ami avec un **code privé** (6 caractères). |

## En ligne

- **Casual** : match privé entre amis, sans impact sur le rang.
- **Classé** : progression par points (+35 victoire, −25 défaite). Rangs : **Non classé** → **Incompétant** → **Compétant** → **Connaisseur** → **Socrate**.

1. Mode **En ligne** → Casual ou Classé.
2. **Créer une partie** → partagez le code.
3. L'ami **Rejoint** avec le même code.
4. Premier à **3 manches** gagne la partie.

Nécessite `npm start` (WebSocket).

## Classement

- **Mes essais** : tous vos runs speedrun sur cet appareil (navigateur).
- **Tous les joueurs** : classement global partagé lorsque le serveur est lancé.

## Sons & paramètres

Placez dans le dossier `sounds/` :

- `win sound.mp3` — victoire
- `lose sound.mp3` — défaite
- `sounds/ambient/*.mp3` — ambiances (lecture aléatoire)

Listez les fichiers dans `sounds/ambient/tracks.json`, ou lancez `npm start` pour une détection automatique.

Le menu **⚙ Paramètres** règle le volume des ambiances, des effets sonores et EFB. Les réglages sont sauvegardés dans le navigateur.
## Difficultés IA

| Niveau | Comportement |
|--------|----------------|
| Facile | Aléatoire |
| Moyen | Anticipe votre coup favori récent |
| Difficile | S'adapte à vos habitudes |
