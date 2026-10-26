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

export async function failGetUserMedia(page, errorName) {
  await page.addInitScript((name) => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('テスト用のエラー', name);
    };
  }, errorName);
}
