# 開発メモ

このアプリを変更する人向けに、構成と、これまでにつまずいた点をまとめます。使い方と開発の始め方は [README](../README.md) を見てください。

## ファイル構成

ビルド不要の静的ファイル（HTML・CSS・ES Modules）だけで作っています。

| ファイル | 役割 |
|---|---|
| `index.html` / `css/style.css` | 画面 |
| `js/main.js` | 起動と、画面とカメラの配線 |
| `js/camera.js` | ストリームの開始・停止。止め忘れを防ぐため、ストリームを持つのはここだけにしている |
| `js/devices.js` | カメラ一覧の取得、抜き差しの検知、RGB-D カメラのまとめ |
| `js/constraints.js` | 解像度・フレームレートの選択肢と、`getUserMedia` に渡す条件 |
| `js/info.js` | カメラ情報の表示 |
| `js/errors.js` | カメラが使えないときの案内文 |
| `js/storage.js` | 設定の記憶（`localStorage`） |
| `js/view-mode.js` | 映像だけの全画面表示 |
| `js/depth-view.js` | 深度の色付け表示 |
| `scripts/serve.mjs` | 開発・テスト用のサーバー（GitHub Pages と同じく `/camera_test/` の下で配信する） |
| `scripts/build-site.sh` | 公開用のファイルを `_site` に集める |
| `scripts/check-adblock.mjs` | 公開するファイルが広告ブロッカーに止められないか調べる |
| `tests/` | Playwright のテスト |

## テスト

- Chromium のダミーカメラ（`--use-fake-device-for-media-stream`）を2台使います。実機のカメラは要りません。
- ヘッドレス専用の軽量版 Chromium ではカメラ API が `NotSupportedError` になるため、通常版（`channel: 'chromium'`）で動かしています。
- RGB-D カメラは、ダミーカメラの名前を `… Depth` / `… RGB` に見せかけて試しています（`tests/helpers.js` の `simulateRgbdCamera`）。
- 公開用に組み立てたファイルでも試せます。

  ```sh
  bash scripts/build-site.sh test
  SITE_DIR=_site npx playwright test tests/smoke.spec.js
  npm run check:adblock
  ```

## 公開の流れ

`.github/workflows/ci.yml` が次の順に動きます。

1. Playwright のテスト
2. `scripts/build-site.sh` で公開用のファイルを組み立て、それに対してもテスト
3. `scripts/check-adblock.mjs` で広告ブロッカーに止められないか確認
4. `main` のときだけ GitHub Pages に公開（`deploy` ジョブ）

リポジトリの Settings → Pages の Source は「GitHub Actions」にしてあります。「Deploy from a branch」に変えると公開されなくなります。公開をやり直したいときは、Actions タブの「test and deploy」から `main` を指定して「Run workflow」を実行します。

## これまでにつまずいた点

### 更新直後に古い CSS・JS が混ざる

GitHub Pages は CSS・JS をブラウザに10分間キャッシュさせます。Chrome の通常の再読み込み（F5）では HTML だけが取り直されるため、更新直後は新しい HTML と古い JS が混ざり、画面が崩れることがありました。

対策として、`scripts/build-site.sh` が CSS・JS を版（コミットの SHA）ごとのフォルダに置き、`index.html` の参照をそこへ書き換えています。そのため、`index.html` から CSS・JS を参照するときは `./css/…`、`./js/…` の形で書いてください（この形を書き換えます）。

### 広告ブロッカーに止められる

uBlock Origin の標準フィルタ（`badware.txt`）は、サポート詐欺ページ対策として、github.io 上の `fullscreen.js`・`esc.js`・`before.js`・`beep.mp3` などを、どのサイトのものでも一律に止めます。以前 `js/fullscreen.js` がこれに当たり、`main.js` が丸ごと動かなくなりました（今は `js/view-mode.js`）。

- ファイル名やフォルダ名に、広告・追跡・詐欺ページでよく使われる語（`ad`・`banner`・`popup`・`track`・`analytics`・`fullscreen`・`esc` など）を使わない。
- CI の `scripts/check-adblock.mjs` が、uBlock Origin の標準フィルタ（uBlock 本体・EasyList・EasyPrivacy）に照らして確かめる。止められるファイルがあれば公開前に失敗する。
- それでも止められたときは、`index.html` に直接書いた処理が、画面に理由と対処を表示する。

### RGB-D カメラ

- RealSense などは、カラーと深度が `… RGB` と `… Depth` という別のカメラとして見えます。名前の末尾の語で種類を判断し、1台にまとめています。製品名に含まれる「Depth Camera」と取り違えないよう、末尾の語だけを見ます。
- 許可前は名前が分からないため、ブラウザが深度の方を開くことがあります。開いた後に一覧を見て、映像の種類を自分で選んでいなければカラーに切り替えます。

### 深度の表示

- ブラウザは深度（16 bit、RealSense の標準では 1 = 1 mm）を、8 bit の濃淡（上位の桁）に落として `<video>` に表示します。そのままでは数 m 以内がほぼ真っ黒になります。
- `js/depth-view.js` は、WebGL2 で映像を `R32F` のテクスチャに読み込んで値を取り出し、色を付けて canvas に描きます。ブラウザが 8 bit しか渡さない場合は、約 25 cm 刻みの値になります。
- 色の付け方は librealsense の colorizer（RealSense Viewer）に合わせています。
  - 配色は Jet（青 → 水色 → 黄 → 赤 → 暗い赤）で、近いほど青
  - 既定はヒストグラム均等化
  - 値 0（測れなかった画素）は黒
- 距離は、RealSense の標準の単位（1 = 1 mm）として計算しています。単位の違うカメラでは、凡例の距離がずれます。
