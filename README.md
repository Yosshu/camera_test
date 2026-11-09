# camera_test

PC やスマホにつながっているカメラの映り方を、ブラウザだけで確認できる Web アプリです。

**https://yosshu.github.io/camera_test/**

映像はブラウザの中だけで処理され、外部には送信されません。

## できること

- 接続しているカメラを選んで映像を表示する
- 解像度・フレームレートを指定し、実際にどの設定で動いているかを確かめる
- カメラが対応する解像度・フレームレートの範囲を見る
- RealSense などの RGB-D カメラで、カラーと深度を切り替える（深度は距離を色で表示）
- 映像だけを全画面で表示する（`F` キーでも切り替えられます）

Chrome / Edge での利用をおすすめします。ほかのブラウザでは、一部の表示や設定が使えないことがあります。

## 開発

```sh
npm install
npm start   # http://localhost:8080/camera_test/ で開けます
npm test    # Chromium のダミーカメラで動作を確かめます（初回は npx playwright install chromium）
```

カメラは HTTPS か `localhost` でしか使えないため、`index.html` を直接開かずに `npm start` で開いてください。

`main` にマージすると、GitHub Actions がテストを実行し、通れば GitHub Pages に公開します。

構成や、これまでにつまずいた点は [開発メモ](docs/development.md) にまとめています。
