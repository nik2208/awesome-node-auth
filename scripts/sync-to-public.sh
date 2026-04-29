#!/usr/bin/env bash
# =============================================================================
# sync-to-public.sh
#
# Sincronizza i file rilevanti da node-auth (privato) ad awesome-node-auth
# (pubblico/npm), escludendo wiki/, mcp-server/ e .github/.
#
# USO:
#   ./sync-to-public.sh [--dry-run] [--no-confirm]
#   oppure via npm:
#   npm run sync:public                  (esecuzione normale)
#   npm run sync:public -- --dry-run     (anteprima)
#   npm run sync:public -- --no-confirm  (skip conferma)
#
# OPZIONI:
#   --dry-run     Mostra cosa verrebbe copiato senza toccare nulla
#   --no-confirm  Salta la conferma interattiva (utile in CI)
#
# PREREQUISITI:
#   - Entrambi i repo clonati localmente in percorsi fratelli, oppure
#     configurati in PRIVATE_REPO / PUBLIC_REPO sotto.
#   - Entrambi i repo devono avere working tree pulito (nessun file unstaged).
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configurazione — adatta questi percorsi alla tua macchina
# (lo script li legge anche da variabili d'ambiente se già impostati)
# ---------------------------------------------------------------------------
PRIVATE_REPO="${PRIVATE_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"   # node-auth
PUBLIC_REPO="${PUBLIC_REPO:-}"                                        # awesome-node-auth

DRY_RUN=false
NO_CONFIRM=false

for arg in "$@"; do
  case $arg in
    --dry-run)    DRY_RUN=true ;;
    --no-confirm) NO_CONFIRM=true ;;
    *) echo "❌ Argomento sconosciuto: $arg"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Colori
