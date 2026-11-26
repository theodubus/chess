<!-- socle: couche=backlog zone=publique -->
# T-0002 — La notice de durée de match.yml et le commentaire de sa sonde, au vrai

> statut : fait · origine : J-2026-11-23-J · besoin : B-0075 · ref : J-2026-11-26-F · lu : backlog@174e6d94

Un commit de texte dans `.github/workflows/match.yml`, sans effet sur les
matchs : la notice de durée imprimée par le job ne dit plus que « les deux
matchs historiques ont fait 25 % de plus » que l'estimation — le même
fichier écrit 0,97 depuis C21 (~7,25 s par partie) —, et le commentaire de
la sonde ne dit plus la vitesse des runners « de 22 à 58 % » : il renvoie
à F-0017, qui la mesure du simple au double.

## Fait quand

- [x] `grep` ne trouve plus « 25 % de plus » ni « 22 à 58 » dans `.github/workflows/match.yml`, et la notice dit le facteur mesuré
- [x] le commentaire de la sonde nomme F-0017
