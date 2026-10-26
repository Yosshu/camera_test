# camera_test

ブラウザだけで、PC やスマホにつながっているカメラの映り方を確認できる Web アプリです。

公開URL: https://yosshu.github.io/camera_test/

映像はブラウザの中だけで処理され、外部には送信されません。

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
