// アプリの起動と、画面とカメラの配線。
import { Camera } from './camera.js';
import {
  RESOLUTIONS, FRAME_RATES, findResolution, findFrameRate, supportsNativeOnly,
  buildVideoConstraints, exceedsResolution, exceedsFrameRate,
} from './constraints.js';
import { listCameras, watchCameras } from './devices.js';
import { checkEnvironment, describeError } from './errors.js';
import { renderInfo, renderRawData, formatResolution, formatFrameRate } from './info.js';
import { loadSettings, saveSettings } from './storage.js';

const elements = {
  frame: document.getElementById('video-frame'),
  video: document.getElementById('video'),
  status: document.getElementById('status'),
  cameraSelect: document.getElementById('camera-select'),
  resolutionSelect: document.getElementById('resolution-select'),
  frameRateSelect: document.getElementById('frame-rate-select'),
  nativeOnly: document.getElementById('native-only'),
  nativeOnlyHint: document.getElementById('native-only-hint'),
  toggleButton: document.getElementById('toggle-button'),
  message: document.getElementById('message'),
  messageTitle: document.getElementById('message-title'),
  messageDetail: document.getElementById('message-detail'),
  infoTable: document.getElementById('info-table'),
  rawData: document.getElementById('raw-data'),
};

const STATUS_TEXT = { idle: '停止中', starting: '起動中…', live: '表示中' };
const BUTTON_TEXT = { idle: 'カメラを開始', starting: '起動中…', live: 'カメラを停止' };

const camera = new Camera(elements.video);
const environmentProblem = checkEnvironment();
const settings = loadSettings();

let state = 'idle';
// 今のストリームを開いたときの要求。表示中の値と見比べるために取っておく
let activeRequest = null;
// 一覧で実在を確認できたカメラの ID
let knownDeviceIds = new Set();
// 一覧の更新が重なったとき、古い結果で上書きしないための番号
let listRequest = 0;

function setState(next) {
  state = next;
  elements.frame.dataset.state = state;
  elements.toggleButton.textContent = BUTTON_TEXT[state];
  elements.toggleButton.classList.toggle('button-primary', state !== 'live');
  elements.toggleButton.disabled = state === 'starting' || environmentProblem !== null;
  updateCameraInfo();
}

function showMessage({ title, detail }, kind = 'error') {
  elements.message.dataset.kind = kind;
  elements.messageTitle.textContent = title;
  elements.messageDetail.textContent = detail;
  elements.message.hidden = false;
}

function hideMessage() {
  elements.message.hidden = true;
}

function updateCameraInfo() {
  const track = state === 'live' ? camera.track : null;
  const { video } = elements;
  renderInfo(elements.infoTable, { track, video, request: activeRequest });
  renderRawData(elements.rawData, { track, request: activeRequest });
  markOptionsBeyondLimits(track?.getCapabilities?.() ?? null);

  if (track && video.videoWidth) {
    const fps = formatFrameRate(track.getSettings().frameRate);
    elements.status.textContent = `表示中 · ${formatResolution(video.videoWidth, video.videoHeight)} · ${fps}`;
    elements.frame.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
  } else {
    elements.status.textContent = STATUS_TEXT[state];
    elements.frame.style.aspectRatio = '';
  }
}

function fillOptions(select, options, value) {
  select.replaceChildren(...options.map((option) => new Option(option.label, option.value)));
  select.value = value;
}

// カメラの上限を超える選択肢に印を付ける。選べなくはしない（要求したら何が起きるか試せるように）
function markOptionsBeyondLimits(capabilities) {
  const mark = (select, options, exceeds) => {
    options.forEach((option, index) => {
      select.options[index].text = exceeds(option, capabilities) ? `${option.label}（上限超え）` : option.label;
    });
  };
  mark(elements.resolutionSelect, RESOLUTIONS, exceedsResolution);
  mark(elements.frameRateSelect, FRAME_RATES, exceedsFrameRate);
}

async function refreshCameraList() {
  const request = ++listRequest;
  let cameras;
  try {
    cameras = (await listCameras()).filter((device) => device.deviceId);
  } catch {
    cameras = [];
  }
  if (request !== listRequest) return;

  knownDeviceIds = new Set(cameras.map((device) => device.deviceId));
  const select = elements.cameraSelect;
  select.replaceChildren();

  if (cameras.length === 0) {
    // 許可を得る前は名前も ID も分からないので、選択肢を出せない
    select.append(new Option('既定のカメラ（開始後に選べます）', ''));
    select.disabled = true;
    return;
  }

  cameras.forEach((device, index) => {
    select.append(new Option(device.label || `カメラ ${index + 1}`, device.deviceId));
  });
  const selected = camera.track?.getSettings().deviceId ?? settings.deviceId;
  if (knownDeviceIds.has(selected)) select.value = selected;
  select.disabled = environmentProblem !== null;
}

async function startCamera() {
  hideMessage();
  setState('starting');
  const request = {
    resolution: findResolution(settings.resolution),
    frameRate: findFrameRate(settings.frameRate),
    constraints: buildVideoConstraints(settings, knownDeviceIds),
  };
  try {
    const stream = await camera.start(request.constraints);
    if (!stream) return;
    activeRequest = request;
    setState('live');
    settings.deviceId = camera.track.getSettings().deviceId;
    saveSettings(settings);
  } catch (error) {
    setState('idle');
    showMessage(describeError(error));
  }
  // 許可を得た後はカメラの名前が分かるようになるので、一覧を作り直す
  await refreshCameraList();
}

function stopCamera() {
  camera.stop();
  setState('idle');
}

// 設定を変えたら覚えておき、表示中ならその条件で開き直す
function changeSetting(key, value) {
  settings[key] = value;
  saveSettings(settings);
  if (state !== 'idle') startCamera();
}

camera.addEventListener('ended', () => {
  setState('idle');
  showMessage({
    title: 'カメラの映像が途切れました',
    detail: 'カメラが取り外されたか、OS やほかのアプリによって停止された可能性があります。',
  }, 'warning');
  refreshCameraList();
});

// 解像度が変わったとき（開始直後を含む）に表示を合わせる
elements.video.addEventListener('resize', updateCameraInfo);

elements.toggleButton.addEventListener('click', () => {
  if (camera.active) stopCamera();
  else startCamera();
});

elements.cameraSelect.addEventListener('change', () => changeSetting('deviceId', elements.cameraSelect.value));
elements.resolutionSelect.addEventListener('change', () => changeSetting('resolution', elements.resolutionSelect.value));
elements.frameRateSelect.addEventListener('change', () => changeSetting('frameRate', elements.frameRateSelect.value));
elements.nativeOnly.addEventListener('change', () => changeSetting('nativeOnly', elements.nativeOnly.checked));

fillOptions(elements.resolutionSelect, RESOLUTIONS, findResolution(settings.resolution).value);
fillOptions(elements.frameRateSelect, FRAME_RATES, findFrameRate(settings.frameRate).value);
elements.nativeOnly.checked = settings.nativeOnly === true;
if (!supportsNativeOnly()) {
  elements.nativeOnly.checked = false;
  elements.nativeOnly.disabled = true;
  elements.nativeOnlyHint.textContent = 'このブラウザでは指定できません（Chrome / Edge で使えます）。';
}

setState('idle');
if (environmentProblem) {
  showMessage(environmentProblem);
  elements.cameraSelect.append(new Option('利用できません', ''));
  elements.cameraSelect.disabled = true;
} else {
  watchCameras(refreshCameraList);
  refreshCameraList();
}

// テストでスクリプトが読み込めたことを確認できるよう印を付ける
document.body.dataset.app = 'ready';
