#!/usr/bin/env bash
# GitHub Pages に公開するファイルを _site に集める。
#
# GitHub Pages は CSS・JS をブラウザに10分間キャッシュさせ、通常の再読み込みでは
# HTML だけが新しくなって CSS・JS は古いまま、という混ざった状態になる。
# そうならないよう、CSS・JS は版ごとのフォルダに置き、index.html の参照をそこへ書き換える。
#
# 使い方: scripts/build-site.sh <版の名前（コミットの SHA など）>
set -euo pipefail

version="${1:?版の名前（コミットの SHA など）を指定してください}"
out=_site

rm -rf "$out"
mkdir -p "$out/$version"
cp -r css js "$out/$version/"
sed -e "s#\"\./css/#\"./$version/css/#g" -e "s#\"\./js/#\"./$version/js/#g" index.html > "$out/index.html"

# 書き換えた参照先がすべて存在することを確かめる
grep -q "\"\./$version/js/main.js\"" "$out/index.html"
grep -o "\"\./$version/[^\"]*\"" "$out/index.html" | tr -d '"' | while read -r path; do
  if [ ! -f "$out/$path" ]; then
    echo "参照先が見つかりません: $path" >&2
    exit 1
  fi
done

echo "$out に版 $version を作りました"
