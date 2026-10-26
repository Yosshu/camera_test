// 解像度・フレームレートの選択肢と、getUserMedia に渡す条件の組み立て。

export const RESOLUTIONS = [
  { value: 'auto', label: '自動（ブラウザに任せる）' },
  { value: '320x240', width: 320, height: 240, label: '320×240（QVGA）' },
  { value: '640x480', width: 640, height: 480, label: '640×480（VGA）' },
  { value: '1280x720', width: 1280, height: 720, label: '1280×720（HD）' },
  { value: '1920x1080', width: 1920, height: 1080, label: '1920×1080（フルHD）' },
  { value: '2560x1440', width: 2560, height: 1440, label: '2560×1440（WQHD）' },
  { value: '3840x2160', width: 3840, height: 2160, label: '3840×2160（4K）' },
];

export const FRAME_RATES = [
  { value: 'auto', label: '自動（ブラウザに任せる）' },
  { value: '15', fps: 15, label: '15 fps' },
  { value: '24', fps: 24, label: '24 fps' },
  { value: '30', fps: 30, label: '30 fps' },
  { value: '60', fps: 60, label: '60 fps' },
];

export function findResolution(value) {
  return RESOLUTIONS.find((option) => option.value === value) ?? RESOLUTIONS[0];
}

export function findFrameRate(value) {
  return FRAME_RATES.find((option) => option.value === value) ?? FRAME_RATES[0];
}

// 縮小・切り抜きの禁止（resizeMode）は Chrome / Edge 系だけが対応している
export function supportsNativeOnly() {
  return navigator.mediaDevices?.getSupportedConstraints?.().resizeMode === true;
}

export function buildVideoConstraints(settings, knownDeviceIds) {
  const constraints = {};
  if (settings.deviceId) {
    // 一覧で確かめた ID は厳密に、前回の記憶だけの ID は「できれば」で指定する
    constraints.deviceId = knownDeviceIds.has(settings.deviceId)
      ? { exact: settings.deviceId }
      : { ideal: settings.deviceId };
  }
  // 解像度とフレームレートは ideal で指定し、実際に選ばれた値を画面で確かめてもらう
  const resolution = findResolution(settings.resolution);
  if (resolution.width) {
    constraints.width = { ideal: resolution.width };
    constraints.height = { ideal: resolution.height };
  }
  const frameRate = findFrameRate(settings.frameRate);
  if (frameRate.fps) constraints.frameRate = { ideal: frameRate.fps };
  if (settings.nativeOnly && supportsNativeOnly()) constraints.resizeMode = { exact: 'none' };
  return Object.keys(constraints).length > 0 ? constraints : true;
}

// カメラが対応する範囲（getCapabilities）を超える選択肢か。範囲が分からなければ超えないものとする
export function exceedsResolution(option, capabilities) {
  const maxWidth = capabilities?.width?.max;
  const maxHeight = capabilities?.height?.max;
  if (!option.width || !maxWidth || !maxHeight) return false;
  // スマホの縦向きでは幅と高さが入れ替わるので、どちらの向きでも収まらないときだけ超えるとみなす
  const fits = (width, height) => width <= maxWidth && height <= maxHeight;
  return !fits(option.width, option.height) && !fits(option.height, option.width);
}

export function exceedsFrameRate(option, capabilities) {
  const max = capabilities?.frameRate?.max;
  if (!option.fps || !max) return false;
  return option.fps > max + 0.5;
}
