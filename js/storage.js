// 選んだ設定をこのブラウザに覚えておき、次回も同じ設定で開けるようにする。
// プライベートモードなどで保存できなくても、アプリ自体は動き続ける。

const KEY = 'camera_test:settings';

export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 保存できない環境では覚えないだけ
  }
}
