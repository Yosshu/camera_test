// テスト用の補助。ページが開いたストリームを記録し、止め忘れを検出できるようにする。

export async function recordStreams(page) {
  await page.addInitScript(() => {
    window.__streams = [];
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices) return;
    const getUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
    mediaDevices.getUserMedia = async (constraints) => {
      const stream = await getUserMedia(constraints);
      window.__streams.push(stream);
      return stream;
    };
  });
}

// まだ止まっていないトラックのラベル一覧
export function liveTracks(page) {
  return page.evaluate(() => window.__streams
    .flatMap((stream) => stream.getTracks())
    .filter((track) => track.readyState === 'live')
    .map((track) => track.label));
}

// 表示中のトラックの getSettings()
export function liveTrackSettings(page) {
  return page.evaluate(() => window.__streams
    .flatMap((stream) => stream.getVideoTracks())
    .find((track) => track.readyState === 'live')
    ?.getSettings() ?? null);
}

// カメラ情報の表から、見出しに対応する値のセルを取り出す
export function infoCell(page, label) {
  return page.locator('#info-table tr')
    .filter({ has: page.getByRole('rowheader', { name: label, exact: true }) })
    .locator('td');
}

// ダミーカメラ2台を、RealSense のような1台の RGB-D カメラ（深度とカラー）に見せかける。
// ブラウザが既定で開く fake_device_0 を深度にして、深度が先に開いてしまう状況を作る。
// hideUntilStarted: 許可前のブラウザのように、最初に開くまでカメラの名前と ID を隠す
export async function simulateRgbdCamera(page, { hideUntilStarted = false } = {}) {
  await page.addInitScript((hide) => {
    const names = {
      fake_device_0: 'Intel(R) RealSense(TM) Depth Camera 435i Depth',
      fake_device_1: 'Intel(R) RealSense(TM) Depth Camera 435i RGB',
    };
    const mediaDevices = navigator.mediaDevices;
    const enumerateDevices = mediaDevices.enumerateDevices.bind(mediaDevices);
    const getUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
    let started = !hide;
    mediaDevices.getUserMedia = async (constraints) => {
      const stream = await getUserMedia(constraints);
      started = true;
      return stream;
    };
    mediaDevices.enumerateDevices = async () => (await enumerateDevices()).map((device) => {
      if (device.kind !== 'videoinput') return device;
      if (!started) return { kind: device.kind, deviceId: '', groupId: '', label: '' };
      return { kind: device.kind, deviceId: device.deviceId, groupId: device.groupId, label: names[device.label] ?? device.label };
    });
  }, hideUntilStarted);
}

export async function failGetUserMedia(page, errorName) {
  await page.addInitScript((name) => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('テスト用のエラー', name);
    };
  }, errorName);
}
