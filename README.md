# camera_test

ブラウザだけで、PC やスマホにつながっているカメラの映り方を確認できる Web アプリです。

公開URL: https://yosshu.github.io/camera_test/

映像はブラウザの中だけで処理され、外部には送信されません。

## できること

- カメラの開始・停止
- 接続中のカメラの一覧表示と切替（USB カメラの抜き差しにも追従）
- 解像度・フレームレートの指定と、実際に適用された値の表示
  - 要求した値と実際の値が違うときは「要求と異なる」と表示
  - カメラの上限を超える選択肢には「上限超え」と表示
- ブラウザによる縮小・切り抜きの禁止（`resizeMode: none`。Chrome / Edge など対応ブラウザのみ）
- カメラが対応する解像度・フレームレートの範囲の表示（`getCapabilities()` に対応したブラウザのみ）
- `getSettings()` / `getCapabilities()` の生データの表示
- カメラが使えないときの理由と対処の案内（許可なし、他アプリが使用中など）
- 選んだ設定をブラウザに記憶し、次回も同じ設定で開く

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` / `css/style.css` | 画面 |
| `js/main.js` | 起動と、画面とカメラの配線 |
| `js/camera.js` | ストリームの開始・停止（止め忘れを防ぐため、ここだけがストリームを持つ） |
| `js/devices.js` | カメラ一覧の取得と抜き差しの検知 |
| `js/constraints.js` | 解像度・フレームレートの選択肢と、`getUserMedia` に渡す条件 |
| `js/info.js` | カメラ情報の表示 |
| `js/errors.js` | エラーの案内文 |
| `js/storage.js` | 設定の記憶 |

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

push のたびに GitHub Actions でも同じテストが実行されます。

## GitHub Pages の公開設定

1. リポジトリの Settings → Pages を開く
2. Source を「Deploy from a branch」にする
3. Branch を `main`、フォルダを `/(root)` にして保存する

数分後に公開URLで開けるようになります。無料プランではリポジトリを public にする必要があります。
