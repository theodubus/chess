#!/usr/bin/env bash
#
# Auto-test des hooks de projet.
#
#   tools/verify-hooks.sh
#
# Deux questions distinctes, et le script répond aux deux.
#
#   1. Les SCRIPTS font-ils ce qu'ils annoncent ? — onze cas ci-dessous.
#   2. Claude Code les a-t-il CHARGÉS ? — un script ne peut pas le dire de
#      lui-même, puisqu'il ne tourne que s'il a été chargé. Chaque
#      déclenchement réel laisse donc une trace datée dans
#      `.claude/hooks-fired.log`, et ce script la rapporte.
#
# La question 2 ne se règle PAS par `/hooks` : cette commande n'existe pas dans
# toutes les versions. Vérifié le 15 sept. 2026 — chez Théo, `/hooks` ne
# propose que la skill `session-start-hook`, qui n'a rien à voir. La trace sur
# disque est la seule réponse portable, et elle se lit depuis un téléphone.
#
# Ce que la trace a d'ailleurs immédiatement démenti : j'avais affirmé qu'un
# `.claude/` créé après le démarrage d'une session n'était pas chargé par
# cette session-là. **C'est faux** — le hook PreToolUse s'est déclenché sur
# l'appel d'outil suivant, dans la session même qui venait de l'écrire. Une
# affirmation de plus qui ne valait rien tant qu'elle n'était pas observée.

set -uo pipefail

# Sans locale UTF-8, `${#mot}` compte les OCTETS : « critères » y vaut 9 au lieu
# de 8, et chaque accent décale une colonne. Le conteneur ne définit ni LANG ni
# LC_ALL, d'où ce réglage explicite.
export LC_ALL=C.UTF-8

# Empêche les hooks d'écrire leur trace pendant leur propre test : sinon le
# rapport ci-dessous répondrait « oui, ils tournent » à cause du test.
export SHALLOWRED_HOOK_SELFTEST=1
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ECHECS=()
LANCES=0
# Nombre de cas attendus. Un cas qui disparaît doit faire échouer le script :
# c'est arrivé une fois, un `>/dev/null` mal placé ayant redirigé le `printf`
# de cette fonction en même temps que la commande, et trois cas se sont tus.
ATTENDUS=11

cas() {
  local nom="$1"; shift
  LANCES=$(( LANCES + 1 ))
  printf '  %s%*s' "$nom" $(( 52 - ${#nom} )) ''
  # La sortie de la commande est étouffée ICI, jamais à l'appel : un
  # redirecteur posé sur `cas` emporterait aussi l'affichage.
  if "$@" > /dev/null 2>&1; then
    printf 'ok\n'
  else
    printf 'ECHEC\n'
    ECHECS+=("$nom")
  fi
}

sha_muet() {  # le hook ne doit RIEN dire
  local sortie
  sortie="$(printf '%s' "$1" | .claude/hooks/no-fabricated-sha.sh)"
  [[ -z "$sortie" ]]
}
sha_refuse() {  # le hook doit refuser
  local sortie
  sortie="$(printf '%s' "$1" | .claude/hooks/no-fabricated-sha.sh)"
  [[ "$(jq -r '.hookSpecificOutput.permissionDecision // empty' <<< "$sortie")" == "deny" ]]
}

echo "auto-test des hooks"
echo

echo "  configuration"
cas "settings.json est du JSON valide"        jq -e . .claude/settings.json
cas "un hook Stop est déclaré"                jq -e '.hooks.Stop[0].hooks[0].command' .claude/settings.json
cas "un hook PreToolUse est déclaré"          jq -e '.hooks.PreToolUse[0].hooks[0].command' .claude/settings.json
cas "les deux scripts sont exécutables"       bash -c '[[ -x .claude/hooks/verify-on-stop.sh && -x .claude/hooks/no-fabricated-sha.sh ]]'
cas "leur syntaxe est correcte"               bash -c 'bash -n .claude/hooks/verify-on-stop.sh && bash -n .claude/hooks/no-fabricated-sha.sh'

echo
echo "  hook « SHA fabriqué »"
VRAI="$(git rev-parse HEAD)"
FAUX="${VRAI:0:7}$(printf '0%.0s' $(seq 1 33))"
cas "un SHA réel passe"                       sha_muet "{\"tool_input\":{\"sha\":\"$VRAI\"}}"
cas "un SHA fabriqué est refusé"              sha_refuse "{\"tool_input\":{\"sha\":\"$FAUX\"}}"
cas "un hash au préfixe inconnu passe"        sha_muet '{"tool_input":{"h":"ffffffffffffffffffffffffffffffffffffffff"}}'
cas "une commande sans hexadécimal passe"     sha_muet '{"tool_input":{"command":"ls -la"}}'
cas "un SHA fabriqué imbriqué est refusé"     sha_refuse "{\"tool_input\":{\"a\":{\"b\":[\"$FAUX\"]}}}"

echo
echo "  hook « arbre cassé »"
MODIFIES="$(git diff --name-only HEAD -- '*.rs'; git ls-files --others --exclude-standard -- '*.rs')"
if [[ -z "$MODIFIES" ]]; then
  cas "aucun .rs modifié : le hook se tait"   bash -c '[[ -z "$(echo "{}" | .claude/hooks/verify-on-stop.sh)" ]]'
  echo "    (le chemin « .rs modifiés » n'est pas testable ici : aucun ne l'est)"
else
  cas "des .rs modifiés : le hook agit"       bash -c 'SHALLOWRED_HOOK_SELFTEST=1 .claude/hooks/verify-on-stop.sh | grep -q AUTOTEST'
fi

echo
echo "  les hooks se sont-ils déclenchés pour de vrai ?"
TRACE=".claude/hooks-fired.log"
if [[ -s "$TRACE" ]]; then
  echo "    OUI — Claude Code les a chargés et exécutés."
  echo "    dernier déclenchement : $(tail -1 "$TRACE")"
  echo "    déclenchements enregistrés : $(grep -c '' "$TRACE")"
else
  echo "    PAS ENCORE — aucune trace dans $TRACE."
  echo "    Soit Claude Code ne les a pas chargés, soit aucune session ne s'est"
  echo "    terminée depuis. Les hooks d'un .claude/ créé APRÈS le démarrage"
  echo "    d'une session ne sont pas chargés par cette session-là ; une session"
  echo "    démarrée ensuite les trouve en place. Relancer ce script dans une"
  echo "    nouvelle session tranche."
fi

echo
if (( LANCES != ATTENDUS )); then
  echo "ECHEC — $LANCES cas exécutés, $ATTENDUS attendus."
  echo "Un cas a disparu en silence : c'est plus grave qu'un cas qui échoue."
  exit 1
fi

if [[ ${#ECHECS[@]} -eq 0 ]]; then
  echo "LES SCRIPTS FONT CE QU'ILS ANNONCENT"
  exit 0
fi
echo "ECHEC — ${#ECHECS[@]} cas : ${ECHECS[*]}"
exit 1