# ---------------------------------------------------------------------------
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}ℹ ${RESET}$*"; }
success() { echo -e "${GREEN}✔ ${RESET}$*"; }
warn()    { echo -e "${YELLOW}⚠ ${RESET}$*"; }
error()   { echo -e "${RED}✖ ${RESET}$*" >&2; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

# ---------------------------------------------------------------------------
# Risolvi PUBLIC_REPO se non impostato
# ---------------------------------------------------------------------------
if [[ -z "$PUBLIC_REPO" ]]; then
  # Prova il percorso fratello più comune: ../awesome-node-auth
  CANDIDATE="$(cd "$PRIVATE_REPO/.." && pwd)/awesome-node-auth"
  if [[ -d "$CANDIDATE/.git" ]]; then
    PUBLIC_REPO="$CANDIDATE"
  else
    error "Non riesco a trovare awesome-node-auth."
    error "Imposta la variabile PUBLIC_REPO prima di eseguire lo script:"
    error "  PUBLIC_REPO=/path/to/awesome-node-auth ./sync-to-public.sh"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Validazioni
# ---------------------------------------------------------------------------
header "=== sync-to-public ==="
info "Sorgente : $PRIVATE_REPO"
info "Destinaz.: $PUBLIC_REPO"
$DRY_RUN && warn "Modalità DRY-RUN — nessuna modifica verrà effettuata"

[[ -d "$PRIVATE_REPO/.git" ]] || { error "PRIVATE_REPO non è un repo git: $PRIVATE_REPO"; exit 1; }
[[ -d "$PUBLIC_REPO/.git"  ]] || { error "PUBLIC_REPO non è un repo git: $PUBLIC_REPO";  exit 1; }

# Verifica working tree pulito in entrambi i repo
check_clean() {
  local repo="$1" name="$2"
  if [[ -n "$(git -C "$repo" status --porcelain)" ]]; then
    warn "Il repo $name ha file non committati."
    warn "Consiglio: committa o stasha prima di procedere."
    if ! $NO_CONFIRM; then
      read -rp "Continuare comunque? [y/N] " ans
      ans=$(echo "$ans" | tr '[:upper:]' '[:lower:]')
      [[ "$ans" == "y" ]] || { info "Annullato."; exit 0; }
    fi
  fi
}
check_clean "$PRIVATE_REPO" "node-auth (privato)"
check_clean "$PUBLIC_REPO"  "awesome-node-auth (pubblico)"

# ---------------------------------------------------------------------------
# Cosa copiare
# ---------------------------------------------------------------------------
# Ogni entry è relativa alla root del repo.
# Le directory vengono copiate ricorsivamente con rsync.
# ---------------------------------------------------------------------------

# File singoli alla root
ROOT_FILES=(
  "package.json"
  "package-lock.json"
  "tsconfig.json"
  "vitest.config.ts"
  "CHANGELOG.md"
  "README.md"
  "README.detailed.md"
  "LICENSE"
  "SECURITY.md"
  "CODE_OF_CONDUCT.md"
  "CONTRIBUTING.md"
  ".gitignore"
)

# Directory (copiate con rsync --delete per mantenere la dest in sync)
DIRS=(
  "src"
  "tests"
  "examples"
  "demo"
  "scripts"
)

# ---------------------------------------------------------------------------
# diff_preview — calcola i file che cambieranno, classifica ogni voce
# Imposta gli array globali: DIFF_MODIFIED DIFF_NEW DIFF_DELETED
# ---------------------------------------------------------------------------
DIFF_MODIFIED=()
DIFF_NEW=()
DIFF_DELETED=()

diff_preview() {
  local rsync_excludes=(
    --exclude='node_modules'
    --exclude='dist'
    --exclude='*.log'
  )

  # ── File root ──────────────────────────────────────────────────────────
  for rel in "${ROOT_FILES[@]}"; do
    local src="$PRIVATE_REPO/$rel"
    local dst="$PUBLIC_REPO/$rel"
    [[ -e "$src" ]] || continue

    if [[ ! -e "$dst" ]]; then
      DIFF_NEW+=("$rel")
    else
      # Confronto checksum (macOS md5 / Linux md5sum)
      local sum_src sum_dst
      if command -v md5sum &>/dev/null; then
        sum_src=$(md5sum "$src" | cut -d' ' -f1)
        sum_dst=$(md5sum "$dst" | cut -d' ' -f1)
      else
        sum_src=$(md5 -q "$src")
        sum_dst=$(md5 -q "$dst")
      fi
      [[ "$sum_src" != "$sum_dst" ]] && DIFF_MODIFIED+=("$rel")
    fi
  done

  # ── Directory (rsync checksum dry-run) ────────────────────────────────
  for rel in "${DIRS[@]}"; do
    local src="$PRIVATE_REPO/$rel/"
    local dst="$PUBLIC_REPO/$rel/"
    [[ -d "$PRIVATE_REPO/$rel" ]] || continue

    # File che rsync aggiornerebbe (new + modified)
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      local full_dst="$PUBLIC_REPO/$rel/$line"
      if [[ ! -e "$full_dst" ]]; then
        DIFF_NEW+=("$rel/$line")
      else
        DIFF_MODIFIED+=("$rel/$line")
      fi
    done < <(rsync -a --checksum --dry-run --out-format="%n" \
               "${rsync_excludes[@]}" "$src" "$dst" 2>/dev/null \
             | grep -v '/$')   # escludi le righe directory

    # File che rsync eliminerebbe (presenti in dst ma non in src)
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      DIFF_DELETED+=("$rel/$line")
    done < <(rsync -a --checksum --dry-run --delete --out-format="%n" \
               "${rsync_excludes[@]}" "$src" "$dst" 2>/dev/null \
             | grep '^deleting ' | sed 's/^deleting //')
  done
}

# ---------------------------------------------------------------------------
# print_diff — stampa il risultato del diff in modo leggibile
# ---------------------------------------------------------------------------
print_diff() {
  local total=$(( ${#DIFF_MODIFIED[@]} + ${#DIFF_NEW[@]} + ${#DIFF_DELETED[@]} ))

  if [[ $total -eq 0 ]]; then
    success "Nessuna differenza — i repo sono già in sync."
    return
  fi

  echo ""
  if [[ ${#DIFF_MODIFIED[@]} -gt 0 ]]; then
    echo -e "  ${YELLOW}~ modificati (${#DIFF_MODIFIED[@]})${RESET}"
    for f in "${DIFF_MODIFIED[@]}"; do printf "      %s\n" "$f"; done
  fi
  if [[ ${#DIFF_NEW[@]} -gt 0 ]]; then
    echo -e "  ${GREEN}+ nuovi (${#DIFF_NEW[@]})${RESET}"
    for f in "${DIFF_NEW[@]}"; do printf "      %s\n" "$f"; done
  fi
  if [[ ${#DIFF_DELETED[@]} -gt 0 ]]; then
    echo -e "  ${RED}- eliminati (${#DIFF_DELETED[@]})${RESET}"
    for f in "${DIFF_DELETED[@]}"; do printf "      %s\n" "$f"; done
  fi
  echo ""
  info "Totale: $total file interessati"
  echo ""
}

# ---------------------------------------------------------------------------
# copy_file / copy_dir — esecuzione effettiva
# ---------------------------------------------------------------------------
copy_file() {
  local rel="$1"
  local src="$PRIVATE_REPO/$rel"
  local dst="$PUBLIC_REPO/$rel"
  [[ -e "$src" ]] || { warn "File non trovato, skip: $rel"; return; }
  mkdir -p "$(dirname "$dst")"
  cp -f "$src" "$dst"
  echo -e "  ${GREEN}✔${RESET} $rel"
}

copy_dir() {
  local rel="$1"
  local src="$PRIVATE_REPO/$rel/"
  local dst="$PUBLIC_REPO/$rel/"
  [[ -d "$PRIVATE_REPO/$rel" ]] || { warn "Directory non trovata, skip: $rel/"; return; }
  mkdir -p "$dst"
  rsync -a --checksum --delete \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='*.log' \
    "$src" "$dst"
  echo -e "  ${GREEN}✔${RESET} $rel/"
}

# ---------------------------------------------------------------------------
# check_versions — verifica che tutti i package.json siano allineati
# alla versione canonica del package.json root della libreria.
#
# Per ogni package.json trovato (esclusi node_modules/ e dist/) controlla:
#   1. Il campo "version" — deve essere uguale alla versione canonica
#   2. La dipendenza "awesome-node-auth" in dependencies/devDependencies/
#      peerDependencies — la versione numerica (senza ^~>=) deve coincidere
#
# Stampa una riga per file:
#   ✔  tutto ok
#   ⚠  versione errata       (con il valore attuale e quello atteso)
#   –  nessun campo rilevante (file ignorato silenziosamente)
# ---------------------------------------------------------------------------
VERSION_OK=true

check_versions() {
  local root_pkg="$PRIVATE_REPO/package.json"
  [[ -f "$root_pkg" ]] || { warn "package.json root non trovato, skip check versioni."; return; }

  local LIB_VERSION
  LIB_VERSION=$(node -e "process.stdout.write(require('$root_pkg').version)" 2>/dev/null || echo "?")

  header "Verifica versioni (versione canonica: ${BOLD}$LIB_VERSION${RESET})"
  echo ""

  # Raccogli tutti i package.json del repo, esclusi root / node_modules / dist
  local pkgs=()
  while IFS= read -r p; do
    pkgs+=("$p")
  done < <(find "$PRIVATE_REPO" \
    -name "package.json" \
    -not -path "$root_pkg" \
    -not -path "*/node_modules/*" \
    -not -path "*/dist/*" \
    2>/dev/null | sort)

  if [[ ${#pkgs[@]} -eq 0 ]]; then
    info "Nessun sotto-package.json trovato."
    echo ""
    return
  fi

  for pkg in "${pkgs[@]}"; do
    local rel="${pkg#"$PRIVATE_REPO/"}"
    local file_ok=true

    # -- 1. campo "version" ------------------------------------------------
    local pkg_version
    pkg_version=$(node -e "process.stdout.write(require('$pkg').version || '')" 2>/dev/null || echo "")

    if [[ -n "$pkg_version" && "$pkg_version" != "$LIB_VERSION" ]]; then
      echo -e "  ${YELLOW}⚠${RESET}  ${BOLD}$rel${RESET}"
      echo -e "       version        : ${RED}$pkg_version${RESET}  →  atteso ${GREEN}$LIB_VERSION${RESET}"
      file_ok=false
      VERSION_OK=false
    fi

    # -- 2. dipendenza "awesome-node-auth" ---------------------------------
    local dep_range
    dep_range=$(node -e "
      const p = require('$pkg');
      const v = (p.dependencies       || {})['awesome-node-auth']
             || (p.devDependencies    || {})['awesome-node-auth']
             || (p.peerDependencies   || {})['awesome-node-auth']
             || '';
      process.stdout.write(v);
    " 2>/dev/null || echo "")

    if [[ -n "$dep_range" ]]; then
      # Estrai solo la parte numerica X.Y.Z (rimuove ^, ~, >=, <=, spazi)
      local dep_clean
      dep_clean=$(echo "$dep_range" | sed 's/[^0-9.]//g')

      if [[ "$dep_clean" != "$LIB_VERSION" ]]; then
        # Stampa l'intestazione del file solo se non già stampata al punto 1
        if $file_ok; then
          echo -e "  ${YELLOW}⚠${RESET}  ${BOLD}$rel${RESET}"
        fi
        echo -e "       awesome-node-auth: ${RED}$dep_range${RESET}  →  atteso ${GREEN}^$LIB_VERSION${RESET}"
        file_ok=false
        VERSION_OK=false
      fi
    fi

    # -- riga verde solo se il file aveva almeno un campo rilevante e va bene
    if $file_ok && [[ -n "$pkg_version" || -n "$dep_range" ]]; then
      echo -e "  ${GREEN}✔${RESET}  $rel"
    fi
  done

  echo ""
  if $VERSION_OK; then
    success "Tutti i package.json sono allineati alla versione $LIB_VERSION"
  else
    warn "Alcuni package.json non sono allineati — aggiornali prima del sync."
    if ! $NO_CONFIRM; then
      read -rp "Continuare comunque? [y/N] " ans
      ans=$(echo "$ans" | tr '[:upper:]' '[:lower:]')
      [[ "$ans" == "y" ]] || { info "Annullato."; exit 0; }
    fi
  fi
  echo ""
}

check_versions

# ---------------------------------------------------------------------------
# Analisi differenze
# ---------------------------------------------------------------------------
header "Analisi differenze in corso..."
diff_preview

header "Modifiche che verranno applicate"
print_diff

# Se non ci sono differenze, esci subito
total_changes=$(( ${#DIFF_MODIFIED[@]} + ${#DIFF_NEW[@]} + ${#DIFF_DELETED[@]} ))
if [[ $total_changes -eq 0 ]]; then
  header "=== Completato ==="
  exit 0
fi

if $DRY_RUN; then
  header "=== Completato ==="
  warn "Eseguito in DRY-RUN — nessun file toccato."
  exit 0
fi

if ! $NO_CONFIRM; then
  read -rp "Procedere con la sincronizzazione? [y/N] " ans
  ans=$(echo "$ans" | tr '[:upper:]' '[:lower:]')
  [[ "$ans" == "y" ]] || { info "Annullato."; exit 0; }
fi

# ---------------------------------------------------------------------------
# Esecuzione
# ---------------------------------------------------------------------------
header "Copia file root"
for f in "${ROOT_FILES[@]}"; do
  copy_file "$f"
done

header "Copia directory"
for d in "${DIRS[@]}"; do
  copy_dir "$d"
done

# ---------------------------------------------------------------------------
# Stato git nel repo pubblico
# ---------------------------------------------------------------------------
if ! $DRY_RUN; then
  header "Stato git in awesome-node-auth"
  CHANGED=$(git -C "$PUBLIC_REPO" status --porcelain | wc -l | tr -d ' ')

  if [[ "$CHANGED" -eq 0 ]]; then
    success "Nessuna differenza rispetto al repo pubblico — già in sync."
  else
    info "$CHANGED file modificati/aggiunti. Diff:"
    echo ""
    git -C "$PUBLIC_REPO" status --short
    echo ""
    echo -e "${BOLD}Prossimi passi suggeriti:${RESET}"
    echo "  cd $PUBLIC_REPO"
    echo "  git add -A"
    echo "  git commit -m \"chore: sync from node-auth vX.Y.Z\""
    echo "  git push"
    echo "  npm publish"
  fi
fi

header "=== Completato ==="
$DRY_RUN && warn "Eseguito in DRY-RUN — nessun file toccato."