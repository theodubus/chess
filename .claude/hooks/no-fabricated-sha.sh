#!/usr/bin/env bash
#
# Hook PreToolUse : refuse un SHA git fabriqué.
#
# Le 15 sept. 2026, j'ai passé un SHA de 40 caractères en garde à une fusion de
# pull request. Je l'avais inventé à partir du SHA court de 7 caractères que
# j'avais sous les yeux. L'API l'a rejeté — mais elle n'avait aucune raison de
# le faire pour moi, et ailleurs un SHA inventé passe sans bruit.
#
# La signature est précise, et c'est ce qui rend ce hook sûr : une chaîne de 40
# hexadécimaux qui n'est PAS un objet git connu, alors que son préfixe de 7 en
# est un. Si ni l'un ni l'autre n'existe, c'est un autre type de hash — un
# SHA-256 tronqué, une somme de contrôle — et on ne bloque pas.
#
# Un garde-fou qui crie pour de mauvaises raisons finit par être désarmé.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENTREE="$(cat)"

cd "$ROOT" 2>/dev/null || exit 0
git rev-parse --git-dir > /dev/null 2>&1 || exit 0

# Trace de déclenchement.
#
# Un script de hook ne peut pas dire s'il a été CHARGÉ par Claude Code — il ne
# tourne que si on l'a chargé. Cette ligne renverse le problème : chaque
# déclenchement laisse une trace datée, donc « les hooks tournent-ils ? »
# devient un fichier à lire, vérifiable depuis n'importe où et sans interface.
# L'auto-test met SHALLOWRED_HOOK_SELFTEST : sans cette garde il
# écrirait sa propre trace et « les hooks tournent-ils ? » répondrait
# oui à cause du test lui-même.
if [[ -z "${SHALLOWRED_HOOK_SELFTEST:-}" ]]; then
  {
    printf '%s  %s\n' "$(date -Is)" "PreToolUse" >> "$ROOT/.claude/hooks-fired.log"
  } 2>/dev/null || true
fi

# Les arguments de l'outil, aplatis, puis tous les mots de 40 hexadécimaux.
ARGS="$(printf '%s' "$ENTREE" | jq -c '.tool_input // {}' 2>/dev/null)" || exit 0
CANDIDATS="$(printf '%s' "$ARGS" | grep -oE '\b[0-9a-f]{40}\b' | sort -u)"
[[ -z "$CANDIDATS" ]] && exit 0

while IFS= read -r sha; do
  [[ -z "$sha" ]] && continue
  # Objet connu : rien à dire.
  git cat-file -e "$sha" 2>/dev/null && continue
  # Préfixe inconnu lui aussi : ce n'est probablement pas un SHA git.
  git cat-file -e "${sha:0:7}" 2>/dev/null || continue

  COURT="${sha:0:7}"
  REEL="$(git rev-parse "$COURT" 2>/dev/null || echo '<introuvable>')"
  printf '%s' "$(jq -nc --arg sha "$sha" --arg court "$COURT" --arg reel "$REEL" \
    '{hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: ("SHA fabriqué : " + $sha + " n’est pas un objet de ce dépôt, alors que son préfixe " + $court + " en est un.\nLe SHA complet de " + $court + " est " + $reel + ".\nNe jamais compléter un SHA court de tête — le lire avec `git rev-parse`.")
      }}')"
  exit 0
done <<< "$CANDIDATS"

exit 0
