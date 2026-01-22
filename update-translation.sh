#!/bin/bash
set -e

APP_ID="io.github.maniacx.BudsLink"
SCRIPT_APP_ID="io.github.maniacx.BudsLink.script"

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PO_DIR="$ROOT_DIR/po"
LOCALE_DIR="$ROOT_DIR/locale"
POT_FILE="$PO_DIR/${APP_ID}.pot"

cd "$ROOT_DIR"

LINGUAS_FILE="$PO_DIR/LINGUAS"
ls "$PO_DIR"/*.po \
    | xargs -n1 basename \
    | sed 's/\.po$//' \
    | sort -u \
    > "$LINGUAS_FILE"

echo "Generated $LINGUAS_FILE:"
cat "$LINGUAS_FILE"

ALL_FILES=$(find src -type f -name '*.js')

xgettext \
    --language=JavaScript \
    --add-comments="TRANSLATORS:" \
    --from-code=UTF-8 \
    --copyright-holder="maniacx@github.com" \
    --package-name="BudsLink" \
    --output="$POT_FILE" \
    $ALL_FILES

for file in "$PO_DIR"/*.po; do
    lang=$(basename "$file" .po)
    echo "Updating $lang"

    msgmerge --backup=off --update --no-fuzzy-matching "$file" "$POT_FILE"

    if grep --silent "#, fuzzy" "$file"; then
        fuzzy+=("$lang")
    fi
done

for file in "$PO_DIR"/*.po; do
    lang=$(basename "$file" .po)

    target_dir="$LOCALE_DIR/$lang/LC_MESSAGES"
    target_mo="$target_dir/$SCRIPT_APP_ID.mo"

    mkdir -p "$target_dir"
    msgfmt "$file" -o "$target_mo"

    echo "Compiled $target_mo"
done

if [[ -v fuzzy ]]; then
    echo "WARNING: Translations have fuzzy strings: ${fuzzy[*]}"
fi

