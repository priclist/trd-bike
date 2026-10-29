#!/bin/sh
# Builds assets/bikes/<id>.webp, a transparent cut-out of each bike's first photo, for the rev showcase.
# Needs macOS 14+ (Vision subject lifting) and cwebp (brew install webp). Run after scraper/scrape_stock.py.
# Swap any file for a studio-shot PNG/WebP cut-out with the same name and the site picks it up.
set -e
cd "$(dirname "$0")/.."
mkdir -p assets/bikes
tmp=$(mktemp -d)
swiftc -O tools/cutout.swift -o "$tmp/cutout"
python3 -c 'import json; [print(r["id"], r["images"][0]) for r in json.load(open("data/stock.json")) if r.get("images")]' |
while read -r id img; do
  [ -f "assets/bikes/$id.webp" ] && continue
  "$tmp/cutout" "data/$img" "$tmp/$id.png" && cwebp -quiet -q 84 -alpha_q 90 "$tmp/$id.png" -o "assets/bikes/$id.webp" && echo "cut $id"
done
rm -rf "$tmp"
