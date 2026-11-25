# TotalEnergies

Cette intégration ajoute les offres d'électricité **TotalEnergies** au suivi
de l'énergie de Gladys, et vous donne la période tarifaire et le prix du kWh
en cours pour piloter votre maison : lancer le chauffe-eau en heures creuses,
charger la voiture en heures super creuses, couper le chauffage pendant les
heures de vigilance d'un jour Éclair.

Tout est calculé dans l'intégration, à partir de votre contrat : **aucun
compte TotalEnergies n'est nécessaire** et rien ne sort de votre réseau.

> Intégration communautaire, non affiliée à TotalEnergies. Les prix
> pré-remplis viennent de la grille publique du 1er octobre 2026 (9 kVA, TTC) :
> vérifiez-les toujours sur votre facture.

Gladys 5.3 ou plus récent est nécessaire.

## Les offres disponibles

| Modèle de contrat            | Périodes                                      |
| ---------------------------- | --------------------------------------------- |
| Access – Base / – HP/HC      | Base, ou heures pleines / heures creuses      |
| Heures Eco – Base / – HP/HC  | Base, ou heures pleines / heures creuses      |
| Fixe 2 ans – Base / – HP/HC  | Base, ou heures pleines / heures creuses      |
| Charge'Heures – HP/HC/HSC    | HSC 2 h-6 h, HC 23 h-2 h et 6 h-7 h, HP       |
| Heures Eco+ – HP/HC/HV       | HP, HC, et heures de vigilance (jours Éclair) |
| Autre offre – Base / – HP/HC | Pour Verte Fixe, Standard Fixe, Online…       |

## Mise en route

1. Installez l'intégration depuis le catalogue de Gladys.
2. Ouvrez **Énergie > Contrats** et créez votre contrat : choisissez le modèle
   TotalEnergies qui correspond à votre offre.
3. Recopiez les prix de votre facture (prix du kWh TTC et abonnement mensuel
   TTC) et, pour une option heures pleines / heures creuses, vos **plages
   d'heures creuses** : elles sont fixées par Enedis pour votre compteur et
   figurent sur votre facture.
4. Rattachez le contrat à votre compteur, comme pour tout contrat Gladys :
   Gladys calcule alors vos coûts.
5. Ouvrez l'onglet **Découverte** de l'intégration : un appareil par contrat
   apparaît, avec deux fonctionnalités — **Prix du kWh** et **Période
   tarifaire**. Ajoutez-le.

Un contrat créé plus tard apparaît dans la Découverte en 15 minutes au plus,
ou tout de suite avec le bouton **Voir mes contrats TotalEnergies**.

## Configuration

- **Alerte avant vigilance (minutes)** — Heures Eco+ : combien de minutes
  avant chaque plage de vigilance le déclencheur « Heures de vigilance
  bientôt » se déclenche (60 par défaut).

Boutons de l'écran de configuration :

- **Voir mes contrats TotalEnergies** — liste les contrats Gladys créés à
  partir des modèles TotalEnergies, avec leur période et leur prix en cours.
- **Déclarer un jour Éclair** — saisissez la date annoncée par TotalEnergies
  (AAAA-MM-JJ, vide = demain).
- **Annuler un jour Éclair** — remet en jour normal un jour déclaré par
  erreur.

## Heures Eco+ et jours Éclair

L'offre Heures Eco+ compte 20 **jours Éclair** par an, entre le 15 octobre et
le 15 avril. Ces jours-là, les **heures de vigilance** (7 h-15 h et 18 h-20 h)
coûtent environ trois fois le prix habituel.

TotalEnergies annonce un jour Éclair la veille au soir, par e-mail et SMS
seulement : il n'existe pas de service en ligne pour les lire. Vous déclarez
donc chaque jour Éclair dans l'intégration, au choix :

- avec le bouton **Jour Éclair demain** du widget « Tarif TotalEnergies » ;
- avec le widget « Jours Éclair » ;
- avec le bouton **Déclarer un jour Éclair** de l'écran de configuration ;
- depuis une scène, avec l'action **Déclarer un jour Éclair**.

L'intégration enregistre ces jours dans le calendrier tarifaire
`eclair-days` de Gladys, qui s'en sert pour calculer le coût des heures de
vigilance. Les autres jours y sont notés « normaux » automatiquement.

## Scènes

