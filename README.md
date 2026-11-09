# camera_test

ブラウザだけで、PC やスマホにつながっているカメラの映り方を確認できる Web アプリです。

公開URL: https://yosshu.github.io/camera_test/

映像はブラウザの中だけで処理され、外部には送信されません。

## できること

- カメラの開始・停止
- 接続中のカメラの一覧表示と切替（USB カメラの抜き差しにも追従）
- RealSense などの RGB-D カメラは1台にまとめ、「映像の種類」でカラー（RGB）・深度・赤外線を切替（既定はカラー）
  - カメラ名の末尾（`… RGB`、`… Depth` など）で種類を判断する
- 深度は RealSense Viewer と同じ見え方で色付けして表示（Jet 配色：近い＝青 → 遠い＝赤、測れない所は黒）
  - 色を割り当てる距離は「自動」（ヒストグラム均等化。RealSense Viewer の既定）か、0.3〜1.5 m などの固定から選ぶ
  - ブラウザは深度を 8 bit の濃淡に落として表示するため、WebGL で値を取り出して色を付ける（「そのまま（濃淡）」にも切替可）
  - 距離は RealSense の標準の単位（1 = 1 mm）として計算する
- 解像度・フレームレートの指定と、実際に適用された値の表示
  - 要求した値と実際の値が違うときは「要求と異なる」と表示
  - カメラの上限を超える選択肢には「上限超え」と表示
- ブラウザによる縮小・切り抜きの禁止（`resizeMode: none`。Chrome / Edge など対応ブラウザのみ）
- カメラが対応する解像度・フレームレートの範囲の表示（`getCapabilities()` に対応したブラウザのみ）
- `getSettings()` / `getCapabilities()` の生データの表示
- カメラが使えないときの理由と対処の案内（許可なし、他アプリが使用中など）
- 選んだ設定をブラウザに記憶し、次回も同じ設定で開く
- 映像だけの全画面表示（映像右下のボタン、`F` キー、ダブルクリックで切替。Fullscreen API がないブラウザではページいっぱいに広げる）

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` / `css/style.css` | 画面 |
| `js/main.js` | 起動と、画面とカメラの配線 |
| `js/camera.js` | ストリームの開始・停止（止め忘れを防ぐため、ここだけがストリームを持つ） |
| `js/devices.js` | カメラ一覧の取得、抜き差しの検知、RGB-D カメラのまとめ |
| `js/constraints.js` | 解像度・フレームレートの選択肢と、`getUserMedia` に渡す条件 |
| `js/info.js` | カメラ情報の表示 |
| `js/errors.js` | エラーの案内文 |
| `js/storage.js` | 設定の記憶 |
| `js/view-mode.js` | 映像だけの全画面表示 |
| `js/depth-view.js` | 深度の色付け表示 |
| `scripts/build-site.sh` | 公開用のファイルを `_site` に集める |
| `scripts/check-adblock.mjs` | 公開するファイルが広告ブロッカーに止められないか調べる |
| `scripts/serve.mjs` | 開発・テスト用のサーバー |

## ローカルでの確認

カメラの API は HTTPS か `localhost` でしか動きません。`index.html` をファイルとして直接開くのではなく、ローカルサーバー経由で開いてください。

```sh
npm install
npm start   # http://localhost:8080/camera_test/ で開けます
```

## テスト

Chromium のダミーカメラを使ったテストを Playwright で実行します。実機のカメラは不要です。

```sh
npx playwright install chromium   # 初回のみ
npm test
```

push と PR のたびに、GitHub Actions でも同じテストが実行されます（`.github/workflows/ci.yml`）。

## GitHub Pages への公開

`main` へ push（PR のマージを含む）してテストが通ると、同じワークフローが GitHub Pages に公開します。テストが失敗したときは公開されません。公開されるのはアプリに必要な `index.html`・`css/`・`js/` だけで、テストや設定ファイルは含めません。

GitHub Pages は CSS・JS をブラウザに10分間キャッシュさせるため、更新直後に通常の再読み込みをすると、新しい HTML と古い CSS・JS が混ざることがあります。これを防ぐため、公開時に `scripts/build-site.sh` が CSS・JS を版（コミット）ごとのフォルダに置き、`index.html` の参照を書き換えます。同じ形の公開用ファイルに対しても、CI でテストを実行しています（ローカルでは `bash scripts/build-site.sh test && SITE_DIR=_site npm test -- tests/smoke.spec.js`）。

リポジトリ側の設定は1回だけ必要です。

1. リポジトリの Settings → Pages を開く
2. Build and deployment の Source を「GitHub Actions」にする

無料プランではリポジトリを public にする必要があります。公開をやり直したいときは、Actions タブの「test and deploy」から「Run workflow」で `main` を指定して実行します。

## 広告ブロッカーへの対策

広告ブロッカーは URL の見た目で読み込みを止めます。uBlock Origin は、サポート詐欺ページ対策として github.io 上の `fullscreen.js`・`esc.js`・`before.js`・`beep.mp3` などを、どのサイトのものでも一律に止めます。以前 `js/fullscreen.js` がこれに当たり、画面のスクリプトがまったく動かなくなりました（現在は `js/view-mode.js`）。

- ファイル名やフォルダ名に、広告・追跡・詐欺ページでよく使われる名前（`ad`・`ads`・`banner`・`popup`・`track`・`analytics`・`fullscreen`・`esc` など）を使わない
- CI で `scripts/check-adblock.mjs` が、公開するすべてのファイルを uBlock Origin の標準フィルタ（uBlock 本体、EasyList、EasyPrivacy）に照らし、止められるものがあれば公開前に失敗させる（ローカルでは `bash scripts/build-site.sh test && npm run check:adblock`）
- それでもスクリプトが止められたときは、画面に理由と対処（ブロッカーを無効にする、シークレットウィンドウで開く）を表示する
