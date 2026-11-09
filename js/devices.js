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

export const STREAM_KINDS = {
  color: { label: 'カラー（RGB）', short: 'カラー' },
  depth: { label: '深度（Depth）', short: '深度' },
  infrared: { label: '赤外線（IR）', short: '赤外線' },
};

const KIND_ORDER = ['color', 'depth', 'infrared'];

const KIND_SUFFIXES = {
  rgb: 'color',
  color: 'color',
  colour: 'color',
  depth: 'depth',
  infrared: 'infrared',
  ir: 'infrared',
};

// RealSense などの RGB-D カメラは、カラー・深度・赤外線がそれぞれ別のカメラとして
// 「Intel(R) RealSense(TM) Depth Camera 435i RGB」のように末尾に種類を付けた名前で見える。
// 製品名に含まれる「Depth Camera」と取り違えないよう、末尾の語だけで種類を判断する。
export function classifyCamera(label) {
  // Linux の Chrome は末尾に「(8086:0b3a)」のような USB の ID を付ける
  const name = (label ?? '').replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)$/i, '').trim();
  const match = name.match(/^(.+?)[\s_-]+(rgb|colou?r|depth|infrared|ir)$/i);
  if (!match) return { baseName: name, kind: null };
  return { baseName: match[1], kind: KIND_SUFFIXES[match[2].toLowerCase()] };
}

// 同じカメラの種類違い（カラーと深度など）を1台にまとめる。
// 名前が同じでも種類が付いていないカメラ（同じ型番の Web カメラ2台など）はまとめない。
export function groupCameras(devices) {
  const groups = [];
  const groupsByBaseName = new Map();

  for (const device of devices) {
    const { baseName, kind } = classifyCamera(device.label);
    const stream = { deviceId: device.deviceId, label: device.label, kind };
    const existing = kind ? groupsByBaseName.get(baseName) : undefined;
    // 同じ種類がすでにある（同じ型番の RGB-D カメラが2台ある）ときは、まとめずに別々に出す
    if (existing && !existing.streams.some((other) => other.kind === kind)) {
      existing.streams.push(stream);
      continue;
    }
    const group = { key: device.deviceId, baseName, streams: [stream] };
    groups.push(group);
    if (kind && !existing) groupsByBaseName.set(baseName, group);
  }

  return groups.map(({ key, baseName, streams }) => {
    if (streams.length === 1) return { key, name: streams[0].label, streams };
    streams.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    const kinds = streams.map((stream) => STREAM_KINDS[stream.kind].short).join('・');
    return { key, name: `${baseName}（${kinds}）`, streams };
  });
}

// 種類の指定がなければカラーを選ぶ
export function pickStream(group, kind) {
  return group.streams.find((stream) => stream.kind === kind)
    ?? group.streams.find((stream) => stream.kind === 'color')
    ?? group.streams[0];
}