Déclencheurs (catégorie **Intégrations** de l'éditeur de scènes) :

- **Changement de période tarifaire** — un contrat passe en heures pleines,
  creuses, super creuses ou de vigilance. Filtrez sur le contrat et sur la
  nouvelle période. Variables : `period`, `previous_period`, `price`.
- **Heures de vigilance bientôt** — Heures Eco+ : une plage de vigilance
  commence bientôt. Variables : `starts_at`, `ends_at`, `minutes_before`.
- **Jour Éclair annoncé** — un jour Éclair vient d'être déclaré depuis
  l'écran de configuration ou le tableau de bord. Variables : `date`,
  `is_tomorrow`, `season_count`.

Actions :

- **Lire le tarif en cours** — renvoie `period`, `price`, `next_period`,
  `next_change_at`, `eclair_today`, `eclair_tomorrow` (et `found`).
- **Déclarer un jour Éclair** — aujourd'hui ou demain. Elle ne déclenche pas
  « Jour Éclair annoncé », pour qu'une scène ne puisse pas tourner en boucle.

Les périodes valent `base`, `hp`, `hc`, `hsc` ou `hv`.

Exemple : _Quand la période passe à `hc` sur mon contrat, allumer le
chauffe-eau ; quand elle passe à `hp`, l'éteindre._

## Tableau de bord

- **Tarif TotalEnergies** — prix et période en cours, prochain changement,
  courbe du prix sur les 24 prochaines heures, et pour Heures Eco+ les jours
  Éclair d'aujourd'hui et de demain. Choisissez le contrat dans les réglages
  du widget (vide = le premier contrat).
- **Jours Éclair** — jours Éclair de la saison (x/20), prochain jour, et
  boutons pour en déclarer ou en annuler un.

## Bon à savoir

- Le prix affiché est le prix du kWh TTC saisi dans le contrat ; Gladys
  ajoute lui-même l'abonnement dans ses coûts.
- Les prix TotalEnergies changent (jusqu'à deux fois par an pour certaines
  offres) : mettez à jour le contrat dans **Énergie > Contrats**.

## Dépannage

- **Aucun appareil dans la Découverte** : vérifiez qu'un contrat est créé à
  partir d'un modèle **TotalEnergies** et qu'il est actif (date de début
  passée). Le bouton **Voir mes contrats TotalEnergies** le confirme.
- **Le prix ne bouge pas** : l'appareil doit être ajouté depuis la
  Découverte pour recevoir ses valeurs.
- Consultez les logs de l'intégration depuis Gladys (ou `docker logs`) pour
  le détail.

## Contrat gaz (Gazpar)

Les modèles **Base** marchent aussi pour une offre gaz à prix fixe : tout
est en kWh. Gladys calcule le coût à partir d'un **index en kWh** sur le
compteur lié au contrat. Or l'intégration Gazpar publie un index en **m³**,
une fois par jour. On passe donc par un compteur MQTT, alimenté par une
scène.

1. Dans **Intégrations > MQTT**, créez un appareil avec une fonctionnalité
   **index** (catégorie Énergie, en kWh). Cliquez sur **Créer les
   fonctionnalités** (bloc « Suivi énergétique »), puis **Enregistrer**.
2. Liez votre contrat TotalEnergies à ce compteur MQTT.
3. Créez une scène :
   - Déclencheur : « Index compteur » de l'appareil Gazpar change de valeur.
   - Action **Définir une variable**, mode **Calculée** :
     `{{triggerEvent.last_value}} * 11.2` (votre coefficient de conversion,
     avec un point et pas une virgule).
   - Action **Envoyer un message MQTT** : le topic de l'index, affiché sur
     la fiche de l'appareil MQTT
     (`gladys/master/device/<appareil>/feature/<index>/state`), et comme
     message la variable de l'étape précédente (tapez `{{` pour la choisir).
4. Dans le widget **Consommation d'énergie**, choisissez le coût de ce
   compteur et cochez **Afficher l'abonnement**.

Bon à savoir :

- **Coefficient** : prenez une valeur moyenne de votre facture (autour de 11) et **ne la changez plus**. La scène multiplie l'index complet : passer
  de 11,20 à 11,25 sur un index de 5 000 m³ ferait un saut de 250 kWh d'un
  coup.
- Si l'index Gazpar est déjà en kWh, sautez la variable et envoyez
  directement `{{triggerEvent.last_value}}`.
- La première valeur sert de point de départ : la consommation apparaît à
  partir de la valeur suivante (le lendemain).
- GRDF envoie une valeur par jour, souvent le lendemain : toute la journée
  tombe dans un seul créneau de 30 minutes. Les totaux par jour et par mois
  sont justes, le détail heure par heure n'a pas de sens.
- L'historique passé n'est pas repris : la scène n'envoie que les nouvelles
  valeurs. Ensuite, Gladys calcule seul les nouveaux jours.
