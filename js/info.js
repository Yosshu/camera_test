// 要求した設定と、実際にカメラが動いている設定を並べて表示する。

const UNAVAILABLE = 'このブラウザでは取得できません';

const RESIZE_MODES = {
  'none': 'しない（カメラ本来の解像度）',
  'crop-and-scale': 'ブラウザが行う場合あり',
};

const FACING_MODES = {
  user: '前面（自分側）',
  environment: '背面',
  left: '左',
  right: '右',
};

export function formatResolution(width, height) {
  return width && height ? `${width}×${height}` : '—';
}

export function formatFrameRate(fps) {
  return typeof fps === 'number' ? `${round(fps)} fps` : '—';
}

export function formatAspectRatio(width, height) {
  if (!width || !height) return '—';
  const divisor = gcd(width, height);
  const [w, h] = [width / divisor, height / divisor];
  const ratio = (width / height).toFixed(3);
  // 1366×768 のように約分しても数字が大きいものは小数だけにする
  return w <= 32 && h <= 32 ? `${w}:${h}（${ratio}）` : ratio;
}

// スマホの縦向きでは幅と高さが入れ替わるので、入れ替わっていても同じとみなす
export function sameResolution(a, b) {
  return (a.width === b.width && a.height === b.height)
    || (a.width === b.height && a.height === b.width);
}

export function sameFrameRate(requested, actual) {
  return Math.abs(requested - actual) < 0.5;
}

export function renderInfo(table, { track, video, request }) {
  const body = table.tBodies[0];
  body.replaceChildren();
  if (!track) {
    addEmptyRow(body, 'カメラを開始すると表示されます。');
    return;
  }

  const settings = track.getSettings();
  const capabilities = track.getCapabilities?.() ?? null;
  const actual = { width: settings.width, height: settings.height };
  const { resolution, frameRate } = request;

  addRow(body, 'カメラ', track.label || '（名前を取得できません）');
  addRow(body, '解像度', formatResolution(actual.width, actual.height), resolution.width
    ? {
      note: `要求: ${formatResolution(resolution.width, resolution.height)}`,
      warning: !actual.width || sameResolution(resolution, actual) ? null : '要求と異なる',
    }
    : { note: '要求: 自動' });
  addRow(body, 'フレームレート', formatFrameRate(settings.frameRate), frameRate.fps
    ? {
      note: `要求: ${frameRate.fps} fps`,
      warning: settings.frameRate === undefined || sameFrameRate(frameRate.fps, settings.frameRate) ? null : '要求と異なる',
    }
    : { note: '要求: 自動' });
  addRow(body, '受信中の映像サイズ', formatResolution(video.videoWidth, video.videoHeight));
  addRow(body, 'アスペクト比', formatAspectRatio(actual.width, actual.height));
  addRow(body, '縮小・切り抜き', RESIZE_MODES[settings.resizeMode] ?? '不明');
  if (settings.facingMode) {
    addRow(body, 'カメラの向き', FACING_MODES[settings.facingMode] ?? settings.facingMode);
  }
  addRow(body, '対応解像度', capabilities?.width && capabilities?.height
    ? `${formatResolution(capabilities.width.min, capabilities.height.min)} 〜 ${formatResolution(capabilities.width.max, capabilities.height.max)}`
    : UNAVAILABLE);
  addRow(body, '対応フレームレート', capabilities?.frameRate
    ? `${round(capabilities.frameRate.min)} 〜 ${round(capabilities.frameRate.max)} fps`
    : UNAVAILABLE);
  addRow(body, 'デバイスID', shorten(settings.deviceId), { title: settings.deviceId });
}

export function renderRawData(pre, { track, request }) {
  if (!track) {
    pre.textContent = 'カメラを開始すると表示されます。';
    return;
  }
  pre.textContent = JSON.stringify({
    constraints: request.constraints,
    settings: track.getSettings(),
    capabilities: track.getCapabilities?.() ?? UNAVAILABLE,
  }, null, 2);
}

function addRow(body, label, value, { note, warning, title } = {}) {
  const row = body.insertRow();
  const header = document.createElement('th');
  header.scope = 'row';
  header.textContent = label;
  row.append(header);

  const cell = row.insertCell();
  const main = document.createElement('span');
  main.className = 'info-value';
  main.textContent = value;
  if (title) main.title = title;
  cell.append(main);
  if (warning) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = warning;
    cell.append(' ', badge);
  }
  if (note) {
    const detail = document.createElement('span');
    detail.className = 'info-note';
    detail.textContent = note;
    cell.append(detail);
  }
}

function addEmptyRow(body, text) {
  const cell = body.insertRow().insertCell();
  cell.colSpan = 2;
  cell.className = 'info-empty';
  cell.textContent = text;
}

function shorten(text) {
  if (!text) return '—';
  return text.length > 16 ? `${text.slice(0, 16)}…` : text;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}
