#!/bin/bash
# What does the OS Open Greenspace download itself say about its licence? GET only.
set -uo pipefail
UA="FamilyPilot-licence-review/1.0 (+https://github.com/aidanshaw92/FamilyPilot)"
mkdir -p work && cd work
curl -fsS --retry 2 -A "$UA" -o list.json https://api.os.uk/downloads/v1/products/OpenGreenspace/downloads
echo "== the product listing's own fields for TQ"
jq -c '.[] | select(.area=="TQ")' list.json | head -5
echo "== the keys the listing carries"
jq -r '.[0] | keys | join(",")' list.json
for AREA in TQ TL; do
  ROW=$(jq -c --arg a "$AREA" '.[] | select(.area==$a and (.format|test("Shapefile")))' list.json)
  URL=$(echo "$ROW" | jq -r .url); NAME=$(echo "$ROW" | jq -r .fileName); MD5=$(echo "$ROW" | jq -r .md5)
  curl -fSL --retry 2 -A "$UA" -o "$NAME" "$URL"
  echo "== $AREA: $NAME  md5(listing)=$MD5  md5(file)=$(md5sum "$NAME" | cut -d' ' -f1)  sha256=$(sha256sum "$NAME" | cut -d' ' -f1)  bytes=$(stat -c %s "$NAME")"
  mkdir -p "x-$AREA" && unzip -q -o "$NAME" -d "x-$AREA"
  echo "-- files in $AREA"
  (cd "x-$AREA" && find . -type f | sort | head -60)
done
echo "== text, documentation and licence files inside the download"
find x-TQ x-TL -type f \( -iname '*.txt' -o -iname '*.md' -o -iname '*.html' -o -iname '*.htm' -o -iname '*licen*' -o -iname '*readme*' -o -iname '*.xml' -o -iname '*.pdf' \) | sort | uniq | head -40 | while read -r F; do
  echo "----- $F ($(stat -c %s "$F") bytes)"
  case "$F" in
    *.pdf|*.PDF) pdftotext -layout "$F" - 2>/dev/null | head -120 ;;
    *) head -c 6000 "$F" ;;
  esac
  echo
done
echo "== any line in any text file mentioning licence, copyright or attribution"
grep -rIiE "licen[cs]e|copyright|database right|attribution|open government" x-TQ x-TL 2>/dev/null | cut -c1-300 | head -40
echo "== layer attributes (names only)"
SHP=$(find x-TQ -iname '*GreenspaceSite*.shp' | head -1); ogrinfo -so -al "$SHP" 2>/dev/null | head -30 || echo "(ogrinfo not installed here)"
echo DONE
