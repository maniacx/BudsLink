#!/bin/bash
set -euo pipefail

APP_ID="io.github.maniacx.BudsLink"

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PO_DIR="$ROOT_DIR/po"
POT_FILE="$PO_DIR/${APP_ID}.pot"
LINGUAS_FILE="$PO_DIR/LINGUAS"

cd "$ROOT_DIR"

mapfile -t PO_FILES < <(
    find "$PO_DIR" -maxdepth 1 -type f -name '*.po' -print
)

if (( ${#PO_FILES[@]} == 0 )); then
    echo "Error: no .po files found in $PO_DIR" >&2
    exit 1
fi

printf '%s\n' "${PO_FILES[@]##*/}" |
    sed 's/\.po$//' |
    sort -u > "$LINGUAS_FILE"

find src -type f -name '*.js' -print0 |
    xargs -0 xgettext \
        --language=JavaScript \
        --add-comments="TRANSLATORS:" \
        --from-code=UTF-8 \
        --copyright-holder="maniacx@github.com" \
        --package-name="BudsLink" \
        --output="$POT_FILE"

for file in "${PO_FILES[@]}"; do
    lang="$(basename "$file" .po)"
    echo "Updating $lang"

    msgmerge \
        --backup=off \
        --update \
        --no-fuzzy-matching \
        "$file" \
        "$POT_FILE"
done

