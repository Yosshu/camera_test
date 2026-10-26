// 接続されているカメラの一覧を扱う。
// 許可を得る前は、ブラウザがカメラの名前や ID を隠すことがある。

export async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === 'videoinput');
}

// USB カメラの抜き差しなどで一覧が変わったときに呼ばれる
export function watchCameras(callback) {
  navigator.mediaDevices.addEventListener('devicechange', callback);
}
